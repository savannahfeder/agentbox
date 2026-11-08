#!/usr/bin/env node
// Semgrep, with .github/workflows/security.yml's own rules, over the files a
// push changes, run by the pre-push hook with the remote as argv[2] and the
// refs on stdin. Exit 1 only for a finding the push adds; when semgrep cannot
// run here the push goes, and this says why.
//
// Each changed file is scanned twice, as it is in the push and as it was at the
// base, and only findings the base lacked count. That keeps a push from being
// refused for a finding it merely touched, or for one a newer registry rule
// raises in code nobody changed.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW = '.github/workflows/security.yml';
const SCAN_MS = 3 * 60 * 1000;
const INSTALL_MS = 5 * 60 * 1000;
const RETRY_INSTALL_MS = 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 15 * 60 * 1000;
const ZERO = /^0+$/;
const TAKES_A_VALUE = new Set(['--config', '--exclude', '--include', '--metrics', '--severity']);

/** The workflow's semgrep: its version, rules, folders and exclusions, or null. */
export function scanCommand(workflow) {
  const lines = String(workflow).split('\n');
  const first = lines.findIndex((l) => /^\s*semgrep scan\b/.test(l));
  if (first === -1) return null;
  const rest = lines.slice(first).findIndex((l, i) => i > 0 && /^\s*(-\s|\S+:)/.test(l));
  const words = lines.slice(first, rest === -1 ? undefined : first + rest).join(' ').trim().split(/\s+/);
  const cmd = { version: /semgrep==([\w.]+)/.exec(workflow)?.[1] ?? null, configs: [], excludes: [], roots: [] };
  for (let i = 2; i < words.length; i += 1) {
    if (words[i] === '--config') cmd.configs.push(words[(i += 1)]);
    else if (words[i] === '--exclude') cmd.excludes.push(words[(i += 1)]);
    else if (TAKES_A_VALUE.has(words[i])) i += 1;
    else if (!words[i].startsWith('-')) cmd.roots.push(words[i]);
  }
  return cmd;
}

/** The changed files GitHub's scan would read. */
export function filesToScan(paths, { roots, excludes }) {
  return paths.filter((p) => roots.some((r) => p === r || p.startsWith(`${r}/`))
    && !p.split('/').some((part) => excludes.includes(part)));
}

const keyOf = (f) => `${f.id}\0${f.path}\0${f.text}`;

/** The findings in `head` that `base` does not account for, counting repeats. */
export function newFindings(head, base) {
  const left = new Map();
  for (const f of base) left.set(keyOf(f), (left.get(keyOf(f)) ?? 0) + 1);
  return head.filter((f) => {
    const n = left.get(keyOf(f)) ?? 0;
    if (n > 0) { left.set(keyOf(f), n - 1); return false; }
    return true;
  });
}

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
const exists = (rev) => { try { git(['cat-file', '-e', `${rev}^{commit}`]); return true; } catch { return false; } };
const executable = (file) => { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; } };
const lastLine = (text) => String(text ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
const withoutGit = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('GIT_')));

function cacheDir() {
  const base = process.env.XDG_CACHE_HOME
    || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches') : path.join(os.homedir(), '.cache'));
  return path.join(base, 'agentbox');
}

function onPath(name) {
  for (const d of String(process.env.PATH ?? '').split(path.delimiter)) {
    if (d && executable(path.join(d, name))) return path.join(d, name);
  }
  return null;
}

function newEnoughPython() {
  for (const name of ['python3', 'python3.13', 'python3.12', 'python3.11', 'python3.10']) {
    const r = spawnSync(name, ['-c', 'import sys; print(sys.version_info >= (3, 10))'], { encoding: 'utf8', timeout: 10 * 1000 });
    if (r.status === 0 && r.stdout.trim() === 'True') return name;
  }
  return null;
}

