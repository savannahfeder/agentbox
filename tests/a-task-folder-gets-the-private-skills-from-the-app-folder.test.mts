// The skills, their tests and the plans left the public repository for a
// private one checked out at `.claude/skills` (2026-11-19). A task folder is a
// fresh worktree, so it has none of it unless the app gives it: the app folder
// clones the private repository when it lacks it, brings it up to date, and
// copies it into each new folder. A branch cut before the move still tracks the
// old public copy, and its folder must still be made.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bringPrivateFolder, givePrivateFolder, privateFolderOf } from '../main/private-folder.mts';
import { ensureTaskFolder } from '../main/task-folders.mts';

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ident = ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.com', '-c', 'commit.gpgsign=false'];
const commit = (cwd: string, msg: string) => { git(cwd, 'add', '-A'); git(cwd, ...ident, 'commit', '-q', '-m', msg); };
const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

/** A private repository on disk, a public checkout naming it, and a task folder off that checkout. */
function world({ named = true, url }: { named?: boolean; url?: string } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-folder-'));
  made.push(dir);
  const remote = path.join(dir, 'private.git');
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'clone', '-q', remote, seed);
  put(path.join(seed, 'unslop/SKILL.md'), 'one\n');
  commit(seed, 'first');
  git(seed, 'push', '-q', 'origin', 'HEAD:main');

  const root = path.join(dir, 'app');
  fs.mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  put(path.join(root, '.gitignore'), '.claude/skills/\n');
  if (named) put(path.join(root, '.agentbox/private.json'), JSON.stringify({ path: '.claude/skills', url: url ?? remote }));
  put(path.join(root, 'README.md'), 'public\n');
  commit(root, 'public');
  const folder = (name: string) => {
    const f = path.join(dir, name);
    git(root, 'worktree', 'add', '-q', '-b', name, f);
    return f;
  };
  return { dir, remote, seed, root, folder };
}

const skill = (at: string) => path.join(at, '.claude/skills/unslop/SKILL.md');
const read = (file: string) => fs.readFileSync(file, 'utf8');

describe('the private folder a repository names', () => {
  it('is read from .agentbox/private.json', () => {
    const w = world();
    expect(privateFolderOf(w.root)).toEqual({ path: '.claude/skills', url: w.remote });
  });

  it('is nothing when the repository names none', () => {
    const w = world({ named: false });
    expect(privateFolderOf(w.root)).toBe(null);
    const f = w.folder('t1');
    expect(givePrivateFolder(w.root, f, { every: 0 }).given).toBe(false);
    expect(fs.existsSync(path.join(f, '.claude/skills'))).toBe(false);
  });

  it('is refused when it would land outside the checkout', () => {
    const w = world({ named: false });
    put(path.join(w.root, '.agentbox/private.json'), JSON.stringify({ path: '../elsewhere', url: w.remote }));
    expect(privateFolderOf(w.root)).toBe(null);
  });
});

