// A TASK FOLDER HAS ONE OWNER AT A TIME, AND TAKING IT IS AN ANSWER.
//
// FOUND 2026-10-07 reading main/task-folders.mjs (w-5952e6de3e, with Codex).
// Nothing in that file actually OWNED a folder: taking one could not fail, and
// the owner written into the lock was never replaced.
//
// THE SEQUENCE, measured by hand before this file existed. Process A makes the
// folder and locks it with its own pid. A exits, which is every time the app
// restarts. B picks the row up and reuses the folder, and `lock()` returned
// without writing anything, because it only ever wrote a lock when there was
// none. So the folder B is standing in still names A. C then reads that lock,
// asks the kernel whether A is alive, is told no, and is free to delete the
// folder under B: a folder fresh off main is clean and already merged, which is
// exactly the case `releaseTaskFolder` DELETES. That pid is the only protection
// `releaseTaskFolder` and `parkTaskFolder` have, and it was stale for every
// folder the app had ever restarted over.
//
// A LIVE FOREIGN LOCK DID NOT STOP REUSE EITHER. The early return in
// `ensureTaskFolder` handed the folder back whatever the lock said, so two app
// processes over one checkout — one running from the app folder and one from a
// checkout, which happens here daily — both got the same folder and reported
// success.
//
// AND THE SAME HOLE WAS IN THE HALF-BUILT COPY. A folder is built at
// `.building-<id>` and `clearUnfinished` threw away anything already there on
// the grounds that it must have been abandoned. True inside one process, where
// the folder thread serialises the requests; not true across two, and the build
// window got wider when the local files started being carried in.
//
// So acquiring a folder answers: taken, or refused and by whom. Taking over a
// dead owner's lock is a deliberate step that WRITES the new owner. A lock
// somebody put on by hand is nobody's to take. And a staging folder carries the
// same ownership, so one app's build is not swept by the other's.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureTaskFolder, releaseTaskFolder, parkTaskFolder, listTaskFolders,
  taskFolderPath, buildingFolderPath,
} from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'folder-owner-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/** The reason git is holding against a worktree, or null when it holds none. */
function lockOn(dir, folder) {
  const lines = git(dir, 'worktree', 'list', '--porcelain').split('\n');
  const at = lines.indexOf(`worktree ${folder}`);
  if (at < 0) return null;
  for (let i = at + 1; i < lines.length && lines[i] !== ''; i += 1) {
    if (lines[i].startsWith('locked')) return lines[i].slice(6).trim();
  }
  return null;
}

/**
 * A PID THAT HAS CERTAINLY EXITED, which is what the app's own pid is to every
 * folder it made before its last restart. A shell asked for its own pid has
 * exited by the time we read the number, and this asks the kernel rather than
 * assuming: a pid the system has already handed to somebody else would make
 * this file pass or fail for a reason that has nothing to do with the code.
 */
function aPidThatHasExited() {
  for (let i = 0; i < 20; i += 1) {
    const pid = Number(execFileSync('sh', ['-c', 'echo $$'], { encoding: 'utf8' }).trim());
    try { process.kill(pid, 0); } catch { return pid; }
  }
  throw Error('every shell pid this borrowed was still alive');
}

