// A PUSH THAT ADDS A SECURITY FINDING IS REFUSED BEFORE IT REACHES MAIN.
//
// Main's `security` run on GitHub went red at 6d9d4880 (2026-11-08 01:14 UTC)
// and stayed red for every push after it, about thirty, because semgrep's
// express-res-sendfile rule matched `place.sendFile(path, ...)` in
// renderer/src/components/NeedCard.tsx. Nothing on this side runs semgrep, so
// the first anyone heard of it was a red cross on the repository page. Measured
// by running the workflow's own semgrep command on main: one blocking finding.
//
// Now the pre-push hook runs semgrep, with the workflow's own rules, over the
// files the push changes, and refuses only a finding the push itself adds.
// These run scripts/security-scan-the-push.mjs in a throwaway repository with
// a stand-in semgrep, so no test installs or downloads anything.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanCommand, filesToScan, newFindings } from '../scripts/security-scan-the-push.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(root, 'scripts/security-scan-the-push.mjs');
const WORKFLOW = fs.readFileSync(path.join(root, '.github/workflows/security.yml'), 'utf8');
const BAD = 'res.sendFile(req.query.p);\n';

describe("the scan the push runs is the workflow's own", () => {
  it('reads the version, the rules, the folders and the exclusions from security.yml', () => {
    const cmd = scanCommand(WORKFLOW);
    expect(cmd.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cmd.configs).toEqual(['p/javascript', 'p/typescript', 'p/secrets']);
    expect(cmd.roots).toContain('renderer/src');
    expect(cmd.roots).toContain('preload.cjs');
    expect(cmd.excludes).toEqual(['tests', 'node_modules', 'dist']);
  });

  it('is null for a workflow with no semgrep in it', () => {
    expect(scanCommand('name: other\njobs: {}\n')).toBeNull();
  });
});

describe('which changed files it scans', () => {
  const cmd = scanCommand(WORKFLOW);
  it('takes files under a scanned folder, and a scanned file named alone', () => {
    expect(filesToScan(['renderer/src/a.tsx', 'main/b.mts', 'preload.cjs'], cmd))
      .toEqual(['renderer/src/a.tsx', 'main/b.mts', 'preload.cjs']);
  });
  it('leaves out tests, folders GitHub does not scan, and look-alike names', () => {
    expect(filesToScan([
      'tests/a.test.mjs', 'main/tests/x.mjs', 'docs/a.md', 'renderer/index.html',
      'mainly/x.mjs', 'preload.cjs.bak', 'mobile/app.json', 'scripts/node_modules/x.js',
    ], cmd)).toEqual([]);
  });
});

