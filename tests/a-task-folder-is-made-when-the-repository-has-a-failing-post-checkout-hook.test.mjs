// A TASK FOLDER IS MADE WHEN THE REPOSITORY HAS A FAILING POST-CHECKOUT HOOK.
//
// FOUND 2026-10-15 going through how people's git setups differ. Repositories
// carry post-checkout hooks: git-lfs installs one, husky installs one, and the
// lfs one exits 1 on a machine where git-lfs is not installed. `git worktree
// add` runs that hook AFTER it has made the worktree, and hands back the hook's
// failure as its own, so the folder is there and git says it is not.
//
// MEASURED with the real git 2.39.5, a `.git/hooks/post-checkout` that prints
// "git-lfs not found" and exits 1, and an uncommitted edit in the checkout so
// the ordinary checkout runs rather than the clone (which uses `--no-checkout`
// and so never runs the hook):
//
//   ensure {"threw":"Could not make a folder for w-hook: Preparing worktree
//   (new branch 'agentbox/w-hook')\nfatal: a branch named 'agentbox/w-hook'
//   already exists"}
//
// The first `worktree add` had made the folder and the branch; the app read
// the hook's exit as a failure, tried again without the lock, was refused
// because the branch now existed, and threw. The task said "could not be given
// a folder" and never ran, and the same happened to every task, and to every
// parked task reopened, for as long as the hook was there.
//
// AND WHAT MUST NOT CHANGE: an add git really refused, which makes no worktree,
// is still a failure; and the repository's hook still runs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureTaskFolder, parkTaskFolder, restoreTaskFolder, taskFolderPath,
} from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let dir;
let hooks;

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hooked-repo-')));
  hooks = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
});
afterEach(() => {
  for (const p of [dir, hooks]) fs.rmSync(p, { recursive: true, force: true });
});

/** A post-checkout hook that leaves a mark where it ran, and fails. */
function failingHook(where) {
  fs.mkdirSync(where, { recursive: true });
  const hook = path.join(where, 'post-checkout');
  fs.writeFileSync(hook, '#!/bin/sh\ntouch hook-ran\necho "git-lfs not found" >&2\nexit 1\n');
  fs.chmodSync(hook, 0o755);
}

/** An edit in the checkout, so the ordinary `worktree add` runs, not the clone. */
const editInTheCheckout = () => fs.writeFileSync(path.join(dir, 'app.txt'), 'being edited\n');

describe('a repository whose post-checkout hook fails', () => {
  it('still gives the task its folder, with the code in it, and the hook still ran', () => {
    failingHook(path.join(dir, '.git', 'hooks'));
    editInTheCheckout();

    const got = ensureTaskFolder(dir, 'w-hook', { dependencies: false });

    expect(got).toMatchObject({ taken: true, created: true, how: 'checkout' });
    expect(got.path).toBe(taskFolderPath(dir, 'w-hook'));
    expect(fs.readFileSync(path.join(got.path, 'app.txt'), 'utf8')).toBe('one\n');
    expect(fs.existsSync(path.join(got.path, 'hook-ran'))).toBe(true);
    // Owned, like every folder the app makes.
    expect(git(dir, 'worktree', 'list', '--porcelain')).toContain(`locked agentbox pid=${process.pid}`);
  }, 30_000);

  it('works the same through core.hooksPath, which is where husky puts them', () => {
    failingHook(hooks);
    git(dir, 'config', 'core.hooksPath', hooks);
    editInTheCheckout();

    expect(ensureTaskFolder(dir, 'w-husky', { dependencies: false })).toMatchObject({ taken: true, created: true });
  }, 30_000);

  it('reopens a parked task, which always takes the ordinary checkout', () => {
    const first = ensureTaskFolder(dir, 'w-back', { dependencies: false });
    fs.writeFileSync(path.join(first.path, 'work.txt'), 'half done\n');
    expect(parkTaskFolder(dir, 'w-back')).toMatchObject({ parked: true });
    failingHook(path.join(dir, '.git', 'hooks'));

    const back = restoreTaskFolder(dir, 'w-back');

    expect(back).toMatchObject({ taken: true });
    expect(fs.readFileSync(path.join(back.path, 'work.txt'), 'utf8')).toBe('half done\n');
  }, 30_000);

  it('a clean checkout on main was never affected: the clone does not run the hook', () => {
    failingHook(path.join(dir, '.git', 'hooks'));

    const got = ensureTaskFolder(dir, 'w-clone', { dependencies: false });

    expect(got).toMatchObject({ taken: true, how: 'clone' });
  }, 30_000);

  it('an add git really refused is still a failure: the branch is checked out somewhere else', () => {
    const elsewhere = path.join(hooks, 'elsewhere');
    git(dir, 'worktree', 'add', '-q', '-b', 'agentbox/w-taken', elsewhere);
    git(elsewhere, 'commit', '-q', '--allow-empty', '-m', 'so the clone cannot be used');
    failingHook(path.join(dir, '.git', 'hooks'));

    expect(() => ensureTaskFolder(dir, 'w-taken', { dependencies: false })).toThrow(/already (checked out|used by worktree)/);
    expect(fs.existsSync(taskFolderPath(dir, 'w-taken'))).toBe(false);
  }, 30_000);
});
