// Pure. Turns a tool call into the line a thread shows for it. The full string
// is always one press away on the line, so shortening here never loses it.

// Plain words, not tool names. Edit is "changed" because a reader who is not a
// programmer takes "edited" to mean a document was revised.
const VERBS = {
  Bash: 'ran',
  Read: 'read',
  Write: 'wrote',
  Edit: 'changed',
  MultiEdit: 'changed',
  NotebookEdit: 'changed',
  Glob: 'looked for',
  Grep: 'searched for',
  WebFetch: 'fetched',
  WebSearch: 'searched the web for',
  Task: 'sent off a helper',
  TodoWrite: 'kept its list',
  ListAgents: 'listed the other sessions',
  SendMessage: 'messaged',
  ToolSearch: 'looked up a tool',
  Skill: 'used a skill',
  AskUserQuestion: 'asked a question',
  BashOutput: 'checked on a command',
  KillShell: 'stopped a command',
  ExitPlanMode: 'finished planning',
};

// An MCP tool name is `mcp__<server>__<tool>` and the server name may itself
// hold underscores (`mcp__plugin_paper-desktop_paper__write_html`), so the tool
// is what follows the last double underscore.
export function workVerb(name) {
  const n = String(name ?? '').trim();
  if (!n) return 'did something';
  if (VERBS[n]) return VERBS[n];
  const mcp = n.startsWith('mcp__') ? n.slice(n.lastIndexOf('__') + 2) : n;
  return mcp.replace(/_+/g, ' ').trim().toLowerCase() || 'did something';
}

// A path is shortened from the end, where the file name is. Three segments
// hold the whole of most paths inside a repo.
const PATH_SEGMENTS = 3;

// `home` has no default on purpose: with none given, a path is shown whole
// rather than shortened against a guess at whose machine this is.
export function shortPath(raw, cwd = '', home = '') {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (!s.startsWith('/') && !s.startsWith('~')) return s;

  let p = s;
  // On macOS `/tmp` is a link to `/private/tmp`; show the one people type.
  p = p.replace(/^\/private\/tmp\//, '/tmp/');

  const base = String(cwd ?? '').replace(/^\/private\/tmp\//, '/tmp/').replace(/\/+$/, '');
  if (base && (p === base || p.startsWith(`${base}/`))) {
    const rel = p === base ? '' : p.slice(base.length + 1);
    return rel ? trimSegments(rel) : './';
  }

  const h = String(home ?? '').replace(/\/+$/, '');
  if (h && p.startsWith(`${h}/`)) p = `~/${p.slice(h.length + 1)}`;

  return trimSegments(p);
}

// The leading `…/` says segments were dropped. Without it `components/Tweaks.tsx`
// would read as a path from the root of something.
function trimSegments(p) {
  // The lead is kept when nothing is trimmed, because `/x/store.mjs` and
  // `x/store.mjs` are different files.
  const lead = p.startsWith('~/') ? '~/' : p.startsWith('/') ? '/' : '';
  const body = p.slice(lead.length);
  const parts = body.split('/').filter(Boolean);
  if (parts.length <= PATH_SEGMENTS) return lead + parts.join('/');
  return `…/${parts.slice(-PATH_SEGMENTS).join('/')}`;
}

// The interesting part of a command is never at the front, and an ellipsis cuts
// from the right. So these preludes come off the front, one at a time, until
// what is left is the command that ran. If nothing is left, the original stands.
const PRELUDE = [
  // cd <path> && |; | \n
  /^cd\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;|\n)\s*/,
  // export NAME=<value> && |; | \n (value may be quoted and may hold; or &)
  /^export\s+[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s;&]*)\s*(?:&&|;|\n)\s*/,
  // NAME=<value> && |; | \n (a bare assignment, same shapes)
  /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s;&]*)\s*(?:&&|;|\n)\s*/,
  // source|. <file> && |; | \n
  /^(?:source|\.)\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;|\n)\s*/,
  // echo "=== a banner ===" && |; | \n
  // Only a banner, marked by `===` or `---`. A plain `echo` may be the whole of
  // what ran, so it stays.
  /^echo\s+(?:"[^"]*(?:===|---)[^"]*"|'[^']*(?:===|---)[^']*')\s*(?:&&|;|\n)\s*/,
];

// Everything from a heredoc marker onward becomes an ellipsis, so the line
// names the program that was fed a script without printing the script.
const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1([\s\S]*)$/;

