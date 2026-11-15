// A NEW THREAD GETS ITS FOLDER BEFORE THE TIDYING UP.
//
// What broke (2026-11-15): thread after thread sat on "Making this thread's own
// copy of the project is taking much longer than it should, so the agent has
// not started", several at once, for many minutes. Her folders were already on
// disk; getting one ready is a few git calls, 0.1 s when timed by hand.
//
// Measured on her Mac with 18 agents running and 50 task folders: every folder
// job runs on ONE thread, one at a time, in the order it was posted
// (main/task-folders-offthread.mts). Every agent that finished queued a full
// tidy-up behind it: `listTaskFolders` alone took 32 s (a `git status` in each
// of 50 folders), then a park or a release for each finished one, seconds
// apiece. A sample of the app showed that thread spawning git 100% of the time.
// A new thread's `restoreTaskFolder` waited behind every one of those jobs.
//
// Making a thread's folder now has a lane of its own (cc27442ff), and this pins
// that it is never queued behind the tidying up. What must NOT
// change: the tidying up still all happens, in its own order, and two waiting
// jobs keep their order between themselves.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { folderJob } from '../main/task-folders-offthread.mts';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

function aRepo() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'folder-first-')));
  dirs.push(repo);
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first');
  return repo;
}

describe('the task folder queue', () => {
  it('gets a waiting thread its folder ahead of tidying up that was asked for first', async () => {
    const repo = aRepo();
    const done: string[] = [];
    const tidy = Array.from({ length: 6 }, (_, i) =>
      folderJob('listTaskFolders', repo).then(() => { done.push(`tidy-${i}`); }));
    const ready = folderJob('restoreTaskFolder', repo, 'w-waiting').then((made) => { done.push('ready'); return made; });
    await Promise.all([...tidy, ready]);
    // At most the one job already running finishes first.
    expect(done.indexOf('ready')).toBeLessThanOrEqual(1);
    expect((await ready)?.path).toBeTruthy();
  });

  it('still runs every bit of the tidying up, in the order it was asked for', async () => {
    const repo = aRepo();
    const done: string[] = [];
    const tidy = Array.from({ length: 5 }, (_, i) =>
      folderJob('listTaskFolders', repo).then(() => { done.push(`tidy-${i}`); }));
    const ready = folderJob('restoreTaskFolder', repo, 'w-also-waiting').then(() => { done.push('ready'); });
    await Promise.all([...tidy, ready]);
    expect(done.filter((d) => d.startsWith('tidy'))).toEqual(['tidy-0', 'tidy-1', 'tidy-2', 'tidy-3', 'tidy-4']);
  });

  it('keeps two waiting threads in the order they asked', async () => {
    const repo = aRepo();
    const done: string[] = [];
    const tidy = Array.from({ length: 4 }, () => folderJob('listTaskFolders', repo));
    const first = folderJob('restoreTaskFolder', repo, 'w-first').then(() => { done.push('first'); });
    const second = folderJob('restoreTaskFolder', repo, 'w-second').then(() => { done.push('second'); });
    await Promise.all([...tidy, first, second]);
    expect(done).toEqual(['first', 'second']);
  });

  it('does not let a tidy-up asked for later jump ahead of one asked for earlier', async () => {
    const repo = aRepo();
    const done: string[] = [];
    const a = folderJob('listTaskFolders', repo).then(() => { done.push('list'); });
    const b = folderJob('pruneMissingWorktrees', repo).then(() => { done.push('prune'); });
    const c = folderJob('listTaskFolders', repo).then(() => { done.push('list-again'); });
    await Promise.all([a, b, c]);
    expect(done).toEqual(['list', 'prune', 'list-again']);
  });
});
