#!/usr/bin/env node
// NOTHING PRIVATE GOES TO THE PUBLIC REPOSITORY.
//
// This repository is public, and it is developed by agents working on one
// person's machine, inside that person's accounts. Everything they can see can
// end up in a commit: their conversations, a recording of a real session, a key
// in an environment variable, a path under somebody's home folder. Once pushed,
// it is copied, cached and indexed, and a later deletion does not unpublish it.
// So this runs before every push and refuses one that carries any of that.
//
// Two passes.
//  1. RULES, always, and they decide. Keys and tokens by their real shapes,
//     files that are private by their paths, recordings of real sessions, home
//     folders, the words in a private list kept OUTSIDE the repo (a name, an
//     email, an account id: the list itself would leak if it were committed),
//     and settings that switch off a security boundary. Quotes are NOT refused
//     (2026-10-01): a quote of design feedback holds no secret, and the rule
//     was stopping merges all day. A quote that names her is caught by the
//     private list like any other line.
//  2. A REVIEW BY A MODEL. It reads
//     the added lines and flags what the rules cannot know: a pasted chat, a
//     customer's name, a comment describing somebody's private data. If it
//     cannot run, the push is not refused on its account; the rules still hold.
//
// From the hook, it runs only when the push goes to the repository named in
// package.json's `repository.url`; a push anywhere else is let through
// unchecked. Only what the push ADDS is checked, so a problem already on the remote does
// not block unrelated work; audit the whole tree with --all.
//
// A line that must say something a rule matches (a test that proves a fake key
// is rejected) carries `public-check: allow` on the same line.
//
// Usage:
//   git pre-push:  node scripts/check-before-public.mjs <remote> <url>  < refs
//   by hand:       node scripts/check-before-public.mjs --range A..B [--llm]
//   whole tree:    node scripts/check-before-public.mjs --all [--llm --chunks 100]
//
// The model reads at most --chunks pieces of 120 KB (default 8, about 1 MB)
// and says how many it skipped. A whole-tree read is about 85.
//
// The private words live in ~/.agentbox/private-words.txt, one per line,
// matched as whole words ignoring case. AGENTBOX_PRIVATE_WORDS points elsewhere.
// AGENTBOX_PUBLIC_CHECK_LLM=0 skips the model review; =1 forces it.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ZERO = /^0+$/;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const ALLOW = /public-check:\s*allow/;
const MAX_BLOB = 1024 * 1024;

const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], ...opts });

const exists = (rev) => {
  try { git(['cat-file', '-e', `${rev}^{commit}`]); return true; } catch { return false; }
};

// ---------------------------------------------------------------------------
// The rules.

/** Keys and tokens, by the shapes their issuers actually give them. Long
 * enough that a test's stand-in (`sk-ant-not-real`) does not match. */
