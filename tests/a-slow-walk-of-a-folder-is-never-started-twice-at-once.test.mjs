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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS } from '../main/artifact-path.mjs';

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
      try {
        if (held) await held;
        return await fs.promises.readdir(dir, opts);
      } finally { open -= 1; }
    },
  },
};
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

  it('is waited on by a look that must be current', async () => {
    hold();
    const first = find('a.png');
    await tick();
    const current = find('b.png', { fresh: true });
    await tick();
    release();
    await Promise.all([first, current]);
    expect(readsOf(docs)).toBe(1);
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

  it('a slow one answers for ten times as long as it took', async () => {
    hold();
    const first = find('a.png', { now: 1_000_000 });
    await new Promise((r) => setTimeout(r, 700));
    release();
    await first;
    await find('b.png', { now: 1_000_000 + HUNT_FRESH_MS + 500 });
    expect(readsOf(docs)).toBe(1);
    await find('c.png', { now: 1_000_000 + 8_000 });
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
