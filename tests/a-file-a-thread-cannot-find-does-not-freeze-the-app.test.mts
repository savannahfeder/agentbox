// A file a thread names and nobody can find no longer freezes the app.
//
// The spinning wheel came up while reading threads, worst on ones full of
// pictures. Every name in a message that did not resolve straight away (a
// picture still on its way, a /tmp path, the change record of a run that
// changed no code) sent main/artifact-path.mjs on a by-name hunt: a synchronous
// walk, six levels deep, of the whole project folder and the whole code repo,
// on the main process. One miss over a 7,700-entry tree took 16 ms on a Linux
// box with a warm disk (scripts/scratch/time-hunt.mjs). A thread asks once per
// mention on open, the open thread asks for its change record on every refresh
// while an agent works, and a missing picture asks again on a timer, so the
// walks stacked up and the window stopped answering.
//
// Now the hunt reads the disk without holding the main process, one walk of a
// tree answers every name asked for while it is a few seconds old, and a run's
// change record is found by its exact path or not at all.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS } from '../main/artifact-path.mjs';

let root;
let docs;
let repo;
let other;
let reads;
// The real disk, with every directory read counted.
const counted = {
  ...fs,
  readdirSync: (dir, opts) => { reads.push(String(dir)); return fs.readdirSync(dir, opts); },
  promises: {
    ...fs.promises,
    readdir: (dir, opts) => { reads.push(String(dir)); return fs.promises.readdir(dir, opts); },
  },
};
const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const products = () => [
  { slug: 'ours', dir: docs, repoPath: repo },
  { slug: 'theirs', dir: other, repoPath: null },
];
const find = (src, { product = 'ours', now = 1_000_000 } = {}) => resolveArtifact({
  src, product, products: products(), accountRoot: root, storeRoot: path.join(root, 'home'), fs: counted, now,
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hunt-'));
  docs = path.join(root, 'ours');
  repo = path.join(root, 'repo');
  other = path.join(root, 'theirs');
  for (let t = 0; t < 30; t++) put(path.join(docs, 'designs', `w-${t}`, 'shot.png'));
  for (let i = 0; i < 30; i++) put(path.join(repo, 'src', `f${i}.mjs`));
  put(path.join(other, 'designs', 'only-theirs.png'));
  reads = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a name nobody can find', () => {
  it('is hunted for without holding the app: other work runs while the folders are read', async () => {
    let ran = false;
    setImmediate(() => { ran = true; });
    const out = await find('nowhere.png');
    expect(out.ok).toBe(false);
    expect(ran).toBe(true);
  });

  it('twenty of them asked at once read each folder once, not twenty times', async () => {
    const names = Array.from({ length: 20 }, (_, i) => `missing-${i}.png`);
    const all = await Promise.all(names.map((n) => find(n)));
    expect(all.every((r) => r.ok === false)).toBe(true);
    expect(reads.filter((d) => d === docs)).toHaveLength(1);
    expect(reads.filter((d) => d === repo)).toHaveLength(1);
  });

  it('asked again a moment later reads nothing new', async () => {
    await find('a.png', { now: 1_000_000 });
    const before = reads.length;
    await find('b.png', { now: 1_000_000 + HUNT_FRESH_MS - 1 });
    expect(reads.length).toBe(before);
  });

  it('asked again once the walk is old reads the folders again', async () => {
    await find('a.png', { now: 1_000_000 });
    const before = reads.length;
    await find('b.png', { now: 1_000_000 + HUNT_FRESH_MS });
    expect(reads.length).toBeGreaterThan(before);
  });
});

describe('the change record of a run that changed nothing', () => {
  it('is answered without walking any folder', async () => {
    const out = await find('runs/w-0d6c38b457/the-change-it-made.change');
    expect(out.ok).toBe(false);
    expect(reads).toEqual([]);
  });
});

describe('what the hunt finds is still right', () => {
  it('finds a picture by its name alone, the newest one when there are several', async () => {
    const old = put(path.join(docs, 'reports', 'chart.png'));
    const fresh = put(path.join(repo, 'shots', 'chart.png'));
    fs.utimesSync(old, new Date(1_000), new Date(1_000));
    fs.utimesSync(fresh, new Date(2_000), new Date(2_000));
    expect(await find('chart.png')).toEqual({ ok: true, path: fresh });
  });

  it('finds a picture that landed after the last walk, once that walk is old', async () => {
    expect((await find('late.png', { now: 1_000_000 })).ok).toBe(false);
    const late = put(path.join(docs, 'designs', 'w-9', 'late.png'));
    expect(await find('late.png', { now: 1_000_000 + HUNT_FRESH_MS })).toEqual({ ok: true, path: late });
  });

  it('does NOT hand back a file deleted since the walk that saw it', async () => {
    const gone = put(path.join(docs, 'reports', 'gone.png'));
    expect((await find('gone.png')).ok).toBe(true);
    fs.rmSync(gone);
    expect((await find('gone.png')).ok).toBe(false);
  });

  it('does NOT answer for one project out of another project\'s walk', async () => {
    expect((await find('only-theirs.png', { product: 'theirs' })).ok).toBe(true);
    expect((await find('only-theirs.png', { product: 'ours' })).ok).toBe(false);
  });
});
