// A slow walk of a project's folders is never started again while it runs.
//
// The freeze log for 2026-11-07 put walk (main/artifact-path.mjs) first: 415
// holds, 3,234 s in all. A walk of a tree answered for 5 s counted from when it
// STARTED, so on a busy disk, where one walk took longer than that, every name
// asked after 5 s began another whole walk beside the first, and each walk read
// every folder at once. scripts/scratch/time-walk.mjs (3,442 folders, a four-thread
// disk pool at 8 ms a read, ten names a second for 30 s): 6,041 folder reads
// queued at once, and an unrelated read elsewhere in the app waited 3.9 s at the
// median and 12.4 s at worst.
//
// Now one walk per tree runs at a time and everyone waits on it, it reads two
// folders at a time, and a walk that took long answers for ten times as long.
//
// A review then found three ways that went wrong, each pinned below: a slow
// walk's answer kept for minutes, a look that must be current handed a walk
// begun before its file was written, and one folder read that never returns
// holding every lookup on the tree for good.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS, HUNT_KEPT_AT_MOST_MS, WALK_GIVES_UP_MS } from '../main/artifact-path.mts';

let root;
let docs;
let reads;
let open;
let peak;
let held;
let release;

const gated = {
  ...fs,
  promises: {
    ...fs.promises,
    readdir: async (dir, opts) => {
      reads.push(String(dir));
      open += 1;
      peak = Math.max(peak, open);
      // Read first, then held: what a slow disk does to a folder already read.
      try {
        const out = await fs.promises.readdir(dir, opts);
        if (held) await held;
        if (String(dir) === hangOn) await hanging;
        return out;
      } finally { open -= 1; }
    },
  },
};
// One folder whose read does not come back until unhang().
let hangOn = null;
let unhang = () => {};
const hanging = new Promise((r) => { unhang = () => { hangOn = null; r(); }; });
const hold = () => { held = new Promise((r) => { release = () => { held = null; r(); }; }); };
const find = (src, { now = 1_000_000, fresh = false } = {}) => resolveArtifact({
  src, product: 'ours', products: [{ slug: 'ours', dir: docs, repoPath: null }], fs: gated, now, fresh,
});
const readsOf = (dir) => reads.filter((d) => d === dir).length;
const tick = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'slow-walk-'));
  docs = path.join(root, 'ours');
  for (let t = 0; t < 40; t++) {
    fs.mkdirSync(path.join(docs, 'designs', `w-${t}`), { recursive: true });
    fs.writeFileSync(path.join(docs, 'designs', `w-${t}`, 'shot.png'), 'x');
  }
  reads = [];
  open = 0;
  peak = 0;
  held = null;
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a walk still running', () => {
  it('is waited on, not started again, by a name asked after its 5 s are up', async () => {
    hold();
    const first = find('a.png', { now: 1_000_000 });
    await tick();
    const later = find('b.png', { now: 1_000_000 + HUNT_FRESH_MS + 1 });
    await tick();
    release();
    await Promise.all([first, later]);
    expect(readsOf(docs)).toBe(1);
  });

  it('is waited on by a look that must be current, which then walks the tree again', async () => {
    hold();
    const first = find('a.png');
    await tick();
    fs.writeFileSync(path.join(docs, 'designs', 'w-7', 'new.png'), 'x');
    const current = find('new.png', { fresh: true });
    const alsoCurrent = find('new.png', { fresh: true });
    await tick();
    release();
    const [, found, alsoFound] = await Promise.all([first, current, alsoCurrent]);
    expect(found).toEqual({ ok: true, path: path.join(docs, 'designs', 'w-7', 'new.png') });
    expect(alsoFound.ok).toBe(true);
    expect(readsOf(docs)).toBe(2);
  });

  it('gives up on a folder read that never comes back; later walks skip that folder until its read returns', async () => {
    const hung = path.join(docs, 'designs', 'w-3');
    hangOn = hung;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const stuck = find('shot.png', { now: 1_000_000 });
      // The rest of the tree is read for real before the clock jumps.
      for (let i = 0; i < 5000 && !(readsOf(hung) && open === 1 && reads.length > 40); i++) await tick();
      await vi.advanceTimersByTimeAsync(WALK_GIVES_UP_MS + 1);
      expect((await stuck).ok).toBe(true);
      const later = await find('shot.png', { now: 1_000_000 + HUNT_KEPT_AT_MOST_MS + 1 });
      expect(later.ok).toBe(true);
      expect(readsOf(hung)).toBe(1);
      unhang();
      await tick();
      await find('shot.png', { now: 1_000_000 + 2 * HUNT_KEPT_AT_MOST_MS + 2 });
      expect(readsOf(hung)).toBe(2);
    } finally { vi.useRealTimers(); unhang(); }
  });

  it('reads at most two folders at a time', async () => {
    expect((await find('shot.png')).ok).toBe(true);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('a walk that has finished', () => {
  it('a quick one is read again once its 5 s are up', async () => {
    await find('a.png', { now: 1_000_000 });
    await find('b.png', { now: 1_000_000 + HUNT_FRESH_MS });
    expect(readsOf(docs)).toBe(2);
  });

  it('a slow one answers for longer than 5 s', async () => {
    hold();
    const first = find('a.png', { now: 1_000_000 });
    await new Promise((r) => setTimeout(r, 700));
    release();
    await first;
    await find('b.png', { now: 1_000_000 + HUNT_FRESH_MS + 500 });
    expect(readsOf(docs)).toBe(1);
  });

  it('but never past 30 s, however slow it was', async () => {
    hold();
    const first = find('a.png', { now: 1_000_000 });
    await new Promise((r) => setTimeout(r, 3_100));
    release();
    await first;
    await find('b.png', { now: 1_000_000 + HUNT_KEPT_AT_MOST_MS - 1 });
    expect(readsOf(docs)).toBe(1);
    await find('c.png', { now: 1_000_000 + HUNT_KEPT_AT_MOST_MS });
    expect(readsOf(docs)).toBe(2);
  });

  it('does NOT answer a look that must be current', async () => {
    await find('a.png');
    await find('b.png', { fresh: true });
    expect(readsOf(docs)).toBe(2);
  });

  it('still finds every file in the tree', async () => {
    fs.writeFileSync(path.join(docs, 'designs', 'w-39', 'last.png'), 'x');
    expect(await find('last.png')).toEqual({ ok: true, path: path.join(docs, 'designs', 'w-39', 'last.png') });
  });
});