describe('owning the folder a task works in', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('writes its own pid into the lock of the folder it makes', () => {
    const made = ensureTaskFolder(dir, 'w-fresh');
    expect(made.taken).toBe(true);
    expect(made.heldBy).toBe(process.pid);
    expect(lockOn(dir, made.path)).toBe(`agentbox pid=${process.pid}`);
  });

  // THE ONE THE ROW IS FOR. The app restarted, so the folder's first owner is
  // gone. Picking it up again has to say so in the lock.
  it('takes over a folder whose owner has exited, and writes the new owner', () => {
    const gone = aPidThatHasExited();
    const first = ensureTaskFolder(dir, 'w-restarted', { pid: gone });
    expect(lockOn(dir, first.path)).toBe(`agentbox pid=${gone}`);

    const again = ensureTaskFolder(dir, 'w-restarted');
    expect(again.taken).toBe(true);
    expect(again.created).toBe(false);
    expect(again.path).toBe(first.path);
    expect(again.heldBy).toBe(process.pid);
    expect(lockOn(dir, again.path)).toBe(`agentbox pid=${process.pid}`);
  });

  // AND WHAT THAT STALE PID COST: the folder could be taken out from under the
  // process that had just picked the row up.
  it('stops anybody else removing a folder it has taken over', () => {
    const gone = aPidThatHasExited();
    ensureTaskFolder(dir, 'w-taken-over', { pid: gone });
    const mine = ensureTaskFolder(dir, 'w-taken-over');

    // Clean and already in main, which is the one case release deletes.
    expect(git(mine.path, 'status', '--porcelain')).toBe('');
    const released = releaseTaskFolder(dir, 'w-taken-over', { pid: process.pid + 1 });
    expect(released.removed).toBe(false);
    expect(released.reason).toBe('held');
    const parked = parkTaskFolder(dir, 'w-taken-over', { pid: process.pid + 1 });
    expect(parked.parked).toBe(false);
    expect(parked.reason).toBe('held');
    expect(fs.existsSync(mine.path)).toBe(true);
  });

  // The second app process over one checkout. It used to be handed the folder
  // the first one was working in, and told it had succeeded.
  it('refuses a folder another live process holds, and names who holds it', () => {
    const theirs = ensureTaskFolder(dir, 'w-two-apps', { pid: process.pid });

    const asked = ensureTaskFolder(dir, 'w-two-apps', { pid: process.pid + 1 });
    expect(asked.taken).toBe(false);
    expect(asked.heldBy).toBe(process.pid);
    expect(asked.reason).toBe('held');
    // No path, because there is no folder this asker may work in.
    expect(asked.path).toBe(null);
    // And nothing was disturbed: the folder and its owner are as they were.
    expect(fs.existsSync(theirs.path)).toBe(true);
    expect(lockOn(dir, theirs.path)).toBe(`agentbox pid=${process.pid}`);
  });

  // THE CASE THAT MUST NOT MATCH. A lock a person put on by hand carries no pid
  // of ours, so there is no owner to find dead and it is not ours to take.
  it('leaves a lock somebody put on by hand exactly where it is', () => {
    const made = ensureTaskFolder(dir, 'w-by-hand');
    git(dir, 'worktree', 'unlock', made.path);
    git(dir, 'worktree', 'lock', '--reason', 'leave this alone, I am bisecting', made.path);

    const asked = ensureTaskFolder(dir, 'w-by-hand');
    expect(asked.taken).toBe(false);
    expect(asked.heldBy).toBe(null);
    expect(asked.reason).toBe('locked');
    expect(asked.path).toBe(null);
    expect(lockOn(dir, made.path)).toBe('leave this alone, I am bisecting');
  });

  // SOMETHING THAT IS NOT A TASK FOLDER, SITTING WHERE ONE GOES. The move at
  // the end of the build cannot be trusted to refuse it: measured 2026-10-07 on
  // git 2.39.5, `git worktree move` onto an existing directory behaves like
  // `mv` and moves INTO it, so the finished copy landed at
  // `<folder>/.building-<id>` and the session would have run in a directory
  // holding almost none of the code.
  it('refuses to build over a directory git knows nothing about', () => {
    const folder = taskFolderPath(dir, 'w-squatted');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'somebody-elses.txt'), 'not a task folder\n');

    const asked = ensureTaskFolder(dir, 'w-squatted');
    expect(asked.taken).toBe(false);
    expect(asked.reason).toBe('in-the-way');
    expect(asked.path).toBe(null);
    // Untouched, and nothing nested inside it.
    expect(fs.readdirSync(folder)).toEqual(['somebody-elses.txt']);
  });

  // The boundary beside it: an EMPTY leftover directory holds nothing to lose,
  // and refusing one would wedge the row for good.
  it('builds straight over an empty leftover directory', () => {
    const folder = taskFolderPath(dir, 'w-empty-leftover');
    fs.mkdirSync(folder, { recursive: true });

    const made = ensureTaskFolder(dir, 'w-empty-leftover');
    expect(made.taken).toBe(true);
    expect(made.path).toBe(folder);
    expect(fs.existsSync(path.join(made.path, 'app.txt'))).toBe(true);
  });

  it('is the owner a folder reports to the list of folders in the app', () => {
    const gone = aPidThatHasExited();
    ensureTaskFolder(dir, 'w-listed', { pid: gone });
    ensureTaskFolder(dir, 'w-listed');

    const listed = listTaskFolders(dir).find((f) => f.id === 'w-listed');
    expect(listed.heldBy).toBe(process.pid);
  });
});