describe('a new task folder', () => {
  it('gets the private folder, cloned into the app folder first when it has none', () => {
    const w = world();
    const f = w.folder('t1');
    expect(givePrivateFolder(w.root, f, { every: 0 })).toMatchObject({ given: true });
    expect(read(skill(w.root))).toBe('one\n');
    expect(read(skill(f))).toBe('one\n');
    // A clone of its own, so a change made in the folder can be pushed from it.
    expect(git(path.join(f, '.claude/skills'), 'log', '--format=%s', '-1')).toBe('first');
    expect(git(f, 'status', '--porcelain')).toBe('');
  });

  it('gets what was pushed since the app folder last looked', () => {
    const w = world();
    givePrivateFolder(w.root, w.folder('t1'), { every: 0 });
    put(path.join(w.seed, 'unslop/SKILL.md'), 'two\n');
    commit(w.seed, 'second');
    git(w.seed, 'push', '-q', 'origin', 'HEAD:main');
    const f = w.folder('t2');
    givePrivateFolder(w.root, f, { every: 0 });
    expect(read(skill(f))).toBe('two\n');
  });

  it('does not ask the remote again within the wait it was given', () => {
    const w = world();
    givePrivateFolder(w.root, w.folder('t1'), { every: 60_000, now: 1_000 });
    put(path.join(w.seed, 'unslop/SKILL.md'), 'two\n');
    commit(w.seed, 'second');
    git(w.seed, 'push', '-q', 'origin', 'HEAD:main');
    const f = w.folder('t2');
    givePrivateFolder(w.root, f, { every: 60_000, now: 2_000 });
    expect(read(skill(f))).toBe('one\n');
    const g = w.folder('t3');
    givePrivateFolder(w.root, g, { every: 60_000, now: 62_000 });
    expect(read(skill(g))).toBe('two\n');
  });

  it('is still made, without it, when the private repository cannot be reached', () => {
    const w = world({ url: '/nowhere/at/all.git' });
    const f = w.folder('t1');
    const r = givePrivateFolder(w.root, f, { every: 0 });
    expect(r.given).toBe(false);
    expect(r.why).toMatch(/could not/);
    expect(fs.existsSync(path.join(f, '.claude/skills'))).toBe(false);
  });

  it('does not try a clone that failed again for every folder, only after the wait', () => {
    const w = world({ url: '/nowhere/at/all.git' });
    expect(givePrivateFolder(w.root, w.folder('t1'), { every: 60_000, now: 1_000 }).why).toMatch(/could not clone/);
    put(path.join(w.root, '.agentbox/private.json'), JSON.stringify({ path: '.claude/skills', url: w.remote }));
    expect(givePrivateFolder(w.root, w.folder('t2'), { every: 60_000, now: 2_000 }).given).toBe(false);
    expect(givePrivateFolder(w.root, w.folder('t3'), { every: 60_000, now: 62_000 }).given).toBe(true);
  });

  it('is left with its own copy when its branch still tracks the old public one', () => {
    const w = world();
    const f = w.folder('old');
    put(path.join(f, '.gitignore'), '');
    put(skill(f), 'the public copy\n');
    commit(f, 'a branch from before the move');
    const r = givePrivateFolder(w.root, f, { every: 0 });
    expect(r.given).toBe(false);
    expect(read(skill(f))).toBe('the public copy\n');
    expect(git(f, 'status', '--porcelain')).toBe('');
  });
});

describe('a task folder the app makes', () => {
  it('opens with the private folder in it, ignored by the branch', () => {
    const w = world();
    const made = ensureTaskFolder(w.root, 'w-private1');
    if (!made || !made.taken) throw Error(`no folder: ${JSON.stringify(made)}`);
    expect(read(skill(made.path))).toBe('one\n');
    expect(git(made.path, 'status', '--porcelain')).toBe('');
  });
});

describe('an app folder that already had the old public copy', () => {
  it('takes the clone in and keeps what was left behind in the folder', () => {
    const w = world();
    put(path.join(w.root, '.claude/skills/power-test/fixtures/api/node_modules/x.js'), 'left behind\n');
    expect(bringPrivateFolder(w.root, { every: 0 })).toMatchObject({ ok: true, did: 'cloned' });
    expect(read(skill(w.root))).toBe('one\n');
    expect(read(path.join(w.root, '.claude/skills/power-test/fixtures/api/node_modules/x.js'))).toBe('left behind\n');
  });

  it('keeps an edit somebody made there before the clone, as a change to commit', () => {
    const w = world();
    put(skill(w.root), 'edited by hand\n');
    bringPrivateFolder(w.root, { every: 0 });
    expect(read(skill(w.root))).toBe('edited by hand\n');
    expect(git(path.join(w.root, '.claude/skills'), 'status', '--porcelain')).toMatch(/unslop\/SKILL\.md/);
  });

  it('is not cloned into while the app folder still tracks the old copy', () => {
    const w = world();
    put(path.join(w.root, '.gitignore'), '');
    put(skill(w.root), 'the public copy\n');
    commit(w.root, 'still tracked');
    const r = bringPrivateFolder(w.root, { every: 0 });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(path.join(w.root, '.claude/skills/.git'))).toBe(false);
    expect(git(w.root, 'status', '--porcelain')).toBe('');
  });
});
