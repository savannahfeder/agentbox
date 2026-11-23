// The git thread gives its memory back when it has nothing to do.
//
// 2026-11-22: the app's git thread read a 185 MB transcript at 21:14 and its
// heap went to 416 MB. Ten minutes later, with no job since, the main
// process's JavaScript was still 1.1 GB against 0.5 GB before the job. A
// thread with nothing to run never collects what its last job left, so one
// big job was kept until the next. The thread is now ended after a minute
// with nothing to do, which frees all of it, and the next job starts another.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitJob, __gitJobsIdle, __gitThread } from '../main/git-change-offthread.mts';
import { threadHeaps } from '../main/thread-heaps.mts';

const wait = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });
const gitThreads = async () => Object.keys(await threadHeaps()).filter((name) => name.startsWith('git'));
let dir: string;

afterEach(() => {
  __gitThread.idleMs(60_000);
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the git thread', () => {
  it('ends once it has had nothing to do for its idle time, and the next job gets a new one', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-idle-'));
    __gitThread.idleMs(300);
    const before = __gitThread.started();
    expect(await gitJob('snapshotRepo', dir)).toBeNull();
    expect(__gitThread.started()).toBe(before + 1);
    expect(await gitThreads()).toHaveLength(1);
    await wait(900);
    expect(await gitThreads()).toEqual([]);
    // Nothing is lost by it: the next job is answered, by a thread of its own.
    expect(await gitJob('whereTheWorkStands', dir)).toMatchObject({ committed: null });
    expect(__gitThread.started()).toBe(before + 2);
    await __gitJobsIdle();
  }, 20_000);

  it('is kept while jobs keep coming, however long that is', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-busy-'));
    __gitThread.idleMs(300);
    await gitJob('snapshotRepo', dir);
    const started = __gitThread.started();
    // A second of jobs 100 ms apart: never idle for the 300 ms.
    for (let n = 0; n < 10; n++) {
      await wait(100);
      expect(await gitJob('snapshotRepo', dir)).toBeNull();
    }
    expect(__gitThread.started()).toBe(started);
    await __gitJobsIdle();
  }, 20_000);

  it('answers a job sent at the moment the thread is ending', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-edge-'));
    __gitThread.idleMs(150);
    for (let n = 0; n < 6; n++) {
      await gitJob('snapshotRepo', dir);
      // Straddles the idle time, so some of these land as the thread ends.
      await wait(140 + n * 5);
    }
    expect(await gitJob('whereTheWorkStands', dir)).toMatchObject({ committed: null });
    await __gitJobsIdle();
  }, 20_000);
});
