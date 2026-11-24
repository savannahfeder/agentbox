// A name is looked for in the checkouts from one list of each.
//
// 2026-11-23: once the app stopped listing every project for missing files,
// the top single frame in its CPU record was the look through every thread's
// checkout for a name nothing else found: 9% of the main thread's busy time.
// 21 checkouts on that Mac, three or four places asked about in each one for
// each name, and about twenty such names every few seconds. Each checkout's
// folders are now listed once for all of those names, and a checkout is asked
// about a name only when its list holds it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS } from '../main/artifact-path.mts';
import { createWorkItem, updateWorkItem } from '../main/store/work-items.mts';

const CHECKOUTS = 30;
let root = '';
let docs = '';
let repo = '';
let checkouts = '';
let asked: string[] = [];
let listed: string[] = [];

const inCheckouts = (p: unknown) => String(p).startsWith(checkouts);
const counted = {
  ...fs,
  promises: {
    ...fs.promises,
    stat: ((p: fs.PathLike) => { if (inCheckouts(p)) asked.push(String(p)); return fs.promises.stat(p); }) as typeof fs.promises.stat,
    readdir: ((p: fs.PathLike, o?: never) => { if (inCheckouts(p)) listed.push(String(p)); return fs.promises.readdir(p, o); }) as typeof fs.promises.readdir,
  },
};
const put = (file: string, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const ask = (src: string, { now = 1_000_000, thread = null as string | null, fresh = false } = {}) => resolveArtifact({
  src, product: 'ours', products: [{ slug: 'ours', dir: docs, repoPath: repo }], accountRoot: root, storeRoot: path.join(root, 'home'), fs: counted, now, thread, fresh,
});
const checkout = (id: string) => path.join(checkouts, id);
// A thread with a checkout of its own, whose answer says these words.
const threadSaying = (words: string) => {
  const { id } = createWorkItem(docs, { title: 'A thread' });
  updateWorkItem(docs, id, { result: words }, { source: 'agent' });
  fs.mkdirSync(checkout(id), { recursive: true });
  return id;
};

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'one-list-')));
  docs = path.join(root, 'ours');
  repo = path.join(root, 'repo');
  checkouts = path.join(repo, '.claude', 'worktrees');
  // Checkouts as they are: code at the top, and a shots folder in every third.
  for (let i = 0; i < CHECKOUTS; i += 1) {
    const dir = checkout(`w-${String(i).padStart(10, 'a')}`);
    put(path.join(dir, 'package.json'));
    put(path.join(dir, 'main', 'index.mts'));
    if (i % 3 === 0) put(path.join(dir, 'shots', 'an-old-shot.png'));
  }
  put(path.join(docs, 'notes.md'));
  asked = [];
  listed = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('names no checkout holds', () => {
  it('twenty of them ask no checkout about any, and list each checkout once', async () => {
    const found = await Promise.all(Array.from({ length: 20 }, (_, i) => ask(`missing-${i}.png`)));
    expect(found.every((f) => !f.ok)).toBe(true);
    // 1,800 asks before: three places, thirty checkouts, twenty names.
    expect(asked).toEqual([]);
    // The folder of checkouts, each checkout, and the shots folder of the ten that have one.
    expect(listed).toHaveLength(1 + CHECKOUTS + 10);
  });

  it('a path with folders in it asks only the checkouts that have its first folder', async () => {
    expect((await ask('reports/2026/q3.md')).ok).toBe(false);
    expect(asked).toEqual([]);
    expect((await ask('main/gone.mts', { now: 1_000_100 })).ok).toBe(false);
    expect(asked).toHaveLength(CHECKOUTS);
  });

  it('are listed for again once the lists are old, and not a moment before', async () => {
    await ask('a.png', { now: 2_000_000 });
    const once = listed.length;
    await ask('b.png', { now: 2_000_000 + HUNT_FRESH_MS - 1 });
    expect(listed).toHaveLength(once);
    await ask('c.png', { now: 2_000_000 + HUNT_FRESH_MS });
    expect(listed).toHaveLength(once * 2);
  });
});

describe('a name some other thread\'s checkout holds', () => {
  it('is found at its top, in shots, in designs and under a folder of its own, asking only that checkout', async () => {
    for (const rel of ['chart.png', 'shots/board.png', 'designs/page.html', 'reports/2026/q3.md']) {
      const name = path.basename(rel);
      const id = threadSaying(`made ${name}`);
      const file = put(path.join(checkout(id), rel));
      asked = [];
      // Asked by its bare name, and for the last by the path its thread wrote.
      const src = rel.startsWith('reports/') ? rel : name;
      expect(await ask(src, { fresh: true }), rel).toEqual({ ok: true, path: file });
      expect(asked.filter((p) => !p.startsWith(checkout(id))), rel).toEqual([]);
    }
  });

  it('is found by a look that must be current the moment it lands, and by any look once the lists are old', async () => {
    const id = threadSaying('made late.png');
    expect((await ask('late.png', { now: 3_000_000 })).ok).toBe(false);
    const file = put(path.join(checkout(id), 'shots', 'late.png'));
    expect((await ask('late.png', { now: 3_000_000 + HUNT_FRESH_MS - 1 })).ok).toBe(false);
    expect(await ask('late.png', { now: 3_000_000 + HUNT_FRESH_MS - 1, fresh: true })).toEqual({ ok: true, path: file });
    expect(await ask('late.png', { now: 3_000_000 + 3 * HUNT_FRESH_MS })).toEqual({ ok: true, path: file });
  });

  it('is found under another case wherever the disk itself would find it', async () => {
    const id = threadSaying('made chart.png');
    const file = put(path.join(checkout(id), 'Chart.PNG'));
    const diskFinds = fs.existsSync(path.join(checkout(id), 'chart.png'));
    expect((await ask('chart.png')).ok).toBe(diskFinds);
    if (diskFinds) expect(fs.statSync((await ask('chart.png') as { path: string }).path).ino).toBe(fs.statSync(file).ino);
  });

  it('is found when its name is not in plain letters', async () => {
    const id = threadSaying('made café-été.png');
    const file = put(path.join(checkout(id), 'shots', 'café-été.png'));
    expect(await ask('café-été.png')).toEqual({ ok: true, path: file });
  });

  it('is NOT handed back from a checkout whose thread never named it', async () => {
    const quiet = threadSaying('nothing about pictures');
    put(path.join(checkout(quiet), 'chart.png'));
    expect((await ask('chart.png')).ok).toBe(false);
  });
});

describe('the asking thread\'s own checkout', () => {
  it('is asked directly, so a file is found the moment it lands with no list read', async () => {
    const mine = threadSaying('working on it');
    expect((await ask('shot.png', { thread: mine, now: 4_000_000 })).ok).toBe(false);
    const file = put(path.join(checkout(mine), 'shots', 'shot.png'));
    listed = [];
    expect(await ask('shot.png', { thread: mine, now: 4_000_100 })).toEqual({ ok: true, path: file });
    expect(listed).toEqual([]);
  });
});
