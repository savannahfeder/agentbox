// A walk for a file nobody can find keeps a small index, and lets it go.
//
// The freeze log for 2026-11-14 put the walk in main/artifact-path.mts first:
// 20 holds, 5,888 s, on a Mac swapping at up to 88 MB/s with the app at 3.5 GB.
// The walk kept every file it saw as a full joined path, and kept each tree's
// index until 32 others had pushed it out, long after its few seconds of use.
// scripts/scratch/time-walk-heap.mjs, 280,000 files: 135 MB of heap kept, 222 ms
// of garbage collection and 283 ms of main-thread work for one walk. After:
// 12 MB, 35 ms and 42 ms, and the index is gone once its window passes.
import { it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { resolveArtifact, HUNT_FRESH_MS, HUNT_KEPT_AT_MOST_MS } from '../main/artifact-path.mts';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

const FILES = 30_000;
let root: string;
let docs: string;
let reads: string[] = [];
const counted = {
  ...fs,
  promises: {
    ...fs.promises,
    readdir: ((dir: string, opts: object) => { reads.push(String(dir)); return fs.promises.readdir(dir, opts); }) as typeof fs.promises.readdir,
  },
};
const find = (src: string, now: number, tree = docs) => resolveArtifact({
  src, product: 'ours', products: [{ slug: 'ours', dir: tree, repoPath: null }], fs: counted, now,
});

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'small-index-'));
  docs = path.join(root, 'ours');
  for (let n = 0; n < FILES; n++) {
    const dir = path.join(docs, 'designs', `w-${String(Math.floor(n / 50)).padStart(10, '0')}`, 'shots');
    if (n % 50 === 0) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `shot-${n}-of-the-run.png`), '');
  }
  fs.writeFileSync(path.join(docs, 'designs', 'w-0000000003', 'shots', 'twice.png'), 'a');
  fs.writeFileSync(path.join(docs, 'designs', 'w-0000000007', 'shots', 'twice.png'), 'b');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => { vi.useRealTimers(); reads = []; });

it('keeps well under the bytes of one joined path per file', async () => {
  gc();
  const before = process.memoryUsage().heapUsed;
  const found = await find('not-anywhere.png', 1_000_000);
  gc();
  const kept = process.memoryUsage().heapUsed - before;
  expect(found.ok).toBe(false);
  // A joined path alone is over 100 bytes here; the old index kept about 480 a file.
  expect(kept / FILES).toBeLessThan(150);
});

it('still finds every file of a name, by its full path', async () => {
  const found = await find('twice.png', 2_000_000);
  expect(found.ok).toBe(true);
  expect(['w-0000000003', 'w-0000000007'].map((w) => path.join(docs, 'designs', w, 'shots', 'twice.png'))).toContain(found.ok && found.path);
  const one = await find('shot-12345-of-the-run.png', 2_000_000);
  expect(one.ok && one.path).toBe(path.join(docs, 'designs', 'w-0000000246', 'shots', 'shot-12345-of-the-run.png'));
});

it('drops a tree\'s index once its window has passed, and not before', async () => {
  const small = path.join(root, 'small');
  fs.mkdirSync(path.join(small, 'designs'), { recursive: true });
  fs.writeFileSync(path.join(small, 'designs', 'a.png'), 'x');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const now = 3_000_000;
  await find('missing.png', now, small);
  const walked = reads.filter((d) => d === small).length;
  expect(walked).toBe(1);
  // Within the window the same clock gets the same walk.
  vi.advanceTimersByTime(HUNT_FRESH_MS - 100);
  await find('missing.png', now, small);
  expect(reads.filter((d) => d === small).length).toBe(1);
  // Past the longest window, nothing of it is left to hand back.
  vi.advanceTimersByTime(HUNT_KEPT_AT_MOST_MS);
  await find('missing.png', now, small);
  expect(reads.filter((d) => d === small).length).toBe(2);
});