/** A semgrep to run: { bin } or { why } it could not be had. */
function findSemgrep(version) {
  const named = process.env.AGENTBOX_SEMGREP;
  const found = named ? (executable(named) ? named : null) : onPath('semgrep');
  if (found) return { bin: found };
  if (!version) return { why: 'semgrep is not installed and the workflow names no version to install' };

  const dir = path.join(cacheDir(), `semgrep-${version}`);
  const bin = path.join(dir, 'bin', 'semgrep');
  const done = path.join(dir, 'installed');
  if (fs.existsSync(done) && executable(bin)) return { bin };

  const failed = `${dir}.failed`;
  try {
    if (Date.now() - fs.statSync(failed).mtimeMs < RETRY_INSTALL_MS) {
      return { why: `installing semgrep ${version} failed within the last day: ${fs.readFileSync(failed, 'utf8').trim()}` };
    }
  } catch {}

  // A venv cannot be moved once made, so it is built in place under a lock and
  // counts as installed only once `installed` is written.
  const lock = `${dir}.installing`;
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const take = () => { try { fs.mkdirSync(lock); return true; } catch { return false; } };
  if (!take()) {
    let age = Infinity;
    try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch {}
    if (age < LOCK_STALE_MS) return { why: 'another push is installing semgrep right now' };
    fs.rmSync(lock, { recursive: true, force: true });
    if (!take()) return { why: 'another push is installing semgrep right now' };
  }
  try {
    console.log(`security-scan: installing semgrep ${version} in ${dir}, once...`);
    fs.rmSync(dir, { recursive: true, force: true });
    const step = (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: INSTALL_MS, stdio: ['ignore', 'pipe', 'pipe'] });
      if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
      if (r.status !== 0) throw new Error(lastLine(r.stderr) || lastLine(r.stdout) || `${path.basename(cmd)} exited ${r.status}`);
    };
    const python = newEnoughPython();
    if (!python) throw new Error('no Python 3.10 or newer on PATH (semgrep needs one; the python3 a Mac ships is 3.9)');
    step(python, ['-m', 'venv', dir]);
    step(path.join(dir, 'bin', 'pip'), ['install', '-q', '--disable-pip-version-check', `semgrep==${version}`]);
    if (!executable(bin)) throw new Error('pip finished without a semgrep in the venv');
    fs.writeFileSync(done, `${new Date().toISOString()}\n`);
    fs.rmSync(failed, { force: true });
    return { bin };
  } catch (e) {
    fs.writeFileSync(failed, `${e.message}\n`);
    return { why: `semgrep ${version} could not be installed: ${e.message}` };
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

/** Each pushed ref as { base, head }, or null when what it changes cannot be told. */
function pushes(input, remote) {
  const out = [];
  for (const line of String(input).split('\n')) {
    const [, local, , remoteSha] = line.trim().split(/\s+/);
    if (!local || ZERO.test(local) || !exists(local)) continue;
    let base = remoteSha && !ZERO.test(remoteSha) && exists(remoteSha) ? remoteSha : null;
    if (!base) {
      try { base = git(['merge-base', local, `refs/remotes/${remote}/main`]).trim() || null; } catch {}
    }
    if (!base) return null;
    out.push({ base, head: local });
  }
  return out;
}

function exportFiles(rev, files, into) {
  const written = [];
  for (const file of files) {
    let body;
    try { body = execFileSync('git', ['show', `${rev}:${file}`], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { continue; }
    fs.mkdirSync(path.dirname(path.join(into, file)), { recursive: true });
    fs.writeFileSync(path.join(into, file), body);
    written.push(file);
  }
  return written;
}

const skip = (why) => { console.error(`security-scan: ${why}, so the scan did not run before this push. GitHub's security run still does.`); return 0; };

export function main(argv = process.argv, input = fs.readFileSync(0, 'utf8')) {
  const remote = argv[2] || 'origin';
  if (!fs.existsSync(WORKFLOW)) { console.log('security-scan: no semgrep scan in this repository.'); return 0; }
  const cmd = scanCommand(fs.readFileSync(WORKFLOW, 'utf8'));
  if (!cmd || !cmd.roots.length) { console.log(`security-scan: no semgrep scan in ${WORKFLOW}.`); return 0; }

  const refs = pushes(input, remote);
  if (!refs) return skip('what this push changes cannot be told from here');
  const jobs = refs.map(({ base, head }) => ({
    base, head, files: filesToScan(git(['diff', '--name-only', '--diff-filter=d', base, head]).split('\n').filter(Boolean), cmd),
  })).filter((j) => j.files.length);
  if (!jobs.length) return 0;

  const found = findSemgrep(cmd.version);
  if (!found.bin) return skip(found.why);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-security-scan-'));
  try {
    const targets = [];
    jobs.forEach((j, n) => {
      for (const side of ['head', 'base']) {
        if (exportFiles(j[side], j.files, path.join(tmp, String(n), side)).length) targets.push(path.join(String(n), side));
      }
    });
    if (!targets.length) return 0;
    const count = jobs.reduce((n, j) => n + j.files.length, 0);
    console.log(`security-scan: semgrep is reading the ${count} file(s) this push changes...`);
    const r = spawnSync(found.bin, ['scan', '--json', '--metrics', 'off', '--quiet',
      ...cmd.configs.flatMap((c) => ['--config', c]), ...targets], {
      cwd: tmp, encoding: 'utf8', timeout: SCAN_MS, maxBuffer: 64 * 1024 * 1024, env: withoutGit(process.env),
    });
    let results;
    try { results = JSON.parse(r.stdout).results; } catch {}
    if (!Array.isArray(results)) {
      const why = r.error ? r.error.message : (lastLine(r.stderr) || `semgrep exited ${r.status}`);
      return skip(`semgrep did not finish (${why})`);
    }

    const sides = { head: [], base: [] };
    for (const res of results) {
      const [n, side, ...rest] = String(res.path).split(/[\\/]/);
      if (!sides[side]) continue;
      const bytes = fs.readFileSync(path.join(tmp, res.path));
      const text = bytes.subarray(res.start?.offset ?? 0, res.end?.offset ?? 0).toString('utf8').replace(/\s+/g, ' ').trim();
      sides[side].push({ id: res.check_id, path: rest.join('/'), job: n, text, line: res.start?.line, message: res.extra?.message ?? '' });
    }
    const fresh = jobs.flatMap((_, n) => newFindings(
      sides.head.filter((f) => f.job === String(n)),
      sides.base.filter((f) => f.job === String(n)),
    ));
    if (!fresh.length) {
      console.log('security-scan: nothing new for semgrep in this push.');
      return 0;
    }
    console.error('');
    console.error("  PUSH REFUSED. Semgrep, the scan main's security run does on GitHub,");
    console.error('  finds something new in what this push changes:');
    console.error('');
    for (const f of fresh) {
      console.error(`    ${f.path}:${f.line}  ${f.id}`);
      console.error(`      ${String(f.message).replace(/\s+/g, ' ').trim().slice(0, 240)}`);
    }
    console.error('');
    console.error('  Fix it. If you have read it and it is a false alarm, put');
    console.error('  `// nosemgrep: <rule id>` on the line above it, with a comment saying why.');
    console.error('');
    return 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code = 0;
  try { code = main(); } catch (e) { code = skip(`the scan broke (${e.message})`); }
  process.exit(code);
}
