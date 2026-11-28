// A name no checkout holds is not looked for in every checkout on every ask.
//
// 2026-11-22: the app's own CPU record put 6% of the main thread's busy time in
// the look through task checkouts for a file nothing else found. A thread's
// view asks for every name it mentions on each change in the app, and each ask
// checked four places in every checkout: on that Mac 43 checkouts, 172 checks
// a name, two of the four the same place when the name has no folder in it.
// The look is now kept for the few seconds a folder's list is.
//
// 2026-11-23: it was still 9% with twenty such names every few seconds, so
// each checkout's folders are now listed once for all of them and a checkout
// is asked only about a name its lists hold
// (tests/a-name-is-looked-for-in-the-checkouts-from-one-list-of-each).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS } from '../main/artifact-path.mts';

const CHECKOUTS = 40;
let root = '', repo = '', dir = '';
let checks: string[] = [];
let lists: string[] = [];
const WORKTREES = `${path.sep}.claude${path.sep}worktrees`;
const counted = {
  ...fs,
  promises: {
    ...fs.promises,
    stat: ((file: string) => { checks.push(String(file)); return fs.promises.stat(file); }) as typeof fs.promises.stat,
    readdir: ((folder: string, o?: never) => { if (String(folder).includes(WORKTREES)) lists.push(String(folder)); return fs.promises.readdir(folder, o); }) as typeof fs.promises.readdir,
  },
};
const inCheckouts = () => checks.filter((f) => f.includes(`${WORKTREES}${path.sep}`)).length;
// The folder of checkouts, each checkout, and the shots folder each one here has.
const ONE_LOOK = 1 + CHECKOUTS * 2;
const id = (n: number) => `w-${(0xabc000 + n).toString(16)}`;
const checkout = (n: number) => path.join(repo, '.claude', 'worktrees', id(n));
const ask = (src: string, now: number, { thread = null as string | null, fresh = false } = {}) => resolveArtifact({
  src, product: 'ours', products: [{ slug: 'ours', dir, repoPath: repo }], fs: counted, now, thread, fresh,
});

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'every-checkout-')));
  repo = path.join(root, 'repo');
  dir = path.join(root, 'docs');
  fs.mkdirSync(dir);
  for (let n = 0; n < CHECKOUTS; n++) fs.mkdirSync(path.join(checkout(n), 'shots'), { recursive: true });
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
beforeEach(() => { checks = []; lists = []; });

describe('a name nothing else found', () => {
  it('is looked for in each checkout\'s lists once, however often it is asked in a few seconds', async () => {
    const now = 1_000_000;
    for (let n = 0; n < 10; n++) expect((await ask('missing.png', now + n * 100)).ok).toBe(false);
    // No checkout lists it, so none is asked about it. It was three places a checkout, 120 asks.
    expect(lists).toHaveLength(ONE_LOOK);
    expect(inCheckouts()).toBe(0);
  });

  it('is looked for again once those seconds have passed', async () => {
    const now = 2_000_000;
    await ask('later.png', now);
    expect(lists).toHaveLength(ONE_LOOK);
    await ask('later.png', now + HUNT_FRESH_MS - 1);
    expect(lists).toHaveLength(ONE_LOOK);
    await ask('later.png', now + HUNT_FRESH_MS + 1);
    expect(lists).toHaveLength(ONE_LOOK * 2);
  });

  it('is looked for at once by a look that must be current', async () => {
    const now = 3_000_000;
    await ask('current.png', now);
    expect(lists).toHaveLength(ONE_LOOK);
    await ask('current.png', now + 100, { fresh: true });
    expect(lists).toHaveLength(ONE_LOOK * 2);
  });

  it('is still found in the asking thread\'s own checkout the moment it lands', async () => {
    const now = 4_000_000;
    const mine = id(7);
    expect((await ask('shot.png', now, { thread: mine })).ok).toBe(false);
    fs.writeFileSync(path.join(checkout(7), 'shots', 'shot.png'), 'x');
    const found = await ask('shot.png', now + 100, { thread: mine });
    expect(found.ok && found.path).toBe(path.join(checkout(7), 'shots', 'shot.png'));
  });

  it('keeps one name\'s look from answering for another', async () => {
    const now = 5_000_000;
    fs.writeFileSync(path.join(checkout(3), 'shots', 'two.png'), 'x');
    await ask('one.png', now);
    expect(inCheckouts()).toBe(0);
    await ask('two.png', now + 100);
    // The one checkout that lists it is asked about it, from the same lists.
    expect(checks.filter((f) => f.includes(WORKTREES))).toEqual([path.join(checkout(3), 'shots', 'two.png')]);
    expect(lists).toHaveLength(ONE_LOOK);
  });
});
