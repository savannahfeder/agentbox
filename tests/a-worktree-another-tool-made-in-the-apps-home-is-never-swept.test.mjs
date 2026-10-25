// ANOTHER TOOL'S WORKTREE IN THE APP'S OWN HOME WAS PARKED AND DELETED
// (GitHub issue #43).
//
// WHAT BROKE. Claude Code's desktop app makes its worktrees exactly where this
// app makes its own, `<repo>/.claude/worktrees/<slug>-<hex>`, on a branch
// `claude/<name>`. `inventoryWorktrees` decided `ours` by location and name
// shape alone, so those passed, and `parkClosedFolders` found no row for their
// id and parked them: three folders with live Claude Code sessions in them were
// removed seconds after launch, and a dirty one would have had two "parked"
// commits written onto a branch this app never made.
//
// HOW IT WAS MEASURED. A temp repository with a worktree made by `git worktree
// add` at `.claude/worktrees/<name>` on `claude/<name>`, then one sweep: before
// the fix the folder was gone and its branch carried the parked commits.
//
// THE FIX: a folder is ours only when it is also on a branch this app names,
// `agentbox/<id>` (`taskBranch`). Anything else in that home is a stray: listed,
// never swept.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureTaskFolder, inventoryWorktrees, strayWorktrees, listTaskFolders, taskBranch,
  releaseTaskFolder, parkTaskFolder,
} from '../main/task-folders.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'other-tools-worktrees-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/** A worktree at the app's own home, made the way another tool would make it. */
function inTheHome(dir, name, how, from = []) {
  const at = path.join(fs.realpathSync(dir), '.claude', 'worktrees', name);
  git(dir, 'worktree', 'add', '-q', ...how, at, ...from);
  return at;
}

const found = (list, at) => list.find((w) => w.path === fs.realpathSync(at)) ?? null;

function supervisorOver(repoPath, rows = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'other-tools-sup-'));
  const product = { slug: 'agentbox', dir, repoPath };
  const sup = new Supervisor(
    {
      home: path.join(dir, 'home'),
      storeRoot: dir,
      claudeBin: '/nonexistent/claude',
      codexBin: '/nonexistent/codex',
      maxConcurrentSessions: 3,
      authProfiles: ['default'],
      codexHome: path.join(dir, 'codex-home'),
    },
    {
      listItems: () => rows,
      listProducts: () => [product],
      readItem: (slug, id) => rows.find((r) => r.id === id) ?? null,
      isDue: () => true,
      settleAnswer() {},
      recordSessionResult() {},
    },
    '/nonexistent-app',
  );
  return { sup, product, store: dir };
}