// When the command before the marker is this short (`python3 -`), the script's
// first line comes with it. That line usually names the file, and without it a
// row of `python3 - …` lines cannot be told apart.
const HEREDOC_HEAD = 12;

function firstScriptLine(body, marker) {
  for (const line of String(body ?? '').split('\n')) {
    const t = line.trim();
    // The closing marker is not a line of the script. It is matched exactly,
    // because a one-word line of script looks just like one.
    if (!t || t === marker) continue;
    if (t.startsWith('#') || t.startsWith('//')) continue;
    return t;
  }
  return '';
}

export function plainCommand(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const whole = s;

  // Repeated, because `cd x && export Y=z && npm test` has two preludes.
  for (let i = 0; i < 6; i += 1) {
    const before = s;
    for (const re of PRELUDE) s = s.replace(re, '');
    if (s === before) break;
  }
  const doc = s.match(HEREDOC);
  if (doc) {
    const head = s.slice(0, doc.index).trim();
    const first = head.length <= HEREDOC_HEAD ? firstScriptLine(doc[3], doc[2]) : '';
    s = first ? `${head} … ${first}` : `${head} …`;
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s || whole.replace(/\s+/g, ' ').trim();
}

// The store's own bookkeeping is not shown. Claiming an item, writing its
// status back and listing what is there are how a session tells the app it is
// running. Reading or writing a document is the work, and stays on screen.
const BOOKKEEPING = new Set([
  'claim_work_item', 'release_work_item', 'update_work_item',
  'list_work_items', 'list_documents', 'list_products', 'list_skills',
  'list_chats', 'get_product',
]);

// A Claude transcript writes `mcp__<server>__<tool>`, with the server named
// after the product, and Codex reports the bare tool. `ToolSearch` is Claude
// Code loading a tool's schema.
export function isBookkeeping(name) {
  const n = String(name ?? '').trim();
  if (!n) return false;
  if (n === 'ToolSearch') return true;
  return BOOKKEEPING.has(n.startsWith('mcp__') ? n.slice(n.lastIndexOf('__') + 2) : n);
}

// A shell command in words: `cat README.md; echo ---; cat package.json` reads
// "read README.md and package.json". A wrong verb is worse than the raw
// command, so every segment must be recognised and all must agree on one verb,
// or the line stays the command. `doing` is the same verb for the live line
// under a running row, in the same table so the two cannot drift.

// Scaffolding between the real steps of a line. A banner, a `cd`, a wait.
const NOISE = new Set(['echo', 'cd', 'pwd', 'true', 'false', ':', 'sleep', 'clear', 'date', 'printf', 'set']);

// `2>&1` and `2>/dev/null` say nothing about what ran. Any other redirect reads
// or writes a file this does not account for, so it gives up rather than guess.
const QUIET_REDIRECT = /^[0-9]*>>?&?(?:[0-9]+|\/dev\/null)$/;

const FAMILIES = [
  { verb: 'read', doing: 'Reading', heads: ['cat', 'head', 'tail', 'less', 'more', 'nl', 'bat'], take: 'files', skip: ['-n', '-c', '-m'] },
  { verb: 'counted the lines in', doing: 'Counting the lines in', heads: ['wc'], take: 'files' },
  { verb: 'searched for', doing: 'Searching for', heads: ['grep', 'rg', 'ag', 'ack'], take: 'first', many: 'things', skip: ['-e', '-m', '-A', '-B', '-C'] },
  { verb: 'listed', doing: 'Listing', heads: ['ls'], take: 'files', empty: './', many: 'folders' },
  { verb: 'looked for', doing: 'Looking for', heads: ['find', 'fd'], take: 'named', many: 'things' },
  { verb: 'copied', doing: 'Copying', heads: ['cp'], take: 'files' },
  { verb: 'moved', doing: 'Moving', heads: ['mv'], take: 'files' },
  { verb: 'deleted', doing: 'Deleting', heads: ['rm'], take: 'files' },
  { verb: 'made a folder', doing: 'Making a folder', heads: ['mkdir'], take: 'files', many: 'folders', plural: { verb: 'made folders', doing: 'Making folders' } },
  { verb: 'made a file', doing: 'Making a file', heads: ['touch'], take: 'files', plural: { verb: 'made files', doing: 'Making files' } },
  { verb: 'fetched', doing: 'Fetching', heads: ['curl', 'wget'], take: 'url', many: 'pages', skip: ['-o', '-w', '-H', '-X', '-d', '-u', '-A', '-e', '-F', '--output', '--header', '--data'] },
];
const BY_HEAD = new Map();
for (const family of FAMILIES) for (const head of family.heads) BY_HEAD.set(head, family);

// Subcommands not listed keep their command, because a vague verb over
// `git merge-base` says less than the command does.
const GIT = {
  status: { verb: 'checked what changed', doing: 'Checking what changed' },
  diff: { verb: 'checked what changed', doing: 'Checking what changed' },
  log: { verb: 'read the code history', doing: 'Reading the code history' },
  show: { verb: 'read the code history', doing: 'Reading the code history' },
  blame: { verb: 'read the code history', doing: 'Reading the code history' },
  add: { verb: 'saved the changes', doing: 'Saving the changes' },
  commit: { verb: 'saved the changes', doing: 'Saving the changes' },
  branch: { verb: 'looked at the branches', doing: 'Looking at the branches' },
  push: { verb: 'pushed the branch', doing: 'Pushing the branch' },
  fetch: { verb: 'fetched the latest code', doing: 'Fetching the latest code' },
  pull: { verb: 'fetched the latest code', doing: 'Fetching the latest code' },
  merge: { verb: 'merged the branch', doing: 'Merging the branch' },
  checkout: { verb: 'switched branch', doing: 'Switching branch' },
  switch: { verb: 'switched branch', doing: 'Switching branch' },
};

const TESTS = { verb: 'ran the tests', doing: 'Running the tests', many: 'test files' };
const SCRIPT = { verb: 'ran a script', doing: 'Running a script', many: 'scripts' };
const RUNNERS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bun']);
const SHELLS = new Set(['sh', 'bash', 'zsh', '/bin/sh', '/bin/bash', '/bin/zsh']);
const SCRIPTS = new Set(['node', 'python', 'python3', 'ruby', 'osascript', 'deno', 'tsx']);
const TEST_RUNNERS = new Set(['vitest', 'jest', 'pytest', 'mocha', 'ava']);
const TEST_FILE = /\.(?:test|spec)\.[a-z]+$/;

const lastSegment = (file) => String(file).split('/').filter(Boolean).pop() ?? '';

function unquote(token) {
  const t = String(token);
  if (t.length > 1 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1);
  return t;
}

// Splits only outside quotes: a `;` inside a sed script or a grep pattern is
// not a new command.
function splitOutside(text, separators) {
  const out = [];
  let buffer = '';
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      buffer += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buffer += ch; continue; }
    const pair = text.slice(i, i + 2);
    if (separators.includes(pair)) { out.push(buffer); buffer = ''; i += 1; continue; }
    if (separators.includes(ch)) { out.push(buffer); buffer = ''; continue; }
    buffer += ch;
  }
  out.push(buffer);
  return out.map((part) => part.trim()).filter(Boolean);
}