export const SECRETS = [
  ['Anthropic key', /sk-ant-(?:api|admin|oat)\d{2}-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['Stripe secret', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}|\bwhsec_[A-Za-z0-9]{24,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['PostHog key', /\bph[cx]_[A-Za-z0-9]{30,}/],
  ['private key', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['credential in a URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:[^\s@/'"`]{8,}@[^\s'"`]+/i],
];

/** Files that are private by what they are, whatever is in them. */
export const PRIVATE_PATHS = [
  ['an environment file', /(^|\/)\.env(\.(?!example$|sample$)[^/]*)?$/],
  ['local app config', /(^|\/)zero\.config\.json$/],
  ['the operator\'s standing instructions', /(^|\/)briefs\/founder\.md$/],
  ['an inbox ledger', /(^|\/)work-items\.jsonl$/],
  ['a product\'s private notes', /(^|\/)(decisions|STATE)\.md$/],
  ['local Claude Code settings or history', /(^|\/)\.claude\/(settings\.local\.json|projects\/|todos\/|history)/],
  ['a key or certificate', /\.(pem|p12|p8|pfx|key|mobileprovision)$|(^|\/)id_(rsa|ed25519|ecdsa)$/],
  ['a screen or audio recording', /\.(mov|mp4|m4v|webm|m4a|wav|cast)$/i],
];

/** Settings that switch off a security boundary. */
export const INSECURE = [
  ['TLS verification switched off', /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/],
  ['Electron web security off', /webSecurity\s*:\s*false|allowRunningInsecureContent\s*:\s*true/],
  ['Node in the renderer', /nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false/],
  ['a download piped into a shell', /\b(?:curl|wget)\b[^|\n]*https?:\/\/[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/],
  ['world-writable permissions', /chmod\s+(?:-R\s+)?0?777\b/],
];

/** The home folder of whoever is pushing. Not every `/Users/<name>`: the
 * tests are full of made-up people (`/Users/you`, `/Users/leon`), and a rule
 * that fires on all of them gets switched off. The one that leaks is the real
 * one, and this machine knows which that is. */
const HOME_DIR = os.homedir();
const HOME = new RegExp(`${escapeRe(HOME_DIR)}(?![A-Za-z0-9._-])`);
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function readPrivateWords(file = process.env.AGENTBOX_PRIVATE_WORDS ?? path.join(os.homedir(), '.agentbox', 'private-words.txt')) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

const wordRe = (w) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(w)}(?![A-Za-z0-9])`, 'i');

/**
 * Every rule against one added line. `soft` is set when the line is not known
 * to be new (a whole-tree audit); no rule reads it since quotes stopped being
 * one, and it is kept so callers need not change.
 */
export function checkLine(file, text, { words = [], soft = false } = {}) {
  if (ALLOW.test(text)) return [];
  const out = [];
  const hit = (severity, why) => out.push({ severity, why });
  for (const [name, re] of SECRETS) if (re.test(text)) hit('block', `looks like a real ${name}`);
  if (HOME.test(text)) hit('block', 'names a real home folder');
  for (const w of words) if (wordRe(w).test(text)) hit('block', 'carries a word from the private list');
  for (const [name, re] of INSECURE) if (re.test(text)) hit('block', name);
  return out;
}

/** A recording of a real Claude Code session carries its machine's setup. */
export function checkRecording(file, content) {
  if (!/\.jsonl$/.test(file)) return [];
  for (const line of content.split('\n')) {
    if (!line.includes('"init"')) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.subtype !== 'init') continue;
    const personal = ['mcp_servers', 'skills', 'plugins'].filter((k) => Array.isArray(d[k]) && d[k].length);
    if (personal.length) {
      return [{ severity: 'block', why: `a recorded session listing its machine's ${personal.join(', ')}; empty them` }];
    }
  }
  return [];
}

export function checkPath(file) {
  return PRIVATE_PATHS.filter(([, re]) => re.test(file)).map(([name]) => ({ severity: 'block', why: `is ${name}` }));
}

// ---------------------------------------------------------------------------
// What a push adds.

/** Added lines per file between two commits, from a zero-context diff. */
function addedLines(base, head) {
  const diff = git(['diff', '--no-color', '--no-ext-diff', '--no-renames', '-U0', base, head]);
  const files = new Map();
  let file = null;
  let lineNo = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.slice(6);
      if (file && !files.has(file)) files.set(file, []);
    } else if (line.startsWith('@@')) {
      lineNo = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
    } else if (file && line.startsWith('+')) {
      files.get(file).push([lineNo++, line.slice(1)]);
    }
  }
  return files;
}

/** Every text line in a commit's tree, for an audit or an unknown base. */
function allLines(rev) {
  const files = new Map();
  for (const file of git(['ls-tree', '-r', '--name-only', rev]).split('\n').filter(Boolean)) {
    let body;
    try {
      const size = Number(git(['cat-file', '-s', `${rev}:${file}`]).trim());
      if (size > MAX_BLOB) { files.set(file, []); continue; }
      body = git(['show', `${rev}:${file}`]);
    } catch { continue; }
    if (body.includes('\0')) { files.set(file, []); continue; }
    files.set(file, body.split('\n').map((t, i) => [i + 1, t]));
  }
  return files;
}

function commitsIn(base, head) {
  const range = base === EMPTY_TREE ? [head, '-n', '50'] : [`${base}..${head}`];
  const raw = git(['log', '--format=%H%x00%ae%x00%ce%x00%B%x1e', ...range]);
  return raw.split('\x1e').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [sha, author, committer, message] = s.split('\0');
    return { sha, author, committer, message };
  });
}

