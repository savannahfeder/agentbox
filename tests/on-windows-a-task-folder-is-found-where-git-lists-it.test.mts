// ON WINDOWS A TASK FOLDER IS FOUND WHERE GIT LISTS IT.
//
// Every question about a task folder starts by finding it in
// `git worktree list --porcelain`. Git on Windows writes those paths with
// forward slashes, and the app builds every folder with `path.join`, which
// writes backslashes. They never compared equal, so the app could not find a
// folder it had just made.
//
// Measured on Windows 11 with git 2.51, through `ensureTaskFolder` on a fresh
// repository, asked twice for the same task.
//
//   git lists        C:/Users/.../.claude/worktrees/w-0123456789
//   the app builds   C:\Users\...\.claude\worktrees\w-0123456789
//
//   before   first  { taken: false, reason: 'held' }
//            second { taken: false, reason: 'in-the-way' }
//   after    first  { taken: true, created: true }
//            second { taken: true, how: 'kept' }
//
// The same held for a path given with an 8.3 short name and for one given all
// in lower case, because the root comes from git too. A Mac and Linux get
// git's path back unchanged.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, fromGit } from '../main/task-folders.mts';

describe('a path git lists', () => {
  it('is read in the backslashes the app builds with on Windows', () => {
    expect(fromGit('C:/Users/me/repo/.claude/worktrees/w-0123456789', 'win32'))
      .toBe('C:\\Users\\me\\repo\\.claude\\worktrees\\w-0123456789');
  });

  it('keeps a path with a space in it whole', () => {
    expect(fromGit('C:/Users/Some One/repo', 'win32')).toBe('C:\\Users\\Some One\\repo');
  });

  it.each(['darwin', 'linux'])('is left exactly as git wrote it on %s', (platform) => {
    expect(fromGit('/Users/me/repo/.claude/worktrees/w-0123456789', platform))
      .toBe('/Users/me/repo/.claude/worktrees/w-0123456789');
    // A backslash is an ordinary character in a name there.
    expect(fromGit('/home/me/a\\b', platform)).toBe('/home/me/a\\b');
  });
});

describe('the same task asked for twice on a real disk', () => {
  let dir;
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it('makes its folder once and then keeps it', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'found-where-git-lists-'));
    const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'ignore' });
    git('init', '-q');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    git('add', '.');
    git('commit', '-qm', 'a');

    const first = ensureTaskFolder(dir, 'w-0123456789', { dependencies: false });
    const second = ensureTaskFolder(dir, 'w-0123456789', { dependencies: false });

    expect(first).toMatchObject({ taken: true, created: true });
    expect(second).toMatchObject({ taken: true, how: 'kept', path: first.path });
  });
});