const tokens = (segment) => splitOutside(segment, [' ', '\t']);
const isFlag = (token) => token.startsWith('-') && token !== '-';
const looksLikeAFile = (token) => /[./]/.test(token) && !token.startsWith('-');

// The arguments of one stage, with the quiet redirects and the flag values
// dropped. Null when something is there that this file cannot account for.
function argumentsOf(words, skip = []) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const raw = words[i];
    const quoted = raw[0] === '"' || raw[0] === "'";
    const token = unquote(raw);
    if (!quoted) {
      if (QUIET_REDIRECT.test(token)) continue;
      // Any other redirect, a subshell or backticks is a shape this cannot read.
      if (/[<>`]/.test(token) || token.includes('$(')) return null;
    }
    if (isFlag(token)) {
      if (skip.includes(token)) i += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

// One stage of one segment, as a verb and the things it names, or 'noise', or
// null for "this file does not know".
function stageWords(stage, cwd, home) {
  const words = tokens(stage);
  if (!words.length) return 'noise';
  const head = unquote(words[0]);
  const rest = words.slice(1);
  if (NOISE.has(head)) {
    // `echo something > a file` writes a file, so it is not noise.
    const args = argumentsOf(rest);
    return args === null ? null : 'noise';
  }
  // `timeout 300 npx vitest …` and `arch -arm64 node …` are the real command
  // with a wrapper in front of it.
  if (head === 'timeout' || head === 'nice' || head === 'arch' || head === 'env') {
    const inner = rest.filter((w) => !isFlag(unquote(w)) && !/^[0-9]+$/.test(unquote(w)));
    return inner.length ? stageWords(inner.join(' '), cwd, home) : null;
  }
  // A shell asked to run a string: the string is the command.
  if (SHELLS.has(head)) {
    const flag = rest.findIndex((w) => /^-[a-z]*c$/.test(unquote(w)));
    if (flag < 0 || !rest[flag + 1]) return null;
    const words2 = commandWork(unquote(rest[flag + 1]), cwd, home);
    return words2 ? { ...words2, names: words2.subject ? [words2.subject] : [], whole: true } : null;
  }
  if (head === 'git') return gitWords(rest, cwd, home);
  if (head === 'sed' || head === 'perl') return sedWords(rest, cwd, home);
  if (RUNNERS.has(head)) return runnerWords(rest, cwd, home);
  if (SCRIPTS.has(head) || /\.(?:sh|mjs|js|py)$/.test(head)) {
    const args = argumentsOf(rest);
    if (args === null) return null;
    // `python3 - <<'PY'` has no file name. `plainCommand` put the script's
    // first line after the ellipsis, and that line tells these apart.
    if (stage.includes('…')) {
      const first = stage.slice(stage.lastIndexOf('…') + 1).trim();
      return { ...SCRIPT, names: first ? [first] : [] };
    }
    const file = args.find(looksLikeAFile);
    return { ...SCRIPT, names: file ? [lastSegment(file)] : [] };
  }
  if (TEST_RUNNERS.has(head)) return testWords(rest);
  if (head === 'tsc') return { verb: 'checked the types', doing: 'Checking the types', names: [] };
  if (head === 'eslint') return { verb: 'checked the code style', doing: 'Checking the code style', names: [] };
  const family = BY_HEAD.get(head);
  if (!family) return null;
  const args = argumentsOf(rest, family.skip);
  if (args === null) return null;
  return { ...family, names: namesFor(family, args, cwd, home) };
}

const URL_LIKE = /^(?:https?:\/\/|www\.|localhost|127\.0\.0\.1)/;

function namesFor(family, args, cwd, home) {
  if (family.take === 'first') return args.slice(0, 1);
  // The URL is not always the first argument, as in
  // `curl -s -o /dev/null -w '%{http_code}' <url>`.
  if (family.take === 'url') {
    const url = args.find((a) => URL_LIKE.test(a));
    return url ? [url] : args.slice(0, 1);
  }
  if (family.take === 'named') {
    const named = args.find((a) => /[*?]/.test(a));
    return named ? [named] : args.slice(0, 1).map((a) => shortPath(a, cwd, home));
  }
  const files = args.filter(looksLikeAFile).map((a) => shortPath(a, cwd, home));
  if (!files.length) return family.empty ? [family.empty] : [];
  return files;
}

// Keeps what the subcommand named (the file, the branch or the message),
// because a bare verb tells a developer less than the command did.
function gitWords(rest, cwd, home) {
  const words = [...rest];
  // `git -C <path> <subcommand>`: the folder is not the verb.
  while (words.length && isFlag(unquote(words[0]))) {
    const flag = unquote(words.shift());
    if (flag === '-C' || flag === '--git-dir' || flag === '--work-tree') words.shift();
  }
  const sub = unquote(words[0] ?? '');
  const known = GIT[sub];
  if (!known) return null;
  return { ...known, names: gitNames(sub, words.slice(1), cwd, home) };
}

// Not a ref: the remote it went to, and the `--` that ends the flags.
const NOT_A_REF = new Set(['origin', 'upstream', '.', '--', 'HEAD']);

function gitNames(sub, rest, cwd, home) {
  if (sub === 'commit') {
    // The message is absent when it came in on stdin (`git commit -F -`).
    const at = rest.findIndex((w) => unquote(w) === '-m' || unquote(w) === '--message');
    const message = at >= 0 ? unquote(rest[at + 1] ?? '') : '';
    return message ? [message] : [];
  }
  const args = argumentsOf(rest, ['-m', '--message', '-C', '-S']);
  if (args === null) return [];
  if (sub === 'push' || sub === 'merge' || sub === 'checkout' || sub === 'switch' || sub === 'fetch' || sub === 'pull') {
    const refs = args.filter((a) => a && !NOT_A_REF.has(a));
    return refs.length ? [refs[refs.length - 1]] : [];
  }
  const files = args.filter(looksLikeAFile).map((a) => shortPath(a, cwd, home));
  // A history command often names something that is not a path, like
  // `git log --grep <word>`, so the first argument is kept when no file is.
  if (files.length) return files;
  return args.length ? [args[0]] : [];
}

// The leading quote survives on a line the trace cut mid-string.
const SED_SCRIPT = /^['"]?[0-9,$]*[a-zA-Z]?[/#|]/;

function sedWords(rest, cwd, home) {
  const args = argumentsOf(rest);
  if (args === null) return null;
  const flags = rest.map(unquote).filter(isFlag);
  const inPlace = flags.some((f) => f.startsWith('-i'));
  // The file is the last argument that is not a sed script. A trace line is cut
  // at 200 characters, so the file may be missing and the script (`s#a#b#`)
  // is then the last thing that looks like a path.
  const file = [...args].reverse().find((a) => looksLikeAFile(a) && !SED_SCRIPT.test(a));
  if (inPlace) {
    return file ? { verb: 'changed', doing: 'Changing', names: [shortPath(file, cwd, home)] } : null;
  }
  // `sed -n 1,200p <file>` is how an agent reads part of a file.
  if (!flags.some((f) => f === '-n' || f === '-e' || f === '-E')) return null;
  return file ? { verb: 'read', doing: 'Reading', names: [shortPath(file, cwd, home)] } : null;
}

function runnerWords(rest, cwd, home) {
  const words = rest.map(unquote).filter((w) => w !== '--yes' && w !== '-y' && w !== '-s');
  let tool = words[0] ?? '';
  if (tool === 'run' || tool === 'exec') tool = words[1] ?? '';
  // `npx vitest@4` and `npx hyperframes@0.8.77` name a version, not a tool.
  tool = tool.replace(/@[^@/]*$/, '');
  if (tool === 'test' || TEST_RUNNERS.has(tool)) return testWords(words.slice(1));
  if (tool === 'tsc' || tool === 'typecheck') return { verb: 'checked the types', doing: 'Checking the types', names: [] };
  if (tool === 'eslint' || tool === 'lint') return { verb: 'checked the code style', doing: 'Checking the code style', names: [] };
  if (tool === 'build' || (tool === 'vite' && words.includes('build'))) {
    return { verb: 'built the app', doing: 'Building the app', names: [] };
  }
  if (tool === 'install' || tool === 'ci' || tool === 'i') {
    return { verb: 'installed the packages', doing: 'Installing the packages', names: [] };
  }
  if (SCRIPTS.has(tool)) return stageWords(words.join(' '), cwd, home);
  return null;
}

// A trace line is cut at 200 characters, so the last test file on a long
// `vitest run a b c` often arrives without its extension. Anything that looks
// like a path counts.
function testWords(rest) {
  const args = rest.map(unquote).filter((w) => !isFlag(w) && w !== 'run');
  const files = args.filter((w) => TEST_FILE.test(w) || w.includes('/'));
  return { ...TESTS, names: files.map(lastSegment) };
}

// Up to three names, then a count that says what it counted, so the cap is
// never silent.
function joinNames(names, many = 'files') {
  const list = [...new Set(names.filter(Boolean))];
  if (!list.length) return '';
  if (list.length > 3) return `${list.length} ${many}`;
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * What a shell command did, in words, or null to leave it as the command.
 *
 * `cwd` and `home` are the session's folder and the machine's home, passed on
 * to `shortPath`.
 */
export function commandWork(raw, cwd = '', home = '') {
  const command = plainCommand(raw);
  if (!command) return null;
  const steps = [];
  for (const segment of splitOutside(command, ['&&', '||', ';', '\n'])) {
    // A pipeline's first stage is what ran; the rest is plumbing that shapes
    // its output (`| head`, `| sort | uniq -c`).
    const stage = splitOutside(segment, ['|'])[0] ?? '';
    const read = stageWords(stage, cwd, home);
    if (read === null) return null;
    if (read !== 'noise') steps.push(read);
  }
  if (!steps.length) return null;
  const first = steps[0];
  if (steps.some((step) => step.verb !== first.verb)) return null;
  if (first.whole) return { verb: first.verb, doing: first.doing, subject: first.names[0] ?? '' };
  const names = [...new Set(steps.flatMap((step) => step.names).filter(Boolean))];
  // "Made a folder, 4 folders" is the verb and the count disagreeing about how
  // many there were. A family that counts its own subject says both ways.
  const said = names.length > 1 && first.plural ? first.plural : first;
  return { verb: said.verb, doing: said.doing, subject: joinNames(names, first.many) };
}

// What the call acted on, as short as it can be without being wrong. With a
// `cwd`, paths under it are shown relative to it.
export function workSubject(input, cwd = '', home = '') {
  const i = input ?? {};
  if (i.command != null && String(i.command).trim()) {
    return plainCommand(i.command);
  }
  const path = i.file_path ?? i.path ?? i.notebook_path;
  if (path != null && String(path).trim()) return shortPath(path, cwd, home);
  const raw = i.pattern ?? i.query ?? i.to ?? i.url ?? i.prompt ?? '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

// The whole string, shown above the output when a line is opened.
export function fullSubject(input) {
  const i = input ?? {};
  const raw = i.command ?? i.file_path ?? i.path ?? i.notebook_path
    ?? i.pattern ?? i.query ?? i.to ?? i.url ?? i.prompt ?? '';
  return String(raw).replace(/\s+$/, '');
}

// Three or more consecutive tool calls fold into one line. Two stay as two
// lines, which say more than a fold does.
export const RUN_MIN = 3;

export function groupWork(events, { min = RUN_MIN } = {}) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length >= min) out.push({ kind: 'run', at: run[0].at ?? 0, items: run });
    else out.push(...run);
    run = [];
  };
  for (const e of events ?? []) {
    // What the person did is not the agent's work and never folds into it:
    // three snoozes are three lines.
    if (e && e.kind === 'work' && !e.yours && !e.standalone) { run.push(e); continue; }
    flush();
    out.push(e);
  }
  flush();
  return out;
}

// The folded line says the total first, then up to three verbs with their
// counts and one count for the rest:
//
//   one verb with a plain word   `20 things it ran`
//   one verb without             `31 things it did · write html 31`
//   several                      `24 things it did · ran 18 · read 4 · changed 2`
//
// A count of one is not printed, because a trailing 1 reads as part of the name.
const PLAIN = new Set(['ran', 'read', 'wrote', 'changed', 'looked for', 'searched for', 'fetched', 'messaged']);
const TALLY_VERBS = 3;

export function runSummary(items) {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return '';
  const counts = new Map();
  for (const e of list) counts.set(e.verb, (counts.get(e.verb) ?? 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (byCount.length === 1 && PLAIN.has(byCount[0][0])) {
    return `${list.length} thing${list.length === 1 ? '' : 's'} it ${byCount[0][0]}`;
  }
  const shown = byCount.slice(0, TALLY_VERBS).map(([v, n]) => (n === 1 ? v : `${v} ${n}`));
  const rest = byCount.slice(TALLY_VERBS).reduce((s, [, n]) => s + n, 0);
  if (rest) shown.push(`${rest} more`);
  return `${list.length} things it did · ${shown.join(' · ')}`;
}

// A failure inside a fold is said on the closed line, so nobody has to open it
// to find bad news.
export function runFailures(items) {
  const bad = (items ?? []).filter((e) => e && e.failed).length;
  if (!bad) return '';
  return `${bad} failed`;
}

// The tools whose file the thread shows as a chip into the change. These must
// be the same tools main/code-change.mjs reads, or a chip opens onto a file the
// change does not hold.
export const CHANGES_A_FILE = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/**
 * The path a tool call changed, whole and unshortened, or '' when it changed
 * nothing. Whole because it is matched against the change's own list, and the
 * shortened form on screen has had its front thrown away.
 */
export function changedFile(name, input) {
  if (!CHANGES_A_FILE.has(String(name ?? ''))) return '';
  const i = input ?? {};
  return String(i.file_path ?? i.notebook_path ?? '').trim();
}

/**
 * Which entry of a change a path on a work line is, or null.
 *
 * A transcript records the absolute path it wrote. A change records the path
 * relative to one of the run's roots when it sits under one, and absolute when
 * not (main/code-change.mjs). So a key matches when it is the whole path or a
 * suffix of it at a segment boundary.
 *
 * The longest match wins: `src/a.ts` and `renderer/src/a.ts` are both suffixes
 * of the second one's absolute path.
 */
export function fileInChange(paths, raw) {
  const p = String(raw ?? '').trim().replace(/^\/private\/tmp\//, '/tmp/');
  if (!p) return null;
  let best = null;
  for (const key of paths ?? []) {
    const k = String(key ?? '').trim();
    if (!k) continue;
    const hit = k === p || p.endsWith(`/${k}`)
      || k.replace(/^\/private\/tmp\//, '/tmp/') === p;
    if (!hit) continue;
    if (!best || k.length > best.length) best = key;
  }
  return best;
}
