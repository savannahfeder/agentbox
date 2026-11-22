// A TASK WHOSE BRANCH IS OPEN IN ANOTHER FOLDER STILL GETS ITS OWN.
//
// Found 2026-11-12 on "Mobile task auto-advance not working": its branch
// agentbox/w-0e77857f54 was checked out in a folder beside the repository
// (~/Desktop/dev/agentbox-w-0e77857f54), made outside the app. Every attempt
// at the task's own folder died on git's "is already checked out at", the
// row said "could not be given a folder" with causes that did not apply, and
// a reply only repeated it. Reproduced below with a real git: a linked
// worktree elsewhere on the task's branch, with a commit on it, then
// ensureTaskFolder threw.
//
// A clean folder elsewhere gives the branch up (detached at the same commit,
// every file left where it is) and the task gets its folder on that branch.
// A folder elsewhere with uncommitted work, a locked one, or the main checkout
// itself is never touched, and the refusal is git's, naming that folder.
//
// Git words that refusal two ways: "is already checked out at" on 2.39 and
// "is already used by worktree at" on 2.56, which GitHub's runners have. The
// refusals here pinned the first, so main went red on every run from
// 2026-11-12; measured by running this file under a git 2.56 built from source.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, taskFolderPath, taskBranch } from '../main/task-folders.mts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const openAt = (folder: string) => new RegExp(`already (checked out|used by worktree) at '${escaped(folder)}'`);

let base: string;
let dir: string;
let elsewhere: string;
const id = 'w-elsewhere';

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'branch-elsewhere-')));
  dir = path.join(base, 'repo');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  // Beside the repository, the way the folder in the report was.
  elsewhere = path.join(base, `repo-${id}`);
  git(dir, 'worktree', 'add', '-q', '-b', taskBranch(id), elsewhere);
  fs.writeFileSync(path.join(elsewhere, 'work.txt'), 'committed work\n');
  git(elsewhere, 'add', 'work.txt');
  git(elsewhere, 'commit', '-q', '-m', 'work on the task');
});

afterEach(() => { fs.rmSync(base, { recursive: true, force: true }); });

const branchAt = (folder: string) => git(folder, 'branch', '--show-current');

describe('a task whose branch is open in another folder', () => {
  it('gets its own folder on that branch when the other folder has nothing uncommitted', () => {
    const tip = git(elsewhere, 'rev-parse', 'HEAD');

    const got = ensureTaskFolder(dir, id, { dependencies: false });

    expect(got).toMatchObject({ taken: true, path: taskFolderPath(dir, id), branch: taskBranch(id) });
    const folder = taskFolderPath(dir, id);
    expect(branchAt(folder)).toBe(taskBranch(id));
    expect(fs.readFileSync(path.join(folder, 'work.txt'), 'utf8')).toBe('committed work\n');
    // The other folder is still there, at the same commit, with its files.
    expect(fs.readFileSync(path.join(elsewhere, 'work.txt'), 'utf8')).toBe('committed work\n');
    expect(git(elsewhere, 'rev-parse', 'HEAD')).toBe(tip);
    expect(branchAt(elsewhere)).toBe('');
  }, 30_000);

  it('counts ignored files as nothing to lose', () => {
    fs.mkdirSync(path.join(elsewhere, 'node_modules'));
    fs.writeFileSync(path.join(elsewhere, 'node_modules', 'x.js'), '');

    expect(ensureTaskFolder(dir, id, { dependencies: false })).toMatchObject({ taken: true });
    expect(fs.existsSync(path.join(elsewhere, 'node_modules', 'x.js'))).toBe(true);
  }, 30_000);

  it('leaves a folder with uncommitted work alone and names it', () => {
    fs.writeFileSync(path.join(elsewhere, 'work.txt'), 'half done\n');

    expect(() => ensureTaskFolder(dir, id, { dependencies: false }))
      .toThrow(openAt(elsewhere));
    expect(branchAt(elsewhere)).toBe(taskBranch(id));
    expect(fs.readFileSync(path.join(elsewhere, 'work.txt'), 'utf8')).toBe('half done\n');
    expect(fs.existsSync(taskFolderPath(dir, id))).toBe(false);
  }, 30_000);

  it('counts a new file nobody has added as uncommitted work', () => {
    fs.writeFileSync(path.join(elsewhere, 'notes.md'), 'draft\n');

    expect(() => ensureTaskFolder(dir, id, { dependencies: false })).toThrow(openAt(elsewhere));
    expect(branchAt(elsewhere)).toBe(taskBranch(id));
  }, 30_000);

  it('leaves a folder somebody locked alone', () => {
    git(dir, 'worktree', 'lock', '--reason', 'mine', elsewhere);

    expect(() => ensureTaskFolder(dir, id, { dependencies: false })).toThrow(openAt(elsewhere));
    expect(branchAt(elsewhere)).toBe(taskBranch(id));
  }, 30_000);

  it('never takes the branch off the main checkout', () => {
    git(elsewhere, 'checkout', '-q', '--detach');
    git(dir, 'checkout', '-q', taskBranch(id));

    expect(() => ensureTaskFolder(dir, id, { dependencies: false })).toThrow(openAt(dir));
    expect(branchAt(dir)).toBe(taskBranch(id));
  }, 30_000);
});
