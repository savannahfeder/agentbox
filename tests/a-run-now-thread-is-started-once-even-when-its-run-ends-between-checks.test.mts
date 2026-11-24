// A RUN NOW THREAD IS STARTED ONCE, EVEN WHEN ITS RUN ENDS BETWEEN TWO CHECKS.
//
// What broke (2026-11-23): in a browser copy of the app on the stand-in
// worker, which answers in well under a second, a thread started with Run now
// started again about every 15 seconds and was never held: 47 to 89 starts per
// thread in about 20 minutes. Run now's mark only learned its run had started
// by finding the run live at a tick (`_settleRunNow`). A start that waits on
// the thread's folder, or on the last run's leftovers, happens between ticks,
// so a run that also ended before the next tick was never seen: the mark kept
// reading "not started yet", the thread was still open, and every tick pushed
// it again. Each run began, so the six-dead-starts hold never counted one.
// Measured here on the real tick with only the agent start stubbed: before the
// fix the thread was spawned on every one of five ticks.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';
import type { WorkItem, WorkerSession } from '../main/supervisor.mts';

const NOW = Date.now();
const HOUR = 3_600_000;

// Filed by an agent under a thread of hers: never fresh work, so only the
// push can start it, and any start after the first is the push's.
const pushedRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'], priority: 2,
  parent: 'w-parent', createdAt: NOW - 2 * HOUR, updatedAt: NOW - 2 * HOUR, claim: null, claimExpired: false,
  wrote: { title: { ts: NOW - 2 * HOUR, source: 'agent' }, labels: { ts: NOW - 2 * HOUR, source: 'agent' } },
  ...extra,
}) as unknown as WorkItem;

let sup: Supervisor;
let spawned: string[];
let items: WorkItem[];

// The start the folder or the leftovers hold back: nothing is live when the
// tick that asked for it moves on.
const build = (rows: WorkItem[]) => {
  items = rows;
  sup = new Supervisor(
    { home: '/nonexistent-home-with-no-second-account', storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 2, authProfiles: ['default'] },
    { listItems: () => items, listProducts: () => [], isDue: () => true, settleAnswer() {} },
    '/nonexistent-app',
  );
  spawned = [];
  sup.spawnWorker = (item: WorkItem) => { spawned.push(item.id); };
  sup._saveState = () => {};
};

const session = (id: string) => ({ itemId: id, product: 'agentbox', startedAt: Date.now(), tail: [] }) as unknown as WorkerSession;

// The run starts through the one place every run is marked live, and ends.
const startsAndEnds = (id: string) => {
  sup._noteRunCarrying(items.find((i) => i.id === id)!, session(id));
  sup.sessions.delete(id);
};

const theAgentAnswered = (id: string) => {
  items = items.map((i) => (i.id === id ? { ...i, result: 'Done.', wrote: { ...i.wrote, result: { ts: Date.now(), source: 'agent' } } } as WorkItem : i));
};

beforeEach(() => build([pushedRow('w-pushed')]));

describe('a thread started with Run now', () => {
  it('is not started again when its run began and ended between two ticks', async () => {
    expect(sup.runNow('agentbox', 'w-pushed')).toEqual({ ok: true });
    await sup.tick();
    startsAndEnds('w-pushed');
    theAgentAnswered('w-pushed');
    for (let i = 0; i < 4; i++) await sup.tick();
    expect(spawned).toEqual(['w-pushed']);
    expect(sup.status().runNow).not.toContain('w-pushed');
  });

  it('is not started again when a tick saw its run live', async () => {
    sup.runNow('agentbox', 'w-pushed');
    await sup.tick();
    sup.sessions.set('w-pushed', session('w-pushed'));
    await sup.tick();
    sup.sessions.delete('w-pushed');
    theAgentAnswered('w-pushed');
    for (let i = 0; i < 3; i++) await sup.tick();
    expect(spawned).toEqual(['w-pushed']);
  });

  // THE CASE THAT MUST NOT CHANGE: a push whose run has not started yet still
  // stands, and still reads Up next.
  it('still stands while its run has not started', async () => {
    sup.runNow('agentbox', 'w-pushed');
    await sup.tick();
    expect(sup.status().runNow).toContain('w-pushed');
    await sup.tick();
    expect(spawned).toEqual(['w-pushed', 'w-pushed']);
  });

  it('marks only its own thread started', async () => {
    build([pushedRow('w-pushed'), pushedRow('w-other')]);
    sup.runNow('agentbox', 'w-pushed');
    sup.runNow('agentbox', 'w-other');
    await sup.tick();
    startsAndEnds('w-pushed');
    theAgentAnswered('w-pushed');
    await sup.tick();
    expect(spawned.filter((id) => id === 'w-pushed')).toEqual(['w-pushed']);
    expect(sup.status().runNow).toContain('w-other');
  });
});
