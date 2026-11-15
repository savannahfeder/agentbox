// Three power testers moved a working cloud thread to This Mac (2026-11-10).
// Each time the thread left In progress for 6 to 12 seconds: once it sat in
// Needs you under an old "stopped partway" note, once on the board as QUEUED.
// It did carry on, but only at the next 15-second tick: the move's end woke
// nothing and queued nothing, so in between the thread was in no list that
// reads In progress. Measured from the testers' traces (kill 09:32:27, local
// start 09:32:39).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

function make() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-carries-on-'));
  dirs.push(root);
  const sup = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true } as never, root);
  sup._saveState = () => {};
  let woke = 0;
  sup.wake = () => { woke += 1; };
  sup.releaseTaskFolder = (() => Promise.resolve(null)) as never;
  const item = { id: 'w-1', product: 'p' } as never;
  const run = (extra: Record<string, unknown>) => {
    const session = { itemId: 'w-1', product: 'p', engine: 'claude', cloud: true, child: { kill() {} }, tail: [], ...extra };
    sup.sessions.set('w-1', session as never);
    return session;
  };
  return { sup, item, run, woke: () => woke };
}

describe('a cloud run the person moved to this Mac', () => {
  it('queues its thread to carry on here and wakes the app the moment it ends', () => {
    const { sup, item, run, woke } = make();
    const session = run({});
    sup.setThreadOnMac({ 'w-1': true });
    sup.endSession(item, session as never, { slug: 'p' } as never);
    expect(sup._resumeQueue.has('w-1')).toBe(true);
    expect(woke()).toBeGreaterThan(0);
  });

  it('reads In progress through the gap, as a thread starting', () => {
    const { sup, item, run } = make();
    const session = run({});
    sup.setThreadOnMac({ 'w-1': true });
    sup.endSession(item, session as never, { slug: 'p' } as never);
    expect(sup.runsGoing().map((s) => s.itemId)).not.toContain('w-1');
    expect(sup._resumeQueue.has('w-1')).toBe(true);
  });

  it('a run the person stopped is not carried on', () => {
    const { sup, item, run } = make();
    const session = run({});
    sup.stopSession('w-1');
    sup.endSession(item, session as never, { slug: 'p' } as never);
    expect(sup._resumeQueue.has('w-1')).toBe(false);
  });

  it('a run that had answered and only kept its machine for a reply starts nothing', () => {
    const { sup, item, run } = make();
    const session = run({ between: true });
    sup.setThreadOnMac({ 'w-1': true });
    sup.endSession(item, session as never, { slug: 'p' } as never);
    expect(sup._resumeQueue.has('w-1')).toBe(false);
  });

  it('a run that simply ended is not carried on', () => {
    const { sup, item, run } = make();
    const session = run({});
    sup.endSession(item, session as never, { slug: 'p' } as never);
    expect(sup._resumeQueue.has('w-1')).toBe(false);
  });
});
