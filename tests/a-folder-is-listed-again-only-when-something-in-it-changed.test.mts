// A sampling heap profile of the running app on 2026-11-15 put 351 MB of every
// two minutes' garbage in main on one function: the walk that lists a
// project's folders so a file a thread names can be found by name (about
// 34,000 files: the docs folder and the repo). A walk answered for 5 to 30
// seconds, so the search index, which looks up every file every thread names,
// listed the same unchanged folders again and again.
//
// On a Mac a folder's list is now kept until macOS says something in it
// changed (one FSEvents watch per folder), and listed again at the latest
// after ten minutes. Elsewhere, and with a stand-in disk, the old rule holds.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS, HUNT_KEPT_AT_MOST_MS, WATCHED_WALK_KEPT_MS, stopWatchingFolders } from '../main/artifact-path.mts';

const onMac = process.platform === 'darwin';
let root: string; let docs: string; let reads: string[];
const put = (file: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x'); return file; };
const look = (src: string, now: number) => resolveArtifact({ src, product: 'ours', products: [{ slug: 'ours', dir: docs, repoPath: null }], now });
const until = async (fn: () => Promise<boolean>, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return fn(); };
const walksOf = (dir: string) => reads.filter((d) => d === dir).length;
// macOS can deliver a notice for a file written just before the watch began (the
// setup's own files), which costs one more listing once the timed window is up.
// Let that pass, then count from the time of the last listing.
const settled = async (t: number) => {
  await look('b.md', t);
  await new Promise((r) => setTimeout(r, 1000));
  const later = t + HUNT_KEPT_AT_MOST_MS + 1;
  await look('b.md', later);
  const at = walksOf(docs) > 1 ? later : t;
  reads.length = 0;
  return at;
};

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'listed-once-')));
  docs = path.join(root, 'docs');
  put(path.join(docs, 'designs', 'w-1', 'a.png'));
  put(path.join(docs, 'notes', 'deep', 'b.md'));
  reads = [];
  const real = fs.promises.readdir.bind(fs.promises);
  vi.spyOn(fs.promises, 'readdir').mockImplementation(((dir: fs.PathLike, opts: unknown) => { reads.push(String(dir)); return real(dir, opts as never); }) as typeof fs.promises.readdir);
});
afterEach(() => { vi.restoreAllMocks(); stopWatchingFolders(); fs.rmSync(root, { recursive: true, force: true }); });

describe.runIf(onMac)('on a Mac', () => {
  it('lists a folder the first time it is asked about', async () => {
    expect((await look('b.md', Date.now())).ok).toBe(true);
    expect(walksOf(docs)).toBe(1);
  });

  it('does not list an unchanged folder again a minute later', async () => {
    const t = await settled(Date.now());
    expect((await look('missing.png', t + 60_000)).ok).toBe(false);
    expect((await look('a.png', t + 5 * 60_000)).ok).toBe(true);
    expect(walksOf(docs)).toBe(0);
  });

  it('finds a file that arrived after the folder was listed', async () => {
    const t = Date.now();
    expect((await look('late.png', t)).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 300));
    put(path.join(docs, 'designs', 'w-2', 'late.png'));
    expect(await until(async () => (await look('late.png', Date.now())).ok, HUNT_FRESH_MS + 3000)).toBe(true);
  }, HUNT_FRESH_MS + 8000);

  it('is not listed again for changes inside folders the walk skips', async () => {
    const t = await settled(Date.now());
    put(path.join(docs, 'node_modules', 'x', 'index.js'));
    put(path.join(docs, '.git', 'objects', 'ab'));
    await new Promise((r) => setTimeout(r, 1500));
    await look('missing.png', t + 60_000);
    expect(walksOf(docs)).toBe(0);
  });

  it('is listed again after ten minutes even with nothing said', async () => {
    const t = await settled(Date.now());
    await look('missing.png', t + WATCHED_WALK_KEPT_MS + 1);
    expect(walksOf(docs)).toBe(1);
  });
});

describe.runIf(!onMac)('elsewhere', () => {
  it('keeps the old rule: a quick walk is done again once its 5 s are up', async () => {
    const t = Date.now();
    await look('b.md', t);
    await look('missing.png', t + 60_000);
    expect(walksOf(docs)).toBe(2);
  });
});
