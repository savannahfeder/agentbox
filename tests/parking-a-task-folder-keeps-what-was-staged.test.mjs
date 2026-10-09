// PARKING A TASK FOLDER KEEPS WHAT WAS STAGED, NOT JUST WHAT WAS ON DISK.
//
// FOUND 2026-10-07 reading main/task-folders.mjs (w-5952e6de3e, with Codex).
// `parkTaskFolder` committed the work with `git add -A` and `restoreTaskFolder`
// undid it with a mixed reset, and the file said a reopened task comes back
// "staged exactly as they were". It did not: `add -A` REPLACES the index with
// the working tree, so the two were flattened into one.
//
// MEASURED BY HAND, which is what this file now does instead. Stage version A
// of a file, edit the working copy to B, park, reopen: B came back as an
// unstaged change and A was nowhere, with nothing to say it had ever been
// staged. An agent part way through preparing a commit — a rename staged, one
// of three files added, a hunk staged and the rest left — lost that
// arrangement on any close, accidental or not. The round-trip test only ever
// exercised unstaged changes, so it passed.
//
// So the index is committed first, exactly as it stands, and the working tree
// second. Both trees go onto the task's own branch, and reopening unwinds them
// in the other order: a mixed reset fills the index in from the index commit,
// then a soft reset puts HEAD back without touching either. The branch grows
// nothing, which is what stops a row closed five times from growing five
// commits nobody wrote.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureTaskFolder, parkTaskFolder, restoreTaskFolder, PARKED,
} from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'folder-parking-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/** What git has in the index for a file, which is the half that used to go. */
const staged = (folder, file) => git(folder, 'show', `:${file}`);

/**
 * `status --porcelain` WITHOUT trimming the front of it. The first column is
 * the index and the second the working tree, so ' M' and 'M ' are the whole
 * difference this file is about and a trim throws it away.
 */
const status = (folder) => execFileSync('git', ['status', '--porcelain'], {
  cwd: folder, encoding: 'utf8',
}).replace(/\n+$/, '');

describe('reopening a parked task', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  // THE ONE THE ROW IS FOR: the staged version and the working copy are two
  // different things and both have to come back.
  it('brings back the staged version and the working copy, each as it was', () => {
    const folder = ensureTaskFolder(dir, 'w-mid-commit');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'the version I staged\n');
    git(folder.path, 'add', 'app.txt');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'and then I kept typing\n');
    const before = status(folder.path);
    const head = git(folder.path, 'rev-parse', 'HEAD');

    expect(parkTaskFolder(dir, 'w-mid-commit').parked).toBe(true);
    const back = restoreTaskFolder(dir, 'w-mid-commit');

    expect(staged(back.path, 'app.txt')).toBe('the version I staged');
    expect(fs.readFileSync(path.join(back.path, 'app.txt'), 'utf8')).toBe('and then I kept typing\n');
    // Which is what `status` says in two columns: staged change, and a further
    // change beside it that is not staged.
    expect(status(back.path)).toBe(before);
    expect(status(back.path)).toBe('MM app.txt');
    // And the branch is exactly where it was: no parking commits left on it.
    expect(git(back.path, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(back.path, 'log', '--format=%s', '-1')).toBe('first');
  });

  it('keeps a file that was added but never committed staged', () => {
    const folder = ensureTaskFolder(dir, 'w-added');
    fs.writeFileSync(path.join(folder.path, 'new.txt'), 'brand new\n');
    git(folder.path, 'add', 'new.txt');
    fs.writeFileSync(path.join(folder.path, 'untracked.txt'), 'never added\n');

    parkTaskFolder(dir, 'w-added');
    const back = restoreTaskFolder(dir, 'w-added');

    expect(git(back.path, 'diff', '--cached', '--name-only')).toBe('new.txt');
    expect(staged(back.path, 'new.txt')).toBe('brand new');
    // And the one nobody added is back on disk and still nobody's business.
    expect(fs.readFileSync(path.join(back.path, 'untracked.txt'), 'utf8')).toBe('never added\n');
    expect(status(back.path)).toBe('A  new.txt\n?? untracked.txt');
  });

  // THE BOUNDARY THE OTHER SIDE: work nobody staged must come back UNSTAGED.
  // Committing the index first must not quietly stage the lot.
  it('leaves work that was never staged unstaged', () => {
    const folder = ensureTaskFolder(dir, 'w-unstaged');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'half finished\n');

    parkTaskFolder(dir, 'w-unstaged');
    const back = restoreTaskFolder(dir, 'w-unstaged');

    expect(status(back.path)).toBe(' M app.txt');
    expect(git(back.path, 'diff', '--cached', '--name-only')).toBe('');
    expect(fs.readFileSync(path.join(back.path, 'app.txt'), 'utf8')).toBe('half finished\n');
  });

  // A FOLDER PARKED BEFORE THIS LANDED. There are branches on this Mac
  // carrying the old single commit, and they still have to come back.
  it('still reopens a task parked the old way, with one commit and no index under it', () => {
    const folder = ensureTaskFolder(dir, 'w-parked-before');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'parked by the old code\n');
    git(folder.path, 'add', '-A');
    git(folder.path, 'commit', '--no-verify', '-q', '-m', PARKED);
    git(dir, 'worktree', 'unlock', folder.path);
    git(dir, 'worktree', 'remove', folder.path);

    const back = restoreTaskFolder(dir, 'w-parked-before');

    expect(fs.readFileSync(path.join(back.path, 'app.txt'), 'utf8')).toBe('parked by the old code\n');
    expect(status(back.path)).toBe(' M app.txt');
    expect(git(back.path, 'log', '--format=%s', '-1')).toBe('first');
  });

  // THE CASE THAT MUST NOT MATCH: a folder with nothing uncommitted gets no
  // parking commits, so reopening must not unpick the work itself.
  it('does not touch the branch of a task that had nothing uncommitted', () => {
    const folder = ensureTaskFolder(dir, 'w-nothing-left');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'the work itself\n');
    git(folder.path, 'add', '-A');
    git(folder.path, 'commit', '-q', '-m', 'the work itself');
    const head = git(folder.path, 'rev-parse', 'HEAD');

    expect(parkTaskFolder(dir, 'w-nothing-left').kept).toBe('nothing uncommitted');
    const back = restoreTaskFolder(dir, 'w-nothing-left');

    expect(git(back.path, 'rev-parse', 'HEAD')).toBe(head);
    expect(status(back.path)).toBe('');
    expect(git(back.path, 'log', '--format=%s', '-1')).toBe('the work itself');
  });

  // Closed and reopened over and over, which is how a row is actually used.
  it('survives being closed and reopened three times with the same two halves', () => {
    const folder = ensureTaskFolder(dir, 'w-again-and-again');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'staged\n');
    git(folder.path, 'add', 'app.txt');
    fs.writeFileSync(path.join(folder.path, 'app.txt'), 'and working\n');

    let back = folder;
    for (let i = 0; i < 3; i += 1) {
      expect(parkTaskFolder(dir, 'w-again-and-again').parked).toBe(true);
      back = restoreTaskFolder(dir, 'w-again-and-again');
      expect(staged(back.path, 'app.txt')).toBe('staged');
      expect(fs.readFileSync(path.join(back.path, 'app.txt'), 'utf8')).toBe('and working\n');
    }
    expect(git(back.path, 'log', '--format=%s')).toBe('first');
  });
});
