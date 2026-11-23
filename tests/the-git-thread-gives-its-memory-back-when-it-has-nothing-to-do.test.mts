// The git thread gives its memory back when it has nothing to do.
//
// 2026-11-22: the app's git thread read a 185 MB transcript at 21:14 and its
// heap went to 416 MB. Ten minutes later, with no job since, the main
// process's JavaScript was still 1.1 GB against 0.5 GB before the job. A
// thread with nothing to run never collects what its last job left, so one
// big job was kept until the next. The thread is now ended after a minute
// with nothing to do, which frees all of it, and the next job starts another.
//
// The idle clock is the test's own: on a loaded Mac a real 300 ms ran out
// before the test could look, and the first ship of this bounced on it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitJob, __gitThread } from '../main/git-change-offthread.mts';
import { threadHeaps } from '../main/thread-heaps.mts';

const IDLE = 60_000;
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-idle-'));
  // Only the idle timer is the test's; the thread itself runs in real time.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  __gitThread.idleMs(IDLE);
});
afterEach(() => {
  // Whatever thread a test left is ended, so the next starts from none.
  if (vi.isFakeTimers()) vi.advanceTimersByTime(IDLE);
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the git thread', () => {
  it('ends once it has had nothing to do for its idle time, and not a moment before', async () => {
    const before = __gitThread.started();
    expect(await gitJob('snapshotRepo', dir)).toBeNull();
    expect(__gitThread.started()).toBe(before + 1);
    vi.advanceTimersByTime(IDLE - 1);
    expect(__gitThread.inUse()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(__gitThread.inUse()).toBe(false);
  });

  it('is gone from the threads the memory log measures once it has ended', async () => {
    await gitJob('snapshotRepo', dir);
    vi.advanceTimersByTime(IDLE);
    vi.useRealTimers();
    // Ending a thread takes it a moment; nothing here says how long.
    await expect.poll(async () => Object.keys(await threadHeaps()).filter((name) => name.startsWith('git')), { timeout: 15_000, interval: 50 }).toEqual([]);
  }, 20_000);

  it('gives the next job a thread of its own, and loses nothing', async () => {
    await gitJob('snapshotRepo', dir);
    const started = __gitThread.started();
    vi.advanceTimersByTime(IDLE);
    // Sent the moment the last thread was let go.
    expect(await gitJob('whereTheWorkStands', dir)).toMatchObject({ committed: null });
    expect(__gitThread.started()).toBe(started + 1);
    expect(__gitThread.inUse()).toBe(true);
  });

  it('is kept while jobs keep coming, however long that is', async () => {
    await gitJob('snapshotRepo', dir);
    const started = __gitThread.started();
    // Ten idle times of jobs, each sent just before the thread would rest.
    for (let n = 0; n < 10; n++) {
      vi.advanceTimersByTime(IDLE - 1);
      expect(await gitJob('snapshotRepo', dir)).toBeNull();
    }
    expect(__gitThread.started()).toBe(started);
    expect(__gitThread.inUse()).toBe(true);
  });

  it('does not rest while a job is still running', async () => {
    await gitJob('snapshotRepo', dir);
    const started = __gitThread.started();
    const job = gitJob('snapshotRepo', dir);
    // The job is out and unanswered: the idle time passing changes nothing.
    vi.advanceTimersByTime(IDLE * 3);
    expect(__gitThread.inUse()).toBe(true);
    expect(await job).toBeNull();
    expect(__gitThread.started()).toBe(started);
  });
});