describe('which findings are new', () => {
  const f = (path, text, id = 'rule.a') => ({ id, path, text });
  it('counts a finding the base did not have', () => {
    expect(newFindings([f('a.ts', 'x()')], [])).toEqual([f('a.ts', 'x()')]);
  });
  it('does not count one that only moved lines', () => {
    expect(newFindings([f('a.ts', 'x()')], [f('a.ts', 'x()')])).toEqual([]);
  });
  it('counts a second copy of one the base had once', () => {
    expect(newFindings([f('a.ts', 'x()'), f('a.ts', 'x()')], [f('a.ts', 'x()')])).toHaveLength(1);
  });
  it('counts the same text under another rule or in another file', () => {
    expect(newFindings([f('a.ts', 'x()', 'rule.b'), f('b.ts', 'x()')], [f('a.ts', 'x()')])).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// The script itself, against a throwaway repository.

let dir; let bin; let cache; let calls;

// A semgrep that flags every `res.sendFile(` and answers in semgrep's JSON,
// with byte offsets and without the matched text, as real semgrep does when
// nobody is logged in.
const FAKE_SEMGREP = `#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify({ argv: process.argv.slice(2), gitDir: process.env.GIT_DIR ?? null }) + '\\n');
if (process.env.FAKE_SEMGREP_FAIL) { console.error('[ERROR] Failed to download configuration'); process.exit(2); }
const args = process.argv.slice(2); const targets = [];
for (let i = 1; i < args.length; i++) { if (args[i] === '--config' || args[i] === '--metrics') i++; else if (!args[i].startsWith('-')) targets.push(args[i]); }
const walk = (p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((e) => walk(path.join(p, e))) : [p];
const results = [];
for (const file of targets.flatMap(walk)) {
  const buf = fs.readFileSync(file); let at = buf.indexOf('res.sendFile(');
  while (at !== -1) { const line = buf.subarray(0, at).toString().split('\\n').length; results.push({ check_id: 'fake.express-res-sendfile', path: file, start: { line, offset: at }, end: { line, offset: at + 13 }, extra: { lines: 'requires login', message: 'res.sendFile reads files' } }); at = buf.indexOf('res.sendFile(', at + 1); }
}
console.log(JSON.stringify({ results, errors: [] }));
`;

// A python3 whose venv's pip "installs" the stand-in semgrep, or fails.
const FAKE_PYTHON = `#!/bin/sh
[ "$1" = "-c" ] && { echo True; exit 0; }
echo "python3 $*" >> "$FAKE_CALLS"
[ -n "\${FAKE_PYTHON_FAIL:-}" ] && { echo "ERROR: No matching distribution found for semgrep" >&2; exit 1; }
venv="$3"; mkdir -p "$venv/bin"
cat > "$venv/bin/pip" <<'PIP'
#!/bin/sh
cp "$FAKE_SEMGREP_SRC" "$(dirname "$0")/semgrep"; chmod +x "$(dirname "$0")/semgrep"
PIP
chmod +x "$venv/bin/pip"
`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-scan-'));
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'security-scan-bin-'));
  cache = fs.mkdtempSync(path.join(os.tmpdir(), 'security-scan-cache-'));
  calls = path.join(bin, 'calls');
  fs.writeFileSync(path.join(bin, 'fake-semgrep'), FAKE_SEMGREP, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'python3'), FAKE_PYTHON, { mode: 0o755 });
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  g('init', '-q');
  g('config', 'user.name', 'Someone');
  g('config', 'user.email', 'someone@users.noreply.github.com');
  g('config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github/workflows/security.yml'), WORKFLOW);
});
afterEach(() => {
  for (const d of [dir, bin, cache]) fs.rmSync(d, { recursive: true, force: true });
});

function commit(files) {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    if (text === null) fs.rmSync(path.join(dir, file));
    else fs.writeFileSync(path.join(dir, file), text);
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'change'], { cwd: dir });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
}

function push(base, head, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, 'origin'], {
    cwd: dir,
    encoding: 'utf8',
    input: `refs/heads/main ${head} refs/heads/main ${base}\n`,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      AGENTBOX_SEMGREP: path.join(bin, 'fake-semgrep'),
      XDG_CACHE_HOME: cache,
      FAKE_CALLS: calls,
      FAKE_SEMGREP_SRC: path.join(bin, 'fake-semgrep'),
      ...env,
    },
  });
}
const callLog = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean) : []);
const semgrepCalls = () => callLog().filter((l) => l.startsWith('{'));

