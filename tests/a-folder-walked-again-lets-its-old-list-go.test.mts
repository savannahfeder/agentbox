// A folder walked again lets its old list go, and twelve projects fit at once.
//
// 2026-11-22: the app's main process was at 2.1 GB. A heap snapshot of it 12
// minutes after launch held 391 MB, and 176 MB of that hung off 3,325 pending
// timers set in main/artifact-path.mts (scripts/scratch/heap-timers.py). Each
// walk of a tree set a timer to drop its list after its window, up to 10
// minutes on a Mac, and the timer kept the list. A list replaced by a newer
// walk, or pushed out because 32 others were kept, was never let go early.
// That Mac had 12 projects, up to 56 trees, so a pass over every project pushed
// each list out before it was asked for again: about five walks a second, each
// leaving its list behind for ten minutes.
import { it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { resolveArtifact, HUNT_FRESH_MS, HUNT_KEPT_AT_MOST_MS, stopWatchingFolders } from '../main/artifact-path.mts';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

const FILES = 6_000;
const PROJECTS = 12;
let root: string;
let big: string;
let reads: string[] = [];
const counted = {
  ...fs,
  promises: {
    ...fs.promises,
    readdir: ((dir: string, opts: object) => { reads.push(String(dir)); return fs.promises.readdir(dir, opts); }) as typeof fs.promises.readdir,
  },
};
const project = (n: number) => path.join(root, `project-${n}`);
const find = (src: string, now: number, dir: string) => resolveArtifact({
  src, product: 'ours', products: [{ slug: 'ours', dir, repoPath: null }], fs: counted, now,
});
const walksOf = (dir: string) => reads.filter((d) => d === dir).length;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'old-list-'));
  big = path.join(root, 'big');
  for (let n = 0; n < FILES; n++) {
    const dir = path.join(big, 'designs', `w-${String(Math.floor(n / 50)).padStart(10, '0')}`, 'shots');
    if (n % 50 === 0) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `shot-${n}-of-the-run.png`), '');
  }
  for (let n = 0; n < PROJECTS + 1; n++) {
    fs.mkdirSync(path.join(project(n), 'designs'), { recursive: true });
    fs.mkdirSync(path.join(project(n), 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(project(n), 'designs', 'a.png'), 'x');
  }
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => { vi.useRealTimers(); stopWatchingFolders(); reads = []; });

it('keeps one list of a tree however many times it is walked again', async () => {
  await find('not-anywhere.png', 1_000_000, big);
  gc();
  const one = process.memoryUsage().heapUsed;
  // Each look is past the last walk's window, so each walks again.
  for (let n = 1; n <= 15; n++) await find('not-anywhere.png', 1_000_000 + n * (HUNT_KEPT_AT_MOST_MS + 1), big);
  expect(walksOf(big)).toBe(16);
  gc();
  const kept = process.memoryUsage().heapUsed - one;
  // One list of these 6,000 files is about 0.6 MB; fifteen old ones were 9 MB.
  expect(kept).toBeLessThan(3 * 1024 * 1024);
});

it('leaves one timer for a tree, not one for every walk of it', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await find('missing.png', 2_000_000, project(0));
  const first = vi.getTimerCount();
  for (let n = 1; n <= 10; n++) await find('missing.png', 2_000_000 + n * (HUNT_KEPT_AT_MOST_MS + 1), project(0));
  expect(walksOf(project(0))).toBe(11);
  expect(vi.getTimerCount()).toBe(first);
});

// Each thread's own checkout is a tree of its own, there or not, so a pass over
// a project's threads asks about far more trees than it has projects.
it('a pass over every thread of twelve projects walks each project once', async () => {
  const now = 3_000_000;
  const repo = (n: number) => path.join(root, `repo-${n}`);
  for (let n = 0; n < PROJECTS; n++) fs.mkdirSync(path.join(repo(n), 'src'), { recursive: true });
  for (let round = 0; round < 2; round++) {
    for (let t = 0; t < 20; t++) {
      for (let n = 0; n < PROJECTS; n++) {
        await resolveArtifact({
          src: 'missing.png', product: 'ours', products: [{ slug: 'ours', dir: project(n), repoPath: repo(n) }],
          fs: counted, now: now + round, thread: `w-${(0xabc000 + t).toString(16)}`,
        });
      }
    }
  }
  for (let n = 0; n < PROJECTS; n++) {
    expect(walksOf(project(n))).toBe(1);
    expect(walksOf(repo(n))).toBe(1);
  }
});

it('still walks again once the window has passed, and finds the new file', async () => {
  const now = 4_000_000;
  const dir = project(PROJECTS);
  await find('late.png', now, dir);
  // Two folders down, where only the walk finds it.
  fs.mkdirSync(path.join(dir, 'designs', 'w-2', 'shots'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'designs', 'w-2', 'shots', 'late.png'), 'x');
  // Inside the window the kept list answers, so the new file is not seen yet.
  expect((await find('late.png', now + HUNT_FRESH_MS - 1, dir)).ok).toBe(false);
  expect(walksOf(dir)).toBe(1);
  const found = await find('late.png', now + HUNT_KEPT_AT_MOST_MS + 1, dir);
  expect(found.ok && found.path).toBe(path.join(dir, 'designs', 'w-2', 'shots', 'late.png'));
  expect(walksOf(dir)).toBe(2);
});

it('drops the one list it kept when its window passes', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const now = 5_000_000;
  await find('missing.png', now, project(1));
  await find('missing.png', now + HUNT_KEPT_AT_MOST_MS + 1, project(1));
  expect(walksOf(project(1))).toBe(2);
  vi.advanceTimersByTime(HUNT_KEPT_AT_MOST_MS + 1);
  expect(vi.getTimerCount()).toBe(0);
  // Same clock as the second walk: only a dropped list makes this walk again.
  await find('missing.png', now + HUNT_KEPT_AT_MOST_MS + 1, project(1));
  expect(walksOf(project(1))).toBe(3);
});
