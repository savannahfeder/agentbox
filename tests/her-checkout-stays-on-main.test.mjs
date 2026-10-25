// HER CHECKOUT STAYS ON main, AND A WORKTREE IS LEFT ALONE.
//
// Her app runs `npm start` from ~/Desktop/dev/zero, so `appDir` in main.mjs IS
// that working tree: the code she runs, and the worker brief every agent gets
// at spawn, are whatever branch that one checkout is standing on. Measured off
// its HEAD reflog that day: 57 branch switches in seven days and 79.4 of 168
// hours NOT on main, 47% of the week.
//
// scripts/hooks/post-checkout is the guard. What is pinned here is the whole of
// what makes it safe: it puts the primary worktree back, it does not lose
// uncommitted work doing so, it never touches a linked worktree (which is where
// the work is supposed to happen), and a file checkout is not a branch switch.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOOKS = ['post-checkout', 'pre-commit', 'pre-merge-commit'];

let root;
const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const branchOf = (cwd) => git(cwd, 'symbolic-ref', '--short', 'HEAD');
const refused = (cwd, ...args) => {
  try {
    git(cwd, ...args);
    return false;
  } catch {
    return true;
  }
};

// A repo shaped like hers: hooks come out of the working tree, the way
// core.hooksPath=scripts/hooks does in this one.
const makeRepo = (at = null) => {
  const dir = at ?? fs.mkdtempSync(path.join(root, 'repo-'));
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main', '.');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  fs.mkdirSync(path.join(dir, 'scripts', 'hooks'), { recursive: true });
  for (const hook of HOOKS) {
    const dest = path.join(dir, 'scripts', 'hooks', hook);
    fs.copyFileSync(path.join(REPO, 'scripts', 'hooks', hook), dest);
    fs.chmodSync(dest, 0o755);
  }
  fs.writeFileSync(path.join(dir, 'f.txt'), 'first\n');
  git(dir, 'add', '-A');
  // The one commit that has to happen before the guard is switched on.
  git(dir, 'commit', '-qm', 'first');
  git(dir, 'config', 'core.hooksPath', 'scripts/hooks');
  return dir;
};

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-checkout-guard-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('the checkout her app runs from', () => {
  it('is put back on main when something branches in it', () => {
    const repo = makeRepo();
    git(repo, 'checkout', '-q', '-b', 'agentbox/w-whatever');
    expect(branchOf(repo)).toBe('main');
  });

  it('is put back when something moves it to an existing branch', () => {
    const repo = makeRepo();
    const wt = path.join(root, 'wt');
    git(repo, 'worktree', 'add', '-q', wt, '-b', 'other');
    git(repo, 'worktree', 'remove', '--force', wt);
    git(repo, 'checkout', '-q', 'other');
    expect(branchOf(repo)).toBe('main');
  });

  it('keeps uncommitted work while putting it back', () => {
    const repo = makeRepo();
    fs.appendFileSync(path.join(repo, 'f.txt'), 'work in progress\n');
    fs.writeFileSync(path.join(repo, 'new.txt'), 'untracked\n');
    git(repo, 'checkout', '-q', '-b', 'agentbox/w-whatever');
    expect(branchOf(repo)).toBe('main');
    expect(fs.readFileSync(path.join(repo, 'f.txt'), 'utf8')).toContain('work in progress');
    expect(fs.existsSync(path.join(repo, 'new.txt'))).toBe(true);
  });

  it('does not fire on a file checkout, which is not a branch switch', () => {
    const repo = makeRepo();
    fs.appendFileSync(path.join(repo, 'f.txt'), 'scribble\n');
    git(repo, 'checkout', '-q', '--', 'f.txt');
    expect(branchOf(repo)).toBe('main');
    expect(fs.readFileSync(path.join(repo, 'f.txt'), 'utf8')).not.toContain('scribble');
  });
});

