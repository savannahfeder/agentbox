// A name no checkout holds is not looked for in every checkout on every ask.
//
// 2026-11-22: the app's own CPU record put 6% of the main thread's busy time in
// the look through task checkouts for a file nothing else found. A thread's
// view asks for every name it mentions on each change in the app, and each ask
// checked four places in every checkout: on that Mac 43 checkouts, 172 checks
// a name, two of the four the same place when the name has no folder in it.
// The look is now kept for the few seconds a folder's list is.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, HUNT_FRESH_MS } from '../main/artifact-path.mts';

const CHECKOUTS = 40;
let root = '', repo = '', dir = '';
let checks: string[] = [];
const counted = {
  ...fs,
  promises: {
    ...fs.promises,
    stat: ((file: string) => { checks.push(String(file)); return fs.promises.stat(file); }) as typeof fs.promises.stat,
  },
};
const inCheckouts = () => checks.filter((f) => f.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`)).length;
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
beforeEach(() => { checks = []; });

describe('a name nothing else found', () => {
  it('is looked for in each checkout once, however often it is asked in a few seconds', async () => {
    const now = 1_000_000;
    for (let n = 0; n < 10; n++) expect((await ask('missing.png', now + n * 100)).ok).toBe(false);
    // Three places a checkout: the name, shots/ and designs/. It was four, ten times over.
    expect(inCheckouts()).toBe(CHECKOUTS * 3);
  });

  it('is looked for again once those seconds have passed', async () => {
    const now = 2_000_000;
    await ask('later.png', now);
    const first = inCheckouts();
    await ask('later.png', now + HUNT_FRESH_MS - 1);
    expect(inCheckouts()).toBe(first);
    await ask('later.png', now + HUNT_FRESH_MS + 1);
    expect(inCheckouts()).toBe(first * 2);
  });

  it('is looked for at once by a look that must be current', async () => {
    const now = 3_000_000;
    await ask('current.png', now);
    const first = inCheckouts();
    await ask('current.png', now + 100, { fresh: true });
    expect(inCheckouts()).toBe(first * 2);
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
    await ask('one.png', now);
    const first = inCheckouts();
    await ask('two.png', now + 100);
    expect(inCheckouts()).toBe(first * 2);
  });
});
