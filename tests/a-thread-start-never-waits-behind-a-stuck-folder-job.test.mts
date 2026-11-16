// A THREAD'S START NEVER WAITS BEHIND A STUCK FOLDER JOB.
//
// Every folder job (making a thread's folder, putting a finished one away,
// listing them) ran on one thread, one job at a time, in the order asked. One
// slow or stuck job held every start in every project behind it, each thread
// saying "Making this thread's own copy of the project is taking much longer
// than it should". The app's own count of why a start waited: `slow-folder` 102
// times in the three days to 2026-11-15, the most common reason of all, 27
// threads in one hour that day (w-6f4acda096b7, w-7054e8638d).
//
// Now starts have a lane of their own, and a job that holds its lane past
// STUCK_MS is left on its thread while the jobs behind it go to a fresh one.
// Within a lane jobs still go one at a time, and two jobs for the same thread
// never run at once in any lane. A job still out at its deadline is given up
// on and its thread ended (w-7054e8638d).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { FolderLanes, STUCK_MS, MOST_LEFT_BEHIND, laneOf, jobDeadline } from '../main/task-folders-offthread.mts';

class FakeThread extends EventEmitter {
  posted: { id: number; name: string; args: unknown[] }[] = [];
  terminated = false;
  refs = 0;
  postMessage(m: { id: number; name: string; args: unknown[] }) { this.posted.push(m); }
  ref() { this.refs += 1; }
  unref() { this.refs = 0; }
  terminate() { this.terminated = true; return Promise.resolve(0); }
  answer(id: number, value: unknown = 'ok') { this.emit('message', { id, ok: true, value }); }
}

let threads: FakeThread[];
let ranHere: string[];
let lanes: FolderLanes;

const make = (jobMs = jobDeadline) => new FolderLanes({
  makeThread: () => { const t = new FakeThread(); threads.push(t); return t; },
  runHere: (name: string) => { ranHere.push(name); return 'here'; },
  jobMs,
});
const longDeadline = () => 60 * 60_000;
const posted = () => threads.flatMap((t) => t.posted.map((p) => `${p.name}:${String(p.args[1] ?? '')}`));
const settle = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  threads = [];
  ranHere = [];
  lanes = make();
});
afterEach(() => { vi.useRealTimers(); });

describe('a start has a lane of its own', () => {
  it('only making a folder is a start', () => {
    expect(laneOf('restoreTaskFolder')).toBe('start');
    for (const name of ['parkTaskFolder', 'releaseTaskFolder', 'listTaskFolders', 'pruneMissingWorktrees', 'inventoryWorktrees', 'strayWorktrees'] as const) {
      expect(laneOf(name)).toBe('tidy');
    }
  });

  it('a start asked while a folder is being put away goes at once', () => {
    void lanes.run('parkTaskFolder', ['/repo', 'w-old']);
    void lanes.run('restoreTaskFolder', ['/repo', 'w-new']);
    expect(posted()).toEqual(['parkTaskFolder:w-old', 'restoreTaskFolder:w-new']);
    expect(threads).toHaveLength(2);
  });

  it('but never for the same thread: a start waits for that thread\'s own park to finish', async () => {
    void lanes.run('parkTaskFolder', ['/repo', 'w-same']);
    const start = lanes.run('restoreTaskFolder', ['/repo', 'w-same']);
    expect(posted()).toEqual(['parkTaskFolder:w-same']);
    threads[0].answer(threads[0].posted[0].id, { parked: true });
    await settle();
    expect(posted()).toEqual(['parkTaskFolder:w-same', 'restoreTaskFolder:w-same']);
    const t = threads.find((x) => x.posted.some((p) => p.name === 'restoreTaskFolder'))!;
    t.answer(t.posted.at(-1)!.id, { path: '/f' });
    await expect(start).resolves.toEqual({ path: '/f' });
  });

  it('a prune waits for a start in its project, and a start waits for a prune', async () => {
    void lanes.run('restoreTaskFolder', ['/repo', 'w-new']);
    void lanes.run('pruneMissingWorktrees', ['/repo']);
    void lanes.run('pruneMissingWorktrees', ['/other']);
    expect(posted()).toEqual(['restoreTaskFolder:w-new', 'pruneMissingWorktrees:']);
    expect(threads[1].posted[0].args[0]).toBe('/other');
    threads[0].answer(threads[0].posted[0].id);
    threads[1].answer(threads[1].posted[0].id);
    await settle();
    expect(threads[1].posted.map((p) => p.args[0])).toEqual(['/other', '/repo']);

    void lanes.run('restoreTaskFolder', ['/repo', 'w-later']);
    expect(threads[0].posted).toHaveLength(1);
  });

  it('listing the folders does not hold a start up', () => {
    void lanes.run('listTaskFolders', ['/repo']);
    void lanes.run('restoreTaskFolder', ['/repo', 'w-new']);
    expect(posted()).toEqual(['listTaskFolders:', 'restoreTaskFolder:w-new']);
  });

  it('the same thread id in another project is not the same thread', () => {
    void lanes.run('parkTaskFolder', ['/repo-a', 'w-1']);
    void lanes.run('restoreTaskFolder', ['/repo-b', 'w-1']);
    expect(posted()).toEqual(['parkTaskFolder:w-1', 'restoreTaskFolder:w-1']);
  });
});

