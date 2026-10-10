// A FOLDER THAT HALF BUILT MUST NOT COST THE TASK ITS ISOLATION.
//
// FOUND 2026-10-07 (w-5952e6de3e), reviewing with Codex why people on X call
// agent worktrees brittle. This one is ours and it is the worst kind: it ends
// with two agents editing the same files and nothing on screen saying so.
//
// THE SEQUENCE, read out of main/task-folders.mjs.
//
//   1. A task has no branch yet, so `branchExists` is read as false, once.
//   2. The fast path runs. Its FIRST act is `worktree add --no-checkout -b`,
//      which CREATES the branch. Only then does it copy the files.
//   3. The copy or its verification fails. The rollback deliberately keeps the
//      branch, because every commit on a branch outlives any folder.
//   4. The ordinary path runs with the branchExists it read in step 1, which is
//      now stale, and asks git for `worktree add -b <branch>` a second time.
//      Git refuses: a branch of that name already exists.
//   5. `ensureTaskFolder` throws. main/supervisor.mjs catches it in two places
//      and both answer the same way: `console.warn('... is running in the
//      shared checkout')`, and hand the session the shared checkout.
//
// So one recoverable copy failure silently turns off the isolation this whole
// file exists to provide, and the only trace is a line in a console nobody has
// open. main/git-change.mjs says what that costs: the review card a person
// reads can then carry another agent's edits.
//
// WHAT TRIGGERS STEP 3 IN REAL LIFE. Anything that stops the copy finishing.
// Measured on this Mac the same day, the volume holding the checkouts was 96%
// full with 21 GiB free, so running out of space mid-copy is the ordinary case
// rather than the exotic one. The trigger used below is a directory the copy
// cannot read, because that is the one a test can arrange exactly.
//
// THE FIRST TRIGGER FOUND WAS A DIFFERENT BUG AND IS NOW FIXED. The copy used to
// skip the whole `.claude` directory, so a repository that COMMITS a file under
// it -- a `.claude/settings.json`, which is ordinary -- failed verification every
// single time, the clone being short a tracked file. That one is closed: the
// directory is copied child by child now, with only the folder other tasks live
// in left out. The last test here holds that closed, because it is the shape most
// likely to come back.
//
// WHAT MUST BE TRUE INSTEAD: the branch that survived step 3 is the task's own
// branch, so the second attempt ATTACHES to it rather than asking for it again,
// and never resets it, because by then it may carry commits.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, taskFolderPath, taskBranch } from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository shaped like one of the products, clean and on its main branch. */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'half-built-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/**
 * A tracked directory the copy cannot read. The clone creates the branch first
 * and reaches the copy second, so every clone from this checkout gets past the
 * door and then fails -- which is the only sequence that matters here. A full
 * disk arrives at the same line.
 */
const UNREADABLE = 'locked-away';
function theCopyCannotFinishIn(dir) {
  fs.mkdirSync(path.join(dir, UNREADABLE), { recursive: true });
  fs.writeFileSync(path.join(dir, UNREADABLE, 'kept.txt'), 'tracked all the same\n');
  git(dir, 'add', UNREADABLE);
  git(dir, 'commit', '-q', '-m', 'a directory that will be shut');
  fs.chmodSync(path.join(dir, UNREADABLE), 0o000);
}

/** A repository that commits a file under `.claude`, as many do. */
function commitsAFileUnderDotClaude(dir) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), '{"permissions":{}}\n');
  git(dir, 'add', '.claude/settings.json');
  git(dir, 'commit', '-q', '-m', 'settings everyone shares');
}