export function scan({ base, head, soft = false, words = readPrivateWords() }) {
  const findings = [];
  const files = base === EMPTY_TREE ? allLines(head) : addedLines(base, head);
  for (const [file, lines] of files) {
    for (const f of checkPath(file)) findings.push({ file, line: 0, ...f });
    const content = lines.map(([, t]) => t).join('\n');
    for (const f of checkRecording(file, content)) findings.push({ file, line: 0, ...f });
    for (const [n, text] of lines) {
      for (const f of checkLine(file, text, { words, soft })) findings.push({ file, line: n, ...f });
    }
  }
  for (const c of commitsIn(base, head)) {
    const where = `commit ${c.sha.slice(0, 8)}`;
    for (const email of new Set([c.author, c.committer])) {
      if (words.some((w) => wordRe(w).test(email))) findings.push({ file: where, line: 0, severity: 'block', why: `is signed with a private email; use your noreply address` });
    }
    for (const text of c.message.split('\n')) {
      for (const f of checkLine('', text, { words, soft })) findings.push({ file: where, line: 0, ...f });
    }
  }
  return { findings, files };
}

// ---------------------------------------------------------------------------
// The review by a model.

export const PROMPT = `You are reviewing lines about to be pushed to a PUBLIC open-source repository.
The code is written by AI agents working on one person's machine and accounts, so personal
material leaks into it easily. Flag ONLY things that should not be public:
- pasted conversations or chat logs that carry private details (quoting a person's
  feedback or design notes is fine and allowed, unless it names them)
- names, emails, phone numbers, addresses, or account ids of real people or customers
- descriptions of someone's private data, finances, health, or private business
- credentials, keys, tokens, passwords, internal URLs with secrets
- paths or identifiers from a specific person's machine
- code that disables a security protection or opens an obvious hole
Do NOT flag: ordinary code, generic comments, placeholder or obviously fake values,
test fixtures with made-up data, the project's own public name or public URLs.
Answer with JSON only, no prose:
{"findings":[{"file":"path","line":123,"severity":"block|warn","why":"one short sentence"}]}
Use "block" only when you are confident it is private or a real secret. Empty list if clean.

Lines follow, as "path:line: text".
`;

function runModel(input) {
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', '--model', 'sonnet', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 5 * 60 * 1000);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
      try { resolve(JSON.parse(json).findings ?? []); } catch { resolve(null); }
    });
    child.stdin.end(PROMPT + input);
  });
}

export async function reviewByModel(files, maxChunks = 8) {
  const CHUNK = 120 * 1024;
  const chunks = [''];
  for (const [file, lines] of files) {
    for (const [n, text] of lines) {
      const row = `${file}:${n}: ${text.slice(0, 400)}\n`;
      if (chunks.at(-1).length + row.length > CHUNK) chunks.push('');
      chunks[chunks.length - 1] += row;
    }
  }
  const work = chunks.filter(Boolean).slice(0, maxChunks);
  if (!work.length) return { findings: [], ran: true, skipped: 0 };
  // Eight at a time, so a whole-tree read does not start eighty sessions at once.
  const results = [];
  for (let i = 0; i < work.length; i += 8) results.push(...await Promise.all(work.slice(i, i + 8).map(runModel)));
  if (results.some((r) => r === null)) return { findings: results.flat().filter(Boolean), ran: false, skipped: 0 };
  return { findings: results.flat(), ran: true, skipped: Math.max(0, chunks.filter(Boolean).length - work.length) };
}

// ---------------------------------------------------------------------------
// Running it.

function publicUrl() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(git(['rev-parse', '--show-toplevel']).trim(), 'package.json'), 'utf8'));
    return (pkg.repository?.url ?? '').replace(/^git\+/, '');
  } catch { return ''; }
}

const norm = (u) => u.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '').toLowerCase();

function print(findings, title) {
  const shown = findings.slice(0, 40);
  console.error(`\n  ${title}\n`);
  for (const f of shown) console.error(`    ${f.file}${f.line ? `:${f.line}` : ''}  ${f.why}`);
  if (findings.length > shown.length) console.error(`    ...and ${findings.length - shown.length} more`);
}

