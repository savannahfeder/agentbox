// AN URGENT ROW MAY REST, BUT NEVER FOR HOURS.
//
// Both fixes she already has were about the ORDER of the queue. put everything
// spawnable into one scored list, and let an Urgent row take a slot off a
// lesser session. Neither one helps a row that is not in the queue at all, and
// the rest ladder takes rows out of it: `isFresh` tests `restingUntil` BEFORE
// any score is compared, so a sleeping row is never ranked against anything.
// Priority decides who wins among the awake.
//
// The ladder is 15m, 1h, 4h, 12h, 24h and it was completely blind to her tag.
// Measured on her own supervisor state the day she filed this (the numbers are
// out of `~/Zero/.zero-supervisor.json`, not estimated):
//
//   Urgent, filed 13:07  3 empty runs  asleep 14:23 -> 18:23
//   Urgent               2 empty runs  asleep 14:30 -> 15:30
//   Urgent               5 empty runs  asleep 08-25 11:01 -> 08-26 11:01
//
// She filed this complaint at 14:46, twenty-three minutes into that four-hour
// sleep. Inside that one window 58 sessions started on 20 OTHER Agentbox rows,
// every one of them High, Medium or Low. That is her sentence exactly.
//
// The cap is the first rung and not zero, deliberately, and it is the same
// answer the same function already gives a spawn that died on arrival:
// "fifteen minutes between attempts, forever, until it works or she is told".
// A row nothing can move must not become a worker every tick; an Urgent row
// must not vanish for a working day either.
//
// READ TIME, NOT WRITE TIME. The strike count goes on recording what really
// happened (`sayTheRunDied` prints it to her), and the cap is applied where
// the rest is worked out. That is what covers the two cases a write-time cap
// would miss: strikes a row earned before it was urgent, and strikes still
// sitting in the state file from before this landed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk and not only what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity these tests are
// about. A home with nothing in it is the machine every one of them means.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';


const NOW = 1_787_600_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;

function makeSupervisor(items, root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-urgent-rest-'))) {
  const store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'agentbox', name: Name, dir: '/tmp/nowhere' }],
    isDue: (i, now = Date.now()) => !i?.runAt || i.runAt <= now,
  };
  const sup = new Supervisor({ home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3 }, store, root);
  sup.spawned = [];
  sup.spawnWorker = (item, opts) => sup.spawned.push({ item, opts });
  sup.root = root;
  return sup;
}

const took = (sup, id) => sup.spawned.filter((s) => s.item.id === id).length;

/** Her own row, at whatever level she tagged it. */
const row = (id, priority, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'I am running out of space on my machine',
  priority, createdAt: NOW - HOUR, updatedAt: NOW - MIN, wrote: {}, ...extra,
});

describe('the rest an urgent row earns', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  // The first rung is unchanged for everyone. An Urgent row that got nowhere
  // once still waits, because a worker every fifteen seconds is not urgency.
  it('is the same fifteen minutes as anyone else on the first empty run', () => {
    const items = [row('w-urgent', 9)];
    const sup = makeSupervisor(items);
    sup.noteFreshRun(items[0]);
    expect(sup.restingUntil(items[0])).toBe(NOW + 15 * MIN);
  });

  // which is the row she was looking at. Three empty runs put a Medium row to
  // sleep for four hours, and did the same to her Urgent one.
  it('never climbs past that rung, however many empty runs it takes', () => {
    const items = [row('w-urgent', 9)];
    const sup = makeSupervisor(items);
    for (let i = 0; i < 3; i += 1) sup.noteFreshRun(items[0]);
    expect(sup.restingUntil(items[0])).toBe(Date.now() + 15 * MIN);

    for (let i = 0; i < 20; i += 1) sup.noteFreshRun(items[0]);
    expect(sup.restingUntil(items[0]) - Date.now()).toBe(15 * MIN);
  });

  // The ladder is untouched for every level below Urgent. This is the rule the
  // hammering fix bought and nothing here is allowed to spend it.
  it('leaves the ladder exactly as it was for High and below', () => {
    for (const priority of [7, 5, 2]) {
      const items = [row(`w-${priority}`, priority)];
      const sup = makeSupervisor(items);
      sup.noteFreshRun(items[0]);
      sup.noteFreshRun(items[0]);
      sup.noteFreshRun(items[0]);
      expect(sup.restingUntil(items[0]) - Date.now()).toBe(4 * HOUR);
    }
  });

  // Strikes earned BEFORE she raised it. This is the realistic shape of it:
  // she tags a row Urgent precisely because nothing has happened on it, and by
  // then it is already deep in the ladder.
  it('shortens a sleep a row earned while it was still Medium', () => {
    const items = [row('w-urgent', 5)];
    const sup = makeSupervisor(items);
    for (let i = 0; i < 4; i += 1) sup.noteFreshRun(items[0]);
    expect(sup.restingUntil(items[0]) - Date.now()).toBe(12 * HOUR);

    items[0] = row('w-urgent', 9);
    expect(sup.restingUntil(items[0]) - Date.now()).toBe(15 * MIN);
  });

  // An agent may not reach this. itemPriority already throws away a worker's
  // own number, and this is the one place it matters most: a worker could
  // otherwise tag its own row a nine and buy itself a session every quarter
  // hour forever.
  it('cannot be reached by a worker tagging its own row urgent', () => {
    const items = [row('w-agent', 9, { wrote: { priority: { ts: NOW, source: 'agent' } } })];
    const sup = makeSupervisor(items);
    for (let i = 0; i < 3; i += 1) sup.noteFreshRun(items[0]);
    expect(sup.restingUntil(items[0]) - Date.now()).toBe(4 * HOUR);
  });
});

