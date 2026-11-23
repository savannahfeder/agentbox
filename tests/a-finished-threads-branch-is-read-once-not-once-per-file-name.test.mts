// A finished thread's branch is read once, not once for every file name.
//
// 2026-11-22: the app's own CPU record, 81 seconds after a restart, put 10% of
// the main thread's busy time inside starting `git` from the code that finds
// a file by name (8% in the spawn itself), and a `git` process beside it at
// half a core. A thread whose folder was given back keeps its work on its
// branch, and each name asked of it ran `git log HEAD..tip` again to list the
// same files; 256 answers were remembered and then all forgotten at once. A
// pass over every thread's files asks thousands of names.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact } from '../main/artifact-path.mts';
import { taskBranch } from '../main/task-folders.mts';

const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const git = (cwd: string, ...args: string[]) => execFileSync(realGit, args, { cwd, encoding: 'utf8' });
const PATH = process.env.PATH;
let root = '', repo = '', dir = '', calls = '';
const first = 'w-88fab781ae';
const second = 'w-5c0de5c0de';

/** Every `git` the app starts, as its arguments, one line each. */
const started = (what: string) => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').split('\n') : []).filter((l) => l.includes(what)).length;

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'branch-once-')));
  repo = path.join(root, 'eval-harness');
  dir = path.join(root, 'docs');
  calls = path.join(root, 'git-calls.log');
  fs.mkdirSync(repo); fs.mkdirSync(dir);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'a@b.c'); git(repo, 'config', 'user.name', 'A');
  fs.writeFileSync(path.join(repo, 'README.md'), 'eval\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'seed');
  for (const [thread, file, text] of [[first, 'tools/validate_results.py', 'print("ok")\n'], [second, 'notes/plan.md', 'the plan\n']]) {
    git(repo, 'checkout', '-qb', taskBranch(thread), 'main');
    fs.mkdirSync(path.join(repo, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
    git(repo, 'add', '.'); git(repo, 'commit', '-qm', file);
  }
  git(repo, 'checkout', '-q', 'main');
  // A `git` in front of the real one that writes down what it was asked.
  const shim = path.join(root, 'bin');
  fs.mkdirSync(shim);
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(calls)}\nexec ${JSON.stringify(realGit)} "$@"\n`, { mode: 0o755 });
  process.env.PATH = `${shim}${path.delimiter}${PATH}`;
});
afterAll(() => {
  process.env.PATH = PATH;
  fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(() => { fs.rmSync(calls, { force: true }); });

let clock = 1_000_000;
const open = (src: string, from: string) => resolveArtifact({
  src, product: 'eval', products: [{ slug: 'eval', dir, name: 'Eval harness', repoPath: repo }] as never,
  accountRoot: root, storeRoot: root, thread: from, now: clock,
});

describe('names asked of a finished thread\'s branch', () => {
  it('list the branch\'s files once for three hundred names it does not hold', async () => {
    for (let n = 0; n < 300; n++) expect((await open(`reports/missing-${n}.md`, first)).ok).toBe(false);
    expect(started('--name-only')).toBe(1);
  });

  it('list nothing again on a later pass over the same names', async () => {
    clock += 10 * 60_000;
    for (let n = 0; n < 300; n++) expect((await open(`reports/missing-${n}.md`, first)).ok).toBe(false);
    expect(started('--name-only')).toBe(0);
  });

  it('still open a file the branch holds, and read it out of git once', async () => {
    const out = await open('tools/validate_results.py', first);
    expect(out.ok).toBe(true);
    expect(fs.readFileSync(out.path!, 'utf8')).toBe('print("ok")\n');
    expect((await open('tools/validate_results.py', first)).ok).toBe(true);
    expect(started('show ')).toBe(1);
  });

  it('keep each branch\'s list to itself', async () => {
    expect((await open('notes/plan.md', first)).ok).toBe(false);
    const out = await open('notes/plan.md', second);
    expect(out.ok).toBe(true);
    expect(fs.readFileSync(out.path!, 'utf8')).toBe('the plan\n');
    expect((await open('tools/validate_results.py', second)).ok).toBe(false);
  });

  it('see a file committed to the branch afterwards', async () => {
    expect((await open('tools/later.py', first)).ok).toBe(false);
    git(repo, 'checkout', '-q', taskBranch(first));
    fs.writeFileSync(path.join(repo, 'tools', 'later.py'), 'print("later")\n');
    git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'later');
    git(repo, 'checkout', '-q', 'main');
    // The branch's tips are looked up again once their own window has passed.
    clock += 10 * 60_000;
    const out = await open('tools/later.py', first);
    expect(out.ok).toBe(true);
    expect(fs.readFileSync(out.path!, 'utf8')).toBe('print("later")\n');
  });
});