describe('a task whose first attempt at a folder failed', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => {
    // The shut directory has to be opened again or nothing can clean up.
    try { fs.chmodSync(path.join(dir, UNREADABLE), 0o755); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  // THE REPORTED CASE. The clone creates the branch, then fails.
  it('still gets its own folder, on its own branch', () => {
    theCopyCannotFinishIn(dir);

    const made = ensureTaskFolder(dir, 'w-halfbuilt');

    expect(made.path).toBe(taskFolderPath(dir, 'w-halfbuilt'));
    expect(made.branch).toBe(taskBranch('w-halfbuilt'));
    expect(git(made.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(taskBranch('w-halfbuilt'));
    // The ordinary path ran, and it reads the commit rather than the disk, so
    // the folder is whole even though the checkout beside it could not be read.
    expect(made.how).toBe('checkout');
    expect(git(made.path, 'status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(fs.readFileSync(path.join(made.path, UNREADABLE, 'kept.txt'), 'utf8'))
      .toBe('tracked all the same\n');
  });

  // THE BOUNDARY ON ONE SIDE: the branch already existed and carries commits.
  // Attaching must never reset it, or the second attempt eats the work the
  // first session did.
  it('keeps the commits already on a branch it attaches to', () => {
    const first = ensureTaskFolder(dir, 'w-hascommits');
    fs.writeFileSync(path.join(first.path, 'app.txt'), 'the agent changed this\n');
    git(first.path, 'commit', '-qam', 'the work');
    const workDone = git(first.path, 'rev-parse', 'HEAD');
    // Give the folder back without touching the branch, as closing a row does.
    git(dir, 'worktree', 'unlock', first.path);
    git(dir, 'worktree', 'remove', '--force', first.path);
    // And only NOW make every clone from this checkout fail.
    theCopyCannotFinishIn(dir);

    const again = ensureTaskFolder(dir, 'w-hascommits');

    expect(again.branch).toBe(taskBranch('w-hascommits'));
    expect(git(again.path, 'rev-parse', 'HEAD')).toBe(workDone);
    expect(fs.readFileSync(path.join(again.path, 'app.txt'), 'utf8')).toBe('the agent changed this\n');
  });

  // THE BOUNDARY ON THE OTHER SIDE: a failure BEFORE the branch is created.
  // A dirty checkout turns the fast path down at the door, so it never creates
  // a branch, and the ordinary path has to create it exactly once.
  it('still gets its own folder when the fast path never started', () => {
    fs.writeFileSync(path.join(dir, 'app.txt'), 'somebody is mid-edit\n');

    const made = ensureTaskFolder(dir, 'w-neverstarted');

    expect(made.how).toBe('checkout');
    expect(git(made.path, 'rev-parse', 'HEAD')).toBe(git(dir, 'rev-parse', 'refs/heads/main'));
    expect(fs.readFileSync(path.join(made.path, 'app.txt'), 'utf8')).toBe('one\n');
  });

  // AND THE CASE THAT MUST NOT MATCH: a checkout with nothing in its way still
  // takes the fast path. Without this the bug above could be "fixed" by turning
  // the clone off, and every test here would still pass.
  it('does not stop the clone being used when there is nothing wrong', () => {
    const made = ensureTaskFolder(dir, 'w-fastpath');

    expect(made.how).toBe('clone');
    expect(git(made.path, 'status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(git(made.path, 'rev-parse', 'HEAD')).toBe(git(dir, 'rev-parse', 'refs/heads/main'));
  });

  // A SUBMODULE TURNS THE CLONE DOWN AT THE DOOR, which is not the same as
  // failing it. `ls-files` reports one as mode 160000: a pointer, not a directory
  // of files, so copying whatever is on disk there would hand the folder another
  // repository's administration rather than its own, and `git worktree move`
  // refuses a worktree holding one. The ordinary checkout knows what a submodule
  // is, so a repository with any is left to it. Codex's review, 2026-10-07.
  it('leaves a repository with submodules to the ordinary checkout', () => {
    const inner = fs.mkdtempSync(path.join(os.tmpdir(), 'submodule-'));
    git(inner, 'init', '-q', '-b', 'main');
    git(inner, 'config', 'user.email', 'test@example.com');
    git(inner, 'config', 'user.name', 'Test');
    fs.writeFileSync(path.join(inner, 'lib.txt'), 'shared code\n');
    git(inner, 'add', '.');
    git(inner, 'commit', '-q', '-m', 'the library');
    git(dir, '-c', 'protocol.file.allow=always', 'submodule', '--quiet', 'add', inner, 'vendor');
    git(dir, 'commit', '-q', '-m', 'bring the library in');

    const made = ensureTaskFolder(dir, 'w-submodule');

    expect(made.how).toBe('checkout');
    expect(fs.existsSync(path.join(made.path, 'app.txt'))).toBe(true);
    try { fs.rmSync(inner, { recursive: true, force: true }); } catch {}
  });

  // THE FIRST TRIGGER, HELD CLOSED. A repository that commits a file under
  // `.claude` used to fail every clone, because the copy skipped that directory
  // whole and the clone was then short a tracked file. It clones now, and the
  // folder other tasks live in still does not travel.
  it('clones a repository that commits a file under .claude', () => {
    commitsAFileUnderDotClaude(dir);
    const neighbour = ensureTaskFolder(dir, 'w-neighbour');
    expect(fs.existsSync(neighbour.path)).toBe(true);

    const made = ensureTaskFolder(dir, 'w-dotclaude');

    expect(made.how).toBe('clone');
    expect(fs.existsSync(path.join(made.path, '.claude', 'settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(made.path, '.claude', 'worktrees'))).toBe(false);
    expect(git(made.path, 'status', '--porcelain', '--untracked-files=no')).toBe('');
  });
});
