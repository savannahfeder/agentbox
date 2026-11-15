// A SHIP WHOSE TEST RUN DIED IS TRIED AGAIN BEFORE ANYONE IS TOLD.
//
// What broke: a ship's tests that were killed or cut off on a busy Mac, with no
// test failing, went straight back to the thread's agent. The agent could not
// make the Mac quieter, so it asked the person to restart and reply "try
// again" or "ship" later, and the thread sat in their inbox as failed
// (w-3145994e6b, w-b4dbfc0f31, w-1e52420829 on 2026-11-13 to 15). They asked
// that a thread held back by memory not reach them until it is done
// (w-6f4acda096b7).
//
// Now a died run ships again on its own, after DIED_AGAIN_MS, and goes back to
// the agent only when every try died. A run that went red goes back at once.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIED_AGAIN_MS, SHIP_LABEL, ShipQueue } from '../main/ship-queue.mts';

const CUT_OFF = [
  'ship: the hook runs every test for this push',
  '✓ tests/one-thing-works.test.mts (3 tests) 40ms',
  'ship: stopped after 60 minutes.',
].join('\n');
const KILLED = '✓ tests/one-thing-works.test.mts (3 tests) 40ms\n';
const RED = '❯ tests/one-thing-works.test.mts (3 tests | 1 failed) 40ms\n';
const SHIPPED = 'ship: shipped abc1234.\n';

let tmp: string; let repo: string; let userDir: string; let folders: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-died-'));
  repo = path.join(tmp, 'repo');
  userDir = path.join(tmp, 'user');
  folders = path.join(tmp, 'folders');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ team: { script: 'scripts/ship.mjs' } }));
  fs.mkdirSync(path.join(folders, 'w-a'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const products = () => [{ slug: 'team', repoPath: repo }];
const row = (labelledAt = 1000) => ({ id: 'w-a', product: 'team', status: 'open', labels: [SHIP_LABEL], updatedAt: labelledAt, wrote: { labels: { ts: labelledAt } } });

function queue(outs: string[]) {
  let now = 1_000_000;
  const calls: unknown[][] = [];
  const handed: string[] = [];
  let runs = 0;
  const q = new ShipQueue({
    store: { shipped: (...a: unknown[]) => calls.push(['shipped', ...a]), shipFailed: (...a: unknown[]) => calls.push(['shipFailed', ...a]) },
    userDir,
    folderFor: (item) => path.join(folders, item.id),
    isLive: () => false,
    handBack: (_i, reply) => handed.push(reply),
    run: async () => { const out = outs[Math.min(runs, outs.length - 1)]; runs += 1; return { code: out === SHIPPED ? 0 : 1, out }; },
    clock: () => now,
  });
  return {
    q, calls, handed,
    runs: () => runs,
    later: (ms: number) => { now += ms; },
    tick: async (item = row()) => { await q.tick([item], products()); },
  };
}

describe('a test run that died', () => {
  it('is not handed back or written up as failed the first time', async () => {
    const s = queue([CUT_OFF]);
    await s.tick();
    expect(s.runs()).toBe(1);
    expect(s.calls).toEqual([]);
    expect(s.handed).toEqual([]);
  });

  it('stays waiting to ship, so the thread stays out of Needs you', async () => {
    const s = queue([KILLED]);
    await s.tick();
    expect(s.q.waitingIds([row()], products())).toEqual(['w-a']);
  });

  it('is not run again a moment before its wait is over', async () => {
    const s = queue([KILLED]);
    await s.tick();
    s.later(DIED_AGAIN_MS[0] - 1);
    await s.tick();
    expect(s.runs()).toBe(1);
  });

  it('ships again on its own once it is', async () => {
    const s = queue([KILLED, SHIPPED]);
    await s.tick();
    s.later(DIED_AGAIN_MS[0]);
    await s.tick();
    expect(s.runs()).toBe(2);
    expect(s.calls.map((c) => c[0])).toEqual(['shipped']);
    expect(s.handed).toEqual([]);
  });

  it('goes back to its agent only after every try died, and says how many', async () => {
    const s = queue([CUT_OFF]);
    await s.tick();
    for (const wait of DIED_AGAIN_MS) { s.later(wait); await s.tick(); }
    expect(s.runs()).toBe(DIED_AGAIN_MS.length + 1);
    expect(s.calls.map((c) => c[0])).toEqual(['shipFailed']);
    expect(s.handed).toHaveLength(1);
    expect(s.handed[0]).toMatch(new RegExp(`tried to ship your branch ${DIED_AGAIN_MS.length + 1} times`));
    s.later(DIED_AGAIN_MS.at(-1)! * 10);
    await s.tick();
    expect(s.runs()).toBe(DIED_AGAIN_MS.length + 1);
  });

  it('a new ready from the agent gets its own tries', async () => {
    const s = queue([CUT_OFF]);
    await s.tick();
    for (const wait of DIED_AGAIN_MS) { s.later(wait); await s.tick(); }
    await s.tick(row(5000));
    expect(s.runs()).toBe(DIED_AGAIN_MS.length + 2);
    expect(s.handed).toHaveLength(1);
  });
});

describe('a test run that went red', () => {
  it('goes back to its agent at once, as before', async () => {
    const s = queue([RED]);
    await s.tick();
    expect(s.calls.map((c) => c[0])).toEqual(['shipFailed']);
    expect(s.handed).toHaveLength(1);
    expect(s.handed[0]).not.toMatch(/branch \d+ times/);
  });

  it('even after an earlier try died', async () => {
    const s = queue([KILLED, RED]);
    await s.tick();
    s.later(DIED_AGAIN_MS[0]);
    await s.tick();
    expect(s.calls.map((c) => c[0])).toEqual(['shipFailed']);
    expect(s.handed).toHaveLength(1);
  });
});