describe('a worktree another tool made in the app´s own home', () => {
  let dir;
  const made = [];
  beforeEach(() => { dir = repo(); });
  afterEach(() => {
    for (const d of [dir, ...made]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
    made.length = 0;
  });

  // THE REPORTED CASE, dirty, which is the one that would have lost work.
  it('is never parked or removed, and its branch gets no commit', async () => {
    const theirs = inTheHome(dir, 'eager-otter-3f9a1c', ['-b', 'claude/eager-otter-3f9a1c']);
    fs.writeFileSync(path.join(theirs, 'app.txt'), 'a live session´s work\n');

    const { sup, product, store } = supervisorOver(dir);
    made.push(store);
    expect(await sup.parkClosedFolders(product)).toBe(0);

    expect(fs.existsSync(theirs)).toBe(true);
    expect(git(theirs, 'status', '--porcelain')).toContain('app.txt');
    expect(git(dir, 'log', '--format=%s', '-1', 'claude/eager-otter-3f9a1c')).toBe('first');
  });

  it('is shown as a stray and not as a task folder', () => {
    const theirs = inTheHome(dir, 'eager-otter-3f9a1c', ['-b', 'claude/eager-otter-3f9a1c']);
    expect(found(inventoryWorktrees(dir), theirs).ours).toBe(false);
    expect(listTaskFolders(dir)).toEqual([]);
    expect(strayWorktrees(dir).map((w) => w.path)).toEqual([fs.realpathSync(theirs)]);
  });

  // Named exactly like a finished row, which is every other check parking has.
  it('is left alone even when its name is a finished row´s id', async () => {
    const theirs = inTheHome(dir, 'w-finished', ['-b', 'claude/w-finished']);
    fs.writeFileSync(path.join(theirs, 'app.txt'), 'not the row´s work\n');
    const { sup, product, store } = supervisorOver(dir, [
      { id: 'w-finished', product: 'agentbox', status: 'done' },
    ]);
    made.push(store);
    expect(await sup.parkClosedFolders(product)).toBe(0);
    expect(fs.existsSync(theirs)).toBe(true);
    expect(git(dir, 'log', '--format=%s', '-1', 'claude/w-finished')).toBe('first');
  });

  // THE BOUNDARY: the prefix has to be the whole first segment, not just text
  // the branch happens to start or contain.
  it('is not ours for a branch that only looks like the app´s', () => {
    const near = inTheHome(dir, 'w-near', ['-b', `${taskBranch('x').split('/')[0]}er/w-near`]);
    const inside = inTheHome(dir, 'w-inside', ['-b', `claude/${taskBranch('w-inside')}`]);
    expect(found(inventoryWorktrees(dir), near).ours).toBe(false);
    expect(found(inventoryWorktrees(dir), inside).ours).toBe(false);
  });

  // A folder on no branch at all says nothing about who made it.
  it('is not ours when it is on no branch', () => {
    const detached = inTheHome(dir, 'w-detached', ['--detach'], ['main']);
    expect(found(inventoryWorktrees(dir), detached).ours).toBe(false);
    expect(listTaskFolders(dir)).toEqual([]);
  });

  // THE CASE THAT MUST STILL MATCH: the app's own folder, on its own branch.
  it('does not stop the app putting away its own folder beside it', async () => {
    const mine = ensureTaskFolder(dir, 'w-finished');
    fs.writeFileSync(path.join(mine.path, 'app.txt'), 'marked done\n');
    const theirs = inTheHome(dir, 'eager-otter-3f9a1c', ['-b', 'claude/eager-otter-3f9a1c']);

    expect(found(inventoryWorktrees(dir), mine.path).ours).toBe(true);
    expect(listTaskFolders(dir).map((f) => f.path)).toEqual([mine.path]);

    const { sup, product, store } = supervisorOver(dir, [
      { id: 'w-finished', product: 'agentbox', status: 'done' },
    ]);
    made.push(store);
    expect(await sup.parkClosedFolders(product)).toBe(1);
    expect(fs.existsSync(mine.path)).toBe(false);
    expect(git(dir, 'show', `${taskBranch('w-finished')}:app.txt`)).toBe('marked done');
    expect(fs.existsSync(theirs)).toBe(true);
  });
});

/* ========= and the two calls that are handed a task id, not a list ========= */
// FOUND IN REVIEW, NOT IN THE REPORT. A session ending calls `releaseTaskFolder`
// with its row id, and the sweep's `parkTaskFolder` runs a moment after the
// list it was handed was read. Neither asked which branch the folder was on, so
// a foreign folder sharing a row's name, or the app's own folder an agent had
// moved off its branch (a rebase left mid-flight is a detached HEAD), could
// still be committed onto and removed. Parking a detached folder wrote its
// commits onto no branch at all and then deleted the only copy.
describe('releasing or parking by task id', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('will not release a clean, merged folder on another tool´s branch', () => {
    const theirs = inTheHome(dir, 'w-row', ['-b', 'claude/w-row']);
    expect(releaseTaskFolder(dir, 'w-row').reason).toBe('not-ours');
    expect(fs.existsSync(theirs)).toBe(true);
  });

  it('will not park a dirty folder on another tool´s branch', () => {
    const theirs = inTheHome(dir, 'w-row', ['-b', 'claude/w-row']);
    fs.writeFileSync(path.join(theirs, 'app.txt'), 'their work\n');
    expect(parkTaskFolder(dir, 'w-row').reason).toBe('not-ours');
    expect(fs.existsSync(theirs)).toBe(true);
    expect(git(dir, 'log', '--format=%s', '-1', 'claude/w-row')).toBe('first');
  });

  it('will not park its own folder once an agent has moved it to another branch', () => {
    const mine = ensureTaskFolder(dir, 'w-moved');
    git(mine.path, 'checkout', '-q', '-b', 'side');
    fs.writeFileSync(path.join(mine.path, 'app.txt'), 'on the side\n');
    expect(parkTaskFolder(dir, 'w-moved').reason).toBe('not-ours');
    expect(fs.existsSync(mine.path)).toBe(true);
    expect(git(dir, 'log', '--format=%s', '-1', 'side')).toBe('first');
  });

  it('will not park its own folder while it is on no branch, where the work would be lost', () => {
    const mine = ensureTaskFolder(dir, 'w-detached');
    git(mine.path, 'checkout', '-q', '--detach');
    fs.writeFileSync(path.join(mine.path, 'app.txt'), 'mid rebase\n');
    expect(parkTaskFolder(dir, 'w-detached').reason).toBe('not-ours');
    expect(fs.existsSync(mine.path)).toBe(true);
    expect(git(mine.path, 'status', '--porcelain')).toContain('app.txt');
  });

  // THE CASE THAT MUST STILL WORK, through both calls.
  it('still parks and releases its own folder on its own branch', () => {
    const parked = ensureTaskFolder(dir, 'w-parked');
    fs.writeFileSync(path.join(parked.path, 'app.txt'), 'kept\n');
    expect(parkTaskFolder(dir, 'w-parked').parked).toBe(true);
    expect(git(dir, 'show', `${taskBranch('w-parked')}:app.txt`)).toBe('kept');

    const released = ensureTaskFolder(dir, 'w-released');
    expect(releaseTaskFolder(dir, 'w-released').removed).toBe(true);
    expect(fs.existsSync(released.path)).toBe(false);
  });
});