describe('within a lane, one job at a time and in order', () => {
  it('the second start is not sent until the first has answered', async () => {
    const a = lanes.run('restoreTaskFolder', ['/repo', 'w-a']);
    const b = lanes.run('restoreTaskFolder', ['/repo', 'w-b']);
    expect(posted()).toEqual(['restoreTaskFolder:w-a']);
    threads[0].answer(threads[0].posted[0].id, 'A');
    await expect(a).resolves.toBe('A');
    expect(posted()).toEqual(['restoreTaskFolder:w-a', 'restoreTaskFolder:w-b']);
    threads[0].answer(threads[0].posted[1].id, 'B');
    await expect(b).resolves.toBe('B');
    expect(threads).toHaveLength(1);
  });

  it('a refusal reaches the one who asked', async () => {
    const a = lanes.run('restoreTaskFolder', ['/repo', 'w-a']);
    threads[0].emit('message', { id: threads[0].posted[0].id, ok: false, error: 'no folder' });
    await expect(a).rejects.toThrow('no folder');
  });
});

describe('a stuck job does not hold the lane', () => {
  it('just short of STUCK_MS the next start still waits its turn', () => {
    void lanes.run('restoreTaskFolder', ['/repo', 'w-stuck']);
    void lanes.run('restoreTaskFolder', ['/repo', 'w-next']);
    vi.advanceTimersByTime(STUCK_MS - 1);
    expect(posted()).toEqual(['restoreTaskFolder:w-stuck']);
    expect(threads).toHaveLength(1);
  });

  it('past it, the starts behind go to a fresh thread, and the stuck one still answers its asker', async () => {
    const stuck = lanes.run('restoreTaskFolder', ['/repo', 'w-stuck']);
    const next = lanes.run('restoreTaskFolder', ['/repo', 'w-next']);
    vi.advanceTimersByTime(STUCK_MS);
    expect(threads).toHaveLength(2);
    expect(threads[1].posted.map((p) => p.args[1])).toEqual(['w-next']);
    threads[1].answer(threads[1].posted[0].id, 'next');
    await expect(next).resolves.toBe('next');

    expect(threads[0].terminated).toBe(false);
    threads[0].answer(threads[0].posted[0].id, 'late');
    await expect(stuck).resolves.toBe('late');
    expect(threads[0].terminated).toBe(true);
  });

  it('a thread left behind never keeps the app open', () => {
    void lanes.run('restoreTaskFolder', ['/repo', 'w-stuck']);
    vi.advanceTimersByTime(STUCK_MS);
    expect(threads[0].refs).toBe(0);
  });

  it('the stuck thread\'s own next start still waits for it, up to its deadline', () => {
    void lanes.run('restoreTaskFolder', ['/repo', 'w-stuck']);
    void lanes.run('parkTaskFolder', ['/repo', 'w-stuck']);
    vi.advanceTimersByTime(jobDeadline() - 1);
    expect(posted()).toEqual(['restoreTaskFolder:w-stuck']);
  });

  it(`at most ${MOST_LEFT_BEHIND} threads are left behind, then the lane waits`, () => {
    lanes = make(longDeadline);
    for (let i = 0; i < MOST_LEFT_BEHIND + 2; i += 1) void lanes.run('restoreTaskFolder', ['/repo', `w-${i}`]);
    for (let i = 0; i < MOST_LEFT_BEHIND + 2; i += 1) vi.advanceTimersByTime(STUCK_MS);
    expect(threads).toHaveLength(MOST_LEFT_BEHIND + 1);
    expect(posted()).toEqual(Array.from({ length: MOST_LEFT_BEHIND + 1 }, (_, i) => `restoreTaskFolder:w-${i}`));
  });

  it('and moves on again once a thread left behind answers', () => {
    lanes = make(longDeadline);
    for (let i = 0; i < MOST_LEFT_BEHIND + 2; i += 1) void lanes.run('restoreTaskFolder', ['/repo', `w-${i}`]);
    for (let i = 0; i < MOST_LEFT_BEHIND + 1; i += 1) vi.advanceTimersByTime(STUCK_MS);
    threads[0].answer(threads[0].posted[0].id);
    vi.advanceTimersByTime(STUCK_MS);
    expect(posted()).toContain(`restoreTaskFolder:w-${MOST_LEFT_BEHIND + 1}`);
  });
});