describe('a push the scan reads', () => {
  it('is refused when it adds a finding, naming the file, the line and the rule', () => {
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'main/a.mts': `export const a = 1;\n${BAD}` });
    const r = push(base, head);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PUSH REFUSED');
    expect(r.stderr).toContain('main/a.mts:2');
    expect(r.stderr).toContain('fake.express-res-sendfile');
    expect(r.stderr).toContain('nosemgrep');
  });

  it('is refused for a finding in a file the push creates', () => {
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'renderer/src/b.tsx': BAD });
    expect(push(base, head).status).toBe(1);
  });

  it('goes through when the finding was already in that file before the push', () => {
    const base = commit({ 'main/a.mts': BAD });
    const head = commit({ 'main/a.mts': `// a line above it\n${BAD}` });
    const r = push(base, head);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('nothing new');
  });

  it('goes through when the push takes a finding away', () => {
    const base = commit({ 'main/a.mts': BAD });
    const head = commit({ 'main/a.mts': 'export const a = 1;\n' });
    expect(push(base, head).status).toBe(0);
  });

  it('never hands semgrep the GIT_DIR git gives a hook', () => {
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'main/a.mts': 'export const a = 2;\n' });
    push(base, head, { GIT_DIR: path.join(dir, '.git') });
    expect(semgrepCalls().map((l) => JSON.parse(l).gitDir)).toEqual([null]);
  });

  it("passes semgrep the workflow's own rules", () => {
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'main/a.mts': 'export const a = 2;\n' });
    push(base, head);
    const { argv } = JSON.parse(semgrepCalls()[0]);
    expect(argv.join(' ')).toContain('--config p/javascript --config p/typescript --config p/secrets');
  });
});

describe('a push the scan has nothing to say about', () => {
  it('does not start semgrep when it changes only tests and docs', () => {
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'tests/a.test.mjs': BAD, 'docs/a.md': BAD });
    const r = push(base, head);
    expect(r.status).toBe(0);
    expect(semgrepCalls()).toEqual([]);
  });

  it('does not start semgrep when it only deletes a file', () => {
    const base = commit({ 'main/a.mts': BAD, 'main/b.mts': 'x\n' });
    const head = commit({ 'main/a.mts': null });
    expect(push(base, head).status).toBe(0);
    expect(semgrepCalls()).toEqual([]);
  });

  it('skips a repository with no security workflow, saying so', () => {
    fs.rmSync(path.join(dir, '.github'), { recursive: true });
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'main/a.mts': BAD });
    const r = push(base, head);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('no semgrep scan');
    expect(semgrepCalls()).toEqual([]);
  });
});

describe('when semgrep cannot run here, the push goes and says why', () => {
  it('lets the push through when semgrep cannot finish, and says the scan did not run', () => {
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'main/a.mts': BAD });
    const r = push(base, head, { FAKE_SEMGREP_FAIL: '1' });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('did not run');
    expect(r.stderr).toContain('Failed to download configuration');
  });

  it('installs semgrep once when there is none, then scans with it', () => {
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'main/a.mts': BAD });
    const none = { AGENTBOX_SEMGREP: path.join(bin, 'no-semgrep-here') };
    const r = push(base, head, none);
    expect(r.status).toBe(1);
    expect(callLog().filter((l) => l.startsWith('python3'))).toHaveLength(1);
    push(base, head, none);
    expect(callLog().filter((l) => l.startsWith('python3'))).toHaveLength(1);
    expect(semgrepCalls()).toHaveLength(2);
  });

  it('lets the push through when installing fails, and does not try again for a day', () => {
    const base = commit({ 'main/a.mts': 'export const a = 1;\n' });
    const head = commit({ 'main/a.mts': BAD });
    const env = { AGENTBOX_SEMGREP: path.join(bin, 'no-semgrep-here'), FAKE_PYTHON_FAIL: '1' };
    const first = push(base, head, env);
    expect(first.status).toBe(0);
    expect(first.stderr).toContain('No matching distribution found for semgrep');
    const second = push(base, head, env);
    expect(second.status).toBe(0);
    expect(second.stderr).toContain('did not run');
    expect(callLog().filter((l) => l.startsWith('python3'))).toHaveLength(1);
  });
});

describe('the pre-push hook', () => {
  it('runs the scan before the tests', () => {
    const hook = fs.readFileSync(path.join(root, 'scripts/hooks/pre-push'), 'utf8');
    const scan = hook.indexOf('security-scan-the-push.mjs');
    expect(scan).toBeGreaterThan(-1);
    expect(scan).toBeLessThan(hook.indexOf('node_modules/.bin/vitest $runargs'));
  });
});
