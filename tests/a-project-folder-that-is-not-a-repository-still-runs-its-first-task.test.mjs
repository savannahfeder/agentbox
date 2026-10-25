// A PROJECT FOLDER THAT IS NOT A GIT REPOSITORY STILL RUNS ITS FIRST TASK.
//
// REPORTED 2026-10-14 by a teammate trying the team version: "My first task
// failed with 'no folder could be made' until I turned the project folder into
// a git repo (git init plus a first commit)."
//
// Measured on this branch before the fix: `ensureTaskFolder` over a plain
// folder answered null (no repository), and over a folder that had been
// `git init`-ed with no commit yet it threw "invalid reference: HEAD". Both
// end in `_couldNotGetAFolder`, so EVERY task in such a project said "no
// folder could be made" and none ever ran. New Project even creates the folder
// it is given when it is missing, so a project started from an empty folder
// failed its first task every time.
//
// The refusal itself is right and stays (tests/a-task-with-no-folder-does-not-
// run-in-the-shared-checkout): a task never shares a folder with another
// agent. What was wrong is that the app could not make the folder in the first
// place. So it does the two steps the person did by hand: it makes the folder
// a repository, and it makes the first commit of what is already there, which
// respects a .gitignore if the folder has one. Nothing leaves the machine.
//
// AND WHAT MUST NOT CHANGE: a repository that already has a commit is never
// committed to, so its uncommitted work stays exactly as it was.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, taskFolderPath } from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return null; } };

const made = [];
const folder = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('a project folder that is not a git repository', () => {
  it('gives the task its own folder holding the files that were already there', () => {
    const dir = folder('plain-project-');
    fs.writeFileSync(path.join(dir, 'notes.md'), 'what I have so far\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'console.log(1)\n');

    const got = ensureTaskFolder(dir, 'w-plain', { dependencies: false });

    expect(got?.taken).toBe(true);
    expect(got.path).toBe(taskFolderPath(dir, 'w-plain'));
    expect(fs.readFileSync(path.join(got.path, 'notes.md'), 'utf8')).toBe('what I have so far\n');
    expect(fs.readFileSync(path.join(got.path, 'src', 'app.js'), 'utf8')).toBe('console.log(1)\n');
    // And the project folder itself is now a repository with one commit, its
    // own files untouched and nothing left uncommitted.
    expect(git(dir, 'rev-list', '--count', 'HEAD')).toBe('1');
    expect(fs.readFileSync(path.join(dir, 'notes.md'), 'utf8')).toBe('what I have so far\n');
    expect(git(dir, 'status', '--porcelain')).toBe('');
  }, 30_000);

  it('works for an empty folder, which is what New Project makes when the folder is missing', () => {
    const dir = folder('empty-project-');

    const got = ensureTaskFolder(dir, 'w-empty', { dependencies: false });

    expect(got?.taken).toBe(true);
    expect(fs.existsSync(got.path)).toBe(true);
  }, 30_000);

  it('works for a folder that was made a repository but never committed to', () => {
    const dir = folder('unborn-project-');
    git(dir, 'init', '-q');
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>hi</h1>\n');

    const got = ensureTaskFolder(dir, 'w-unborn', { dependencies: false });

    expect(got?.taken).toBe(true);
    expect(fs.readFileSync(path.join(got.path, 'index.html'), 'utf8')).toBe('<h1>hi</h1>\n');
  }, 30_000);

  it('leaves out what the folder’s .gitignore leaves out, and the task folders themselves', () => {
    const dir = folder('ignored-project-');
    fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1\n');
    fs.writeFileSync(path.join(dir, 'app.js'), 'x\n');

    ensureTaskFolder(dir, 'w-ignored', { dependencies: false });
    const second = ensureTaskFolder(dir, 'w-ignored-two', { dependencies: false });

    const committed = git(dir, 'ls-files').split('\n');
    expect(committed).toContain('app.js');
    expect(committed).not.toContain('.env');
    expect(committed.some((f) => f.startsWith('.claude/'))).toBe(false);
    // The second task came off the same first commit; no second one was made.
    expect(second?.taken).toBe(true);
    expect(git(dir, 'rev-list', '--count', 'HEAD')).toBe('1');
  }, 30_000);

  it('still works on a Mac where git has never been told who you are', () => {
    const dir = folder('nobody-project-');
    const blank = path.join(folder('blank-git-config-'), 'gitconfig');
    fs.writeFileSync(blank, '');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
    const was = { global: process.env.GIT_CONFIG_GLOBAL, nosystem: process.env.GIT_CONFIG_NOSYSTEM };
    process.env.GIT_CONFIG_GLOBAL = blank;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    try {
      const got = ensureTaskFolder(dir, 'w-nobody', { dependencies: false });
      expect(got?.taken).toBe(true);
      expect(git(dir, 'log', '-1', '--format=%an')).not.toBe('');
    } finally {
      if (was.global === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = was.global;
      if (was.nosystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM; else process.env.GIT_CONFIG_NOSYSTEM = was.nosystem;
    }
  }, 30_000);
});

// A FOLDER TOO BIG TO COMMIT BY ITSELF IS LEFT ALONE, AND SAYS WHAT TO DO.
//
// Measured on the founder's store the same day: of 19 projects with a folder,
// one was not a repository, and it held 18 GB, mostly media libraries. A first
// commit of that copies all 18 GB into .git and runs for minutes. So past a
// size the app makes nothing, removes the repository it just started, and the
// task says in plain words how to fix it. A sparse file stands in for the size
// here, so the test writes nothing to the disk.
describe('a project folder too big to commit by itself', () => {
  it('is refused with the size and the fix, and left exactly as it was', () => {
    const dir = folder('huge-project-');
    fs.writeFileSync(path.join(dir, 'small.txt'), 'x\n');
    const big = path.join(dir, 'footage.mov');
    fs.writeFileSync(big, '');
    fs.truncateSync(big, 600 * 1024 * 1024);

    expect(() => ensureTaskFolder(dir, 'w-huge', { dependencies: false }))
      .toThrow(/not a git repository.*600 MB.*git init/s);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(false);
    expect(fs.readdirSync(dir).sort()).toEqual(['footage.mov', 'small.txt']);
  }, 30_000);

  it('is not refused for size when the .gitignore leaves the big files out', () => {
    const dir = folder('ignored-huge-project-');
    fs.writeFileSync(path.join(dir, '.gitignore'), '*.mov\n');
    const big = path.join(dir, 'footage.mov');
    fs.writeFileSync(big, '');
    fs.truncateSync(big, 600 * 1024 * 1024);

    const got = ensureTaskFolder(dir, 'w-ignored-huge', { dependencies: false });
    expect(got?.taken).toBe(true);
    expect(git(dir, 'ls-files')).toBe('.gitignore');
  }, 30_000);
});

describe('a repository that already has a commit', () => {
  it('is never committed to, so the work in it stays uncommitted', () => {
    const dir = folder('real-repo-');
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@example.com');
    git(dir, 'config', 'user.name', 'Test');
    fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'first');
    const head = git(dir, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(dir, 'app.txt'), 'edited, not committed\n');
    fs.writeFileSync(path.join(dir, 'new.txt'), 'untracked\n');

    const got = ensureTaskFolder(dir, 'w-real', { dependencies: false });

    expect(got?.taken).toBe(true);
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(dir, 'status', '--porcelain').split('\n').map((l) => l.trim()).sort())
      .toEqual(['?? new.txt', 'M app.txt']);
    expect(tryGit(dir, 'rev-list', '--count', 'HEAD')).toBe('1');
  }, 30_000);
});