describe('a throwaway worktree, which is where the work belongs', () => {
  it('is not touched, on any branch', () => {
    const repo = makeRepo();
    const wt = path.join(root, 'wt');
    git(repo, 'worktree', 'add', '-q', wt, '-b', 'agentbox/w-whatever');
    expect(branchOf(wt)).toBe('agentbox/w-whatever');
    expect(branchOf(repo)).toBe('main');
  });

  it('can switch branches inside itself freely', () => {
    const repo = makeRepo();
    const wt = path.join(root, 'wt');
    git(repo, 'worktree', 'add', '-q', wt, '-b', 'agentbox/one');
    git(wt, 'checkout', '-q', '-b', 'agentbox/two');
    expect(branchOf(wt)).toBe('agentbox/two');
    expect(branchOf(repo)).toBe('main');
  });

  it('can commit', () => {
    const repo = makeRepo();
    const wt = path.join(root, 'wt');
    git(repo, 'worktree', 'add', '-q', wt, '-b', 'agentbox/one');
    fs.appendFileSync(path.join(wt, 'f.txt'), 'real work\n');
    git(wt, 'add', '-A');
    expect(refused(wt, 'commit', '-qm', 'work')).toBe(false);
  });
});

// The partner half, and the reason bouncing back to main is safe. Without it an
// agent that meant to commit onto its own branch would commit onto main
// instead, the one thing CLAUDE.md forbids outright.
describe('nothing commits in the checkout her app runs from', () => {
  it('refuses an ordinary commit', () => {
    const repo = makeRepo();
    fs.appendFileSync(path.join(repo, 'f.txt'), 'stray\n');
    git(repo, 'add', '-A');
    expect(refused(repo, 'commit', '-qm', 'stray')).toBe(true);
    expect(git(repo, 'log', '--oneline').split('\n').length).toBe(1);
  });

  it('refuses a merge commit, which does not run pre-commit', () => {
    const repo = makeRepo();
    const wt = path.join(root, 'wt');
    git(repo, 'worktree', 'add', '-q', wt, '-b', 'side');
    fs.writeFileSync(path.join(wt, 'side.txt'), 'from the side\n');
    git(wt, 'add', '-A');
    git(wt, 'commit', '-qm', 'side work');
    expect(refused(repo, 'merge', '--no-ff', '--no-edit', 'side')).toBe(true);
  });

  it('leaves the escape hatch open, because a guard is not a lock', () => {
    const repo = makeRepo();
    fs.appendFileSync(path.join(repo, 'f.txt'), 'deliberate\n');
    git(repo, 'add', '-A');
    expect(refused(repo, 'commit', '--no-verify', '-qm', 'deliberate')).toBe(false);
  });
});


// A THREAD'S FOLDER IN THE CLOUD IS NOT HER CHECKOUT (2026-10-16). A cloud run
// lays a thread's folder down as a repository of its own at the path it has on
// the Mac, `.claude/worktrees/<id>`, not as a linked worktree. The first
// `npm install` there switched these guards on, and they read it as the
// checkout her app runs from: measured that day in a cloud run, every commit
// was refused ("THIS IS THE CHECKOUT HER APP RUNS FROM") and a branch checkout
// would have been put back on main. "Almost everything broke."
describe('a thread\'s folder laid down as a repository of its own', () => {
  const taskFolder = () => path.join(root, 'Users', 'someone', 'dev', 'app', '.claude', 'worktrees', 'w-1234abcd');

  it('commits on its branch', () => {
    const repo = makeRepo(taskFolder());
    git(repo, 'checkout', '-q', '-b', 'agentbox/w-1234abcd');
    expect(branchOf(repo)).toBe('agentbox/w-1234abcd');
    fs.writeFileSync(path.join(repo, 'f.txt'), 'second\n');
    git(repo, 'commit', '-qam', 'second');
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('second');
  });

  it('while a checkout anywhere else is still guarded', () => {
    const repo = makeRepo(path.join(root, 'Users', 'someone', 'dev', 'app'));
    expect(refused(repo, 'commit', '--allow-empty', '-qm', 'nope')).toBe(true);
    // A folder merely NAMED like one, not inside .claude/worktrees, is guarded too.
    const named = makeRepo(path.join(root, 'w-1234abcd'));
    expect(refused(named, 'commit', '--allow-empty', '-qm', 'nope')).toBe(true);
  });
});