/* ========== and the half-built copy, which had no owner at all =========== */

describe('a folder being built belongs to whoever is building it', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('says who is building it while the build is running', () => {
    // The only moment staging exists is mid-build, so this reads it from the
    // repository's own post-checkout hook, which git runs in the new worktree
    // before `worktree add` returns.
    fs.writeFileSync(path.join(dir, 'app.txt'), 'somebody is mid-edit\n');
    const out = path.join(dir, 'probe.txt');
    const hooks = path.join(git(dir, 'rev-parse', '--absolute-git-dir'), 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, 'post-checkout'), [
      '#!/bin/sh',
      `git -C ${JSON.stringify(dir)} worktree list --porcelain > ${JSON.stringify(out)}`,
      '',
    ].join('\n'));
    fs.chmodSync(path.join(hooks, 'post-checkout'), 0o755);

    ensureTaskFolder(dir, 'w-mid-build');

    const duringTheBuild = fs.readFileSync(out, 'utf8');
    expect(duringTheBuild).toContain(`worktree ${buildingFolderPath(dir, 'w-mid-build')}`);
    expect(duringTheBuild).toContain(`locked agentbox pid=${process.pid}`);
  });

  // THE ONE TWO APP PROCESSES HIT. One is mid-build; the other must not sweep
  // the half-built copy out from under it.
  it('leaves a half-built copy another live process is working on', () => {
    const staging = buildingFolderPath(dir, 'w-being-built');
    fs.mkdirSync(path.dirname(staging), { recursive: true });
    git(dir, 'worktree', 'add', '--no-checkout', '-q', staging, '-b', 'agentbox/w-being-built', 'refs/heads/main');
    git(dir, 'worktree', 'lock', '--reason', `agentbox pid=${process.pid}`, staging);

    const asked = ensureTaskFolder(dir, 'w-being-built', { pid: process.pid + 1 });
    expect(asked.taken).toBe(false);
    expect(asked.heldBy).toBe(process.pid);
    expect(asked.reason).toBe('building');
    expect(asked.path).toBe(null);
    // Still there, still theirs, and no folder was made at the real path.
    expect(fs.existsSync(staging)).toBe(true);
    expect(lockOn(dir, staging)).toBe(`agentbox pid=${process.pid}`);
    expect(fs.existsSync(taskFolderPath(dir, 'w-being-built'))).toBe(false);
  });

  // THE BOUNDARY THE OTHER SIDE OF IT: the app died mid-build, so the copy is
  // locked by a pid that is gone. It holds nothing anybody wants.
  it('clears a half-built copy whose builder has exited and makes the folder anyway', () => {
    const gone = aPidThatHasExited();
    const staging = buildingFolderPath(dir, 'w-build-died');
    fs.mkdirSync(path.dirname(staging), { recursive: true });
    git(dir, 'worktree', 'add', '--no-checkout', '-q', staging, '-b', 'agentbox/w-build-died', 'refs/heads/main');
    git(dir, 'worktree', 'lock', '--reason', `agentbox pid=${gone}`, staging);
    fs.writeFileSync(path.join(staging, 'half-written.txt'), 'nobody wants this\n');

    const made = ensureTaskFolder(dir, 'w-build-died');
    expect(made.taken).toBe(true);
    expect(made.path).toBe(taskFolderPath(dir, 'w-build-died'));
    expect(git(made.path, 'status', '--porcelain')).toBe('');
    expect(fs.existsSync(staging)).toBe(false);
    expect(fs.existsSync(path.join(made.path, 'half-written.txt'))).toBe(false);
  });
});