describe('a job still out at its deadline', () => {
  it('is refused as timed out, its thread is ended, and that thread\'s next job goes', async () => {
    const stuck = lanes.run('restoreTaskFolder', ['/repo', 'w-stuck']).then(() => null, (e: Error) => e);
    void lanes.run('parkTaskFolder', ['/repo', 'w-stuck']);
    vi.advanceTimersByTime(jobDeadline());
    expect(await stuck).toMatchObject({ timedOut: true });
    expect(threads[0].terminated).toBe(true);
    expect(posted()).toContain('parkTaskFolder:w-stuck');
  });

  it('counts from when it was sent, not while it waited in line', async () => {
    const a = lanes.run('restoreTaskFolder', ['/repo', 'w-a']);
    const b = lanes.run('restoreTaskFolder', ['/repo', 'w-b']).then((v) => v, (e: Error) => e);
    vi.advanceTimersByTime(STUCK_MS - 1);
    threads[0].answer(threads[0].posted[0].id, 'A');
    await expect(a).resolves.toBe('A');
    vi.advanceTimersByTime(jobDeadline() - STUCK_MS);
    threads[0].answer(threads[0].posted[1].id, 'B');
    expect(await b).toBe('B');
  });

  it('a late answer from an ended thread is not taken', async () => {
    const stuck = lanes.run('restoreTaskFolder', ['/repo', 'w-stuck']).then(() => 'answered', () => 'timed out');
    const id = threads[0].posted[0].id;
    vi.advanceTimersByTime(jobDeadline());
    threads[0].answer(id, 'late');
    expect(await stuck).toBe('timed out');
  });

  it('a stuck tidy job is ended too, and a start never waited on it', async () => {
    const park = lanes.run('parkTaskFolder', ['/repo', 'w-old']).then(() => null, (e: Error) => e);
    void lanes.run('restoreTaskFolder', ['/repo', 'w-new']);
    expect(posted()).toEqual(['parkTaskFolder:w-old', 'restoreTaskFolder:w-new']);
    threads[1].answer(threads[1].posted[0].id);
    vi.advanceTimersByTime(jobDeadline());
    expect(await park).toMatchObject({ timedOut: true });
    expect(threads[0].terminated).toBe(true);
    expect(threads[1].terminated).toBe(false);
  });
});

describe('when no thread can be had, the job runs here, as before', () => {
  it('a thread that cannot start', async () => {
    const l = new FolderLanes({ makeThread: () => { throw Error('no threads in this build'); }, runHere: (name: string) => { ranHere.push(name); return 'here'; } });
    await expect(l.run('restoreTaskFolder', ['/repo', 'w-a'])).resolves.toBe('here');
    expect(ranHere).toEqual(['restoreTaskFolder']);
  });

  it('a thread that dies takes its job and the lane\'s queue here', async () => {
    const a = lanes.run('restoreTaskFolder', ['/repo', 'w-a']);
    const b = lanes.run('restoreTaskFolder', ['/repo', 'w-b']);
    threads[0].emit('error', Error('thread died'));
    await expect(a).resolves.toBe('here');
    await expect(b).resolves.toBe('here');
  });
});