async function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => args.includes(name);
  const pushes = [];
  let toPublic = false;

  if (flag('--all')) {
    pushes.push({ base: EMPTY_TREE, head: 'HEAD', soft: true });
  } else if (args.includes('--range')) {
    const [base, head] = args[args.indexOf('--range') + 1].split('..');
    pushes.push({ base, head: head || 'HEAD' });
  } else {
    // A pre-push hook: `<remote> <url>` as arguments, refs on stdin.
    const url = args[1] ?? '';
    const pub = publicUrl();
    toPublic = Boolean(url && pub && norm(url) === norm(pub));
    const input = fs.readFileSync(0, 'utf8');
    // ONLY A PUSH TO THE PUBLIC REPOSITORY IS CHECKED. A private remote is
    // allowed to hold what the public one may not (a maintainer's own signed
    // email, for one), and refusing those pushes would only teach people to
    // skip the hook.
    if (!toPublic) {
      console.log('check-before-public: not the public repository, so not checked.');
      return 0;
    }
    for (const line of input.split('\n')) {
      const [, localSha, , remoteSha] = line.trim().split(/\s+/);
      if (!localSha || ZERO.test(localSha)) continue;
      // Git only ever sends commits that exist. One that does not is a test's
      // stand-in, and there is nothing to read.
      if (!exists(localSha)) continue;
      if (remoteSha && !ZERO.test(remoteSha) && exists(remoteSha)) {
        pushes.push({ base: remoteSha, head: localSha });
        continue;
      }
      // A new branch, or a remote tip this clone has never fetched. Compare
      // against what is already on that remote, else read the whole tree.
      let base = EMPTY_TREE;
      try {
        const boundary = git(['rev-list', '--boundary', localSha, '--not', `--remotes=${args[0] ?? 'origin'}`])
          .split('\n').find((l) => l.startsWith('-'));
        if (boundary) base = boundary.slice(1);
      } catch {}
      pushes.push({ base, head: localSha, soft: base === EMPTY_TREE });
    }
  }

  const env = process.env.AGENTBOX_PUBLIC_CHECK_LLM;
  const useModel = env === '1' || flag('--llm') || (env !== '0' && !flag('--no-llm') && toPublic);

  let blocked = [];
  let warned = [];
  for (const p of pushes) {
    const { findings, files } = scan(p);
    blocked.push(...findings.filter((f) => f.severity === 'block'));
    warned.push(...findings.filter((f) => f.severity !== 'block'));
    if (useModel) {
      console.log('check-before-public: a model is reading what this push adds...');
      const r = await reviewByModel(files, args.includes('--chunks') ? Number(args[args.indexOf('--chunks') + 1]) : 8);
      if (!r.ran) console.error('  check-before-public: the model review could not run, so only the rules were applied.');
      if (r.skipped) console.error(`  check-before-public: ${r.skipped} part(s) of a very large push were not read by the model.`);
      const tagged = r.findings.map((f) => ({ ...f, why: `model: ${f.why}` }));
      blocked.push(...tagged.filter((f) => f.severity === 'block'));
      warned.push(...tagged.filter((f) => f.severity !== 'block'));
    }
  }

  if (warned.length) print(warned, `check-before-public: ${warned.length} thing(s) worth a look, not blocking:`);
  if (blocked.length) {
    print(blocked, `PUSH REFUSED. ${blocked.length} thing(s) should not go to a public repository:`);
    console.error('\n  Take them out and push again. A line that must say it on purpose');
    console.error('  (a test proving a fake key is rejected) can carry `public-check: allow`.\n');
    return 1;
  }
  console.log(`check-before-public: nothing private in ${pushes.length ? 'this push' : 'an empty push'}.`);
  return 0;
}

// Real paths on both sides: on macOS /tmp is a link to /private/tmp, and a
// plain comparison made this script exit 0 having checked nothing whenever the
// hook reached it through the link.
const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && fs.realpathSync(fileURLToPath(import.meta.url)) === invoked) {
  main(process.argv).then((code) => process.exit(code), (err) => {
    console.error(`check-before-public failed to run: ${err.message}`);
    process.exit(1);
  });
}