// THE PRICE OF THE CAP, PAID HERE.
//
// Waking every fifteen minutes forever is what she asked for. Taking a slot
// off a running session every fifteen minutes forever is not: on a row three
// sessions have already looked at and left alone, that is a productive worker
// killed four times an hour for a row that needs HER, not another worker.
describe('an urgent row that keeps coming back empty', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  const withFleet = (items, slots = 1) => {
    const sup = makeSupervisor(items, undefined);
    sup.spawnWorker = (item) => {
      sup.spawned.push({ item });
      sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: Date.now() });
    };
    sup.killed = [];
    sup._kill = (session) => {
      sup.killed.push(session.itemId);
      session.stoppedByUs = true;
      sup.sessions.delete(session.itemId);
      return true;
    };
    sup.transcriptFile = (rec) => (rec?.sessionId ? `/transcripts/${rec.sessionId}.jsonl` : null);
    sup.config.maxConcurrentSessions = slots;
    return sup;
  };
  const running = (sup, id) => {
    sup.sessions.set(id, { itemId: id, product: 'agentbox', startedAt: Date.now() });
    sup._liveSessions[id] = { sessionId: `s-${id}`, product: 'agentbox', cwd: '/tmp', profile: 'default' };
  };

  it('still interrupts a lesser session when it has had one empty run', async () => {
    const items = [row('w-medium', 5), row('w-urgent', 9)];
    const sup = withFleet(items);
    sup.noteFreshRun(items[1]);
    vi.setSystemTime(NOW + 16 * MIN);
    running(sup, 'w-medium');
    await sup.tick();
    expect(sup.killed).toEqual(['w-medium']);
  });

  it('stops interrupting once a second session has left it alone', async () => {
    const items = [row('w-medium', 5), row('w-urgent', 9)];
    const sup = withFleet(items);
    sup.noteFreshRun(items[1]);
    sup.noteFreshRun(items[1]);
    vi.setSystemTime(NOW + 16 * MIN);
    running(sup, 'w-medium');
    await sup.tick();
    expect(sup.killed).toEqual([]);
    // It is not parked, though. It is awake and waiting for a free slot, which
    // is the whole difference between this and the four-hour sleep.
    expect(sup.restingUntil(items[1])).toBeLessThanOrEqual(Date.now());
  });

  it('interrupts again the moment she writes on the row', async () => {
    const items = [row('w-medium', 5), row('w-urgent', 9)];
    const sup = withFleet(items);
    sup.noteFreshRun(items[1]);
    sup.noteFreshRun(items[1]);
    sup.noteFreshRun(items[1]);

    // Her reply. This is the case that matters most, and it must not be the
    // one the guard above catches.
    items[1] = row('w-urgent', 9, { wrote: { answer: { ts: NOW + 20 * MIN, source: 'founder' } } });
    vi.setSystemTime(NOW + 21 * MIN);
    running(sup, 'w-medium');
    await sup.tick();
    expect(sup.killed).toEqual(['w-medium']);
  });
});

describe('what she sees while it sleeps', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  // The whole point, in the one measurement that matters: at the four hour
  // mark her Urgent row is running and, before this, was not.
  it('is picked up again a quarter of an hour later, not four hours later', async () => {
    const items = [row('w-urgent', 9)];
    const sup = makeSupervisor(items);
    for (let i = 0; i < 3; i += 1) sup.noteFreshRun(items[0]);

    vi.setSystemTime(NOW + 14 * MIN);
    await sup.tick();
    expect(took(sup, 'w-urgent')).toBe(0);

    vi.setSystemTime(NOW + 16 * MIN);
    await sup.tick();
    expect(took(sup, 'w-urgent')).toBe(1);
  });

  // A sleeping row is deliberately not advertised as queued, and that stays
  // true here. Fifteen minutes of not-queued is honest; four hours of it is
  // the row she watched do nothing all afternoon.
  it('still reads as resting rather than queued inside those fifteen minutes', () => {
    const items = [row('w-urgent', 9)];
    const sup = makeSupervisor(items);
    expect(sup.status().queued).toContain('w-urgent');
    for (let i = 0; i < 3; i += 1) sup.noteFreshRun(items[0]);
    expect(sup.status().queued).not.toContain('w-urgent');

    vi.setSystemTime(NOW + 16 * MIN);
    expect(sup.status().queued).toContain('w-urgent');
  });
});
