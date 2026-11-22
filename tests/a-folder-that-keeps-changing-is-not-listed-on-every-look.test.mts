// The freeze log for 2026-11-15 put the folder walk first: 356 holds, 3,902 s.
// That day the walk began keeping a Mac folder's list until FSEvents said it
// changed, and a changed folder's list was kept for 0 ms. A folder something
// keeps writing into (a film render's frames, an agent's designs) changed all
// the time, so every name a thread or the search index asked about listed the
// whole project again: about 34,000 files a look. Measured with
// scripts/scratch/walk-under-writes.mjs (34,000 files, a write every 200 ms,
// a look every 50 ms, 10 s): 49 walks, main thread 14% busy and 198 MB of heap
// before; 2 walks, 2% and 58 MB after.
//
// A changed folder now waits out the same window an unwatched one does.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS, WATCHED_WALK_KEPT_MS, stopWatchingFolders } from '../main/artifact-path.mts';

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
let root: string; let docs: string; let reads: string[];
const put = (file: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x'); return file; };
const look = (src: string, now: number) => resolveArtifact({ src, product: 'ours', products: [{ slug: 'ours', dir: docs, repoPath: null }], now });
const walksOf = () => reads.filter((d) => d === docs).length;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  // The watch is only taken on a Mac; Node's recursive watch works here too.
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'keeps-changing-')));
  docs = path.join(root, 'docs');
  put(path.join(docs, 'designs', 'w-1', 'a.png'));
  reads = [];
  const real = fs.promises.readdir.bind(fs.promises);
  vi.spyOn(fs.promises, 'readdir').mockImplementation(((dir: fs.PathLike, opts: unknown) => { reads.push(String(dir)); return real(dir, opts as never); }) as typeof fs.promises.readdir);
});
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  vi.restoreAllMocks();
  stopWatchingFolders();
  fs.rmSync(root, { recursive: true, force: true });
});

it('is not listed again on every look while something writes into it', async () => {
  const t = Date.now();
  await look('missing.png', t);
  for (let n = 0; n < 5; n++) {
    put(path.join(docs, 'designs', 'w-2', `frame-${n}.png`));
    await pause(150);
    await look('missing.png', t + 100 + n * 100);
  }
  expect(walksOf()).toBe(1);
});

it('is listed again once the window has passed, and finds the new file', async () => {
  const t = Date.now();
  await look('missing.png', t);
  put(path.join(docs, 'designs', 'w-2', 'late.png'));
  await pause(300);
  const found = await look('late.png', t + HUNT_FRESH_MS + 1);
  expect(found.ok && found.path).toBe(path.join(docs, 'designs', 'w-2', 'late.png'));
  expect(walksOf()).toBe(2);
});

it('still keeps an unchanged folder for the long window', async () => {
  const t = Date.now();
  await look('missing.png', t);
  // A notice for the setup's own files can land just after the watch starts.
  await pause(1000);
  await look('missing.png', t + HUNT_FRESH_MS + 1);
  reads.length = 0;
  await look('missing.png', t + 5 * 60_000);
  expect(walksOf()).toBe(0);
  await look('missing.png', t + HUNT_FRESH_MS + 1 + WATCHED_WALK_KEPT_MS + 1);
  expect(walksOf()).toBe(1);
});

it('a look that must be current lists a changed folder at once', async () => {
  const t = Date.now();
  await look('missing.png', t);
  put(path.join(docs, 'designs', 'w-2', 'now.png'));
  await pause(300);
  const found = await resolveArtifact({ src: 'now.png', product: 'ours', products: [{ slug: 'ours', dir: docs, repoPath: null }], now: t + 100, fresh: true });
  expect(found.ok).toBe(true);
});
