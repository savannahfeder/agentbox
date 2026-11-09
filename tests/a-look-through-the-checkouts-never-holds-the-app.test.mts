// Looking through thread checkouts for a file does not hold the main process.
//
// The Files work added a lookup to main/artifact-path.mts for a file a script
// made in a thread's checkout. It ran on the main process with readdirSync and
// four existsSync per checkout, on every name nothing else found, and for a
// run's change record, which the open thread asks for on every refresh. Against
// 500 checkouts one missing name did 1 readdirSync and 2,000 existsSync, and
// tests/a-file-a-thread-cannot-find-does-not-freeze-the-app went red ("expected
// 36 to be 35", and a change record reading .claude/worktrees).
//
// Now the checkouts are looked through without a synchronous call, and one
// listing answers while it is as fresh as a walk of a tree.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS } from '../main/artifact-path.mts';
import { createWorkItem, updateWorkItem } from '../main/store/work-items.mts';

let root;
let docs;
let repo;
let checkouts;
let syncTouches;
let listings;

const underCheckouts = (p) => String(p).startsWith(checkouts);
const counted = {
  ...fs,
  existsSync: (p) => { if (underCheckouts(p)) syncTouches.push(String(p)); return fs.existsSync(p); },
  statSync: (p, o) => { if (underCheckouts(p)) syncTouches.push(String(p)); return fs.statSync(p, o); },
  readdirSync: (p, o) => { if (underCheckouts(p)) syncTouches.push(String(p)); return fs.readdirSync(p, o); },
  promises: {
    ...fs.promises,
    readdir: (p, o) => { if (String(p) === checkouts) listings.push(String(p)); return fs.promises.readdir(p, o); },
  },
};
const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const ask = (src, { now = 1_000_000, thread = null, fresh = false } = {}) => resolveArtifact({
  src, product: 'ours', products: [{ slug: 'ours', dir: docs, repoPath: repo }], accountRoot: root, storeRoot: path.join(root, 'home'), fs: counted, now, thread, fresh,
});
const checkout = (id) => path.join(checkouts, id);
const threadSaying = (words) => {
  const { id } = createWorkItem(docs, { title: 'A thread' });
  updateWorkItem(docs, id, { result: words }, { source: 'agent' });
  return id;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'checkouts-'));
  docs = path.join(root, 'ours');
  repo = path.join(root, 'repo');
  checkouts = path.join(repo, '.claude', 'worktrees');
  for (let i = 0; i < 40; i++) fs.mkdirSync(checkout(`w-${String(i).padStart(10, 'a')}`), { recursive: true });
  put(path.join(docs, 'notes.md'));
  put(path.join(repo, 'README.md'));
  syncTouches = [];
  listings = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a name nothing else found', () => {
  it('looks through the checkouts with no synchronous call into them', async () => {
    const out = await ask('nowhere.png');
    expect(out.ok).toBe(false);
    expect(syncTouches).toEqual([]);
  });

  it('lists the checkouts once for twenty names asked at once', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => ask(`missing-${i}.png`)));
    expect(listings).toHaveLength(1);
  });

  it('lists them again only once the last listing is old: one moment under, and at the limit', async () => {
    await ask('a.png', { now: 1_000_000 });
    await ask('b.png', { now: 1_000_000 + HUNT_FRESH_MS - 1 });
    expect(listings).toHaveLength(1);
    await ask('c.png', { now: 1_000_000 + HUNT_FRESH_MS });
    expect(listings).toHaveLength(2);
  });

  it('a look that must be current lists them every time', async () => {
    await ask('a.png', { fresh: true });
    await ask('b.png', { fresh: true });
    expect(listings).toHaveLength(2);
  });
});

describe('a run\'s change record', () => {
  it('never looks in a checkout, even one that holds a file of that name', async () => {
    const id = threadSaying('runs/w-1/the-change-it-made.change');
    put(path.join(checkout(id), 'the-change-it-made.change'));
    const out = await ask('runs/w-1/the-change-it-made.change', { thread: id });
    expect(out.ok).toBe(false);
    expect(listings).toEqual([]);
  });

  it('does NOT stop a folder merely called runs lower down being looked through', async () => {
    const id = threadSaying('made shots/runs/a.png');
    const file = put(path.join(checkout(id), 'shots', 'runs', 'a.png'));
    expect(await ask('shots/runs/a.png', { thread: id })).toEqual({ ok: true, path: file });
  });
});

describe('what the look finds is still right', () => {
  it('the thread\'s own checkout first, whatever another holds, with no listing', async () => {
    const mine = threadSaying('made out.png');
    const other = threadSaying('made out.png');
    const file = put(path.join(checkout(mine), 'out.png'));
    put(path.join(checkout(other), 'out.png'));
    expect(await ask('out.png', { thread: mine })).toEqual({ ok: true, path: file });
    expect(listings).toEqual([]);
  });

  it('the newest checkout whose thread names the file, when no thread is given', async () => {
    const older = threadSaying('made chart.png');
    const newer = threadSaying('made chart.png');
    const a = put(path.join(checkout(older), 'chart.png'));
    const b = put(path.join(checkout(newer), 'chart.png'));
    fs.utimesSync(a, new Date(1_000), new Date(1_000));
    fs.utimesSync(b, new Date(2_000), new Date(2_000));
    expect(await ask('chart.png')).toEqual({ ok: true, path: b });
  });

  it('does NOT hand back a checkout whose thread never named the file', async () => {
    const quiet = threadSaying('nothing about pictures');
    put(path.join(checkout(quiet), 'chart.png'));
    expect((await ask('chart.png')).ok).toBe(false);
  });

  it('does NOT follow .. out of the checkouts', async () => {
    const id = threadSaying('made ../secret.png');
    put(path.join(checkouts, 'secret.png'));
    expect((await ask('../secret.png', { thread: id })).ok).toBe(false);
  });
});
