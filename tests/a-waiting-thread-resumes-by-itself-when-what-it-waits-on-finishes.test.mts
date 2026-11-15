// A WAITING THREAD RESUMES BY ITSELF WHEN WHAT IT WAITS ON FINISHES
// (w-5244c90c33).
//
// What broke, 2026-10-11: Hermes and the launch video sat "waiting" for days,
// and when the thread a wait named finished, nothing put a worker back on the
// one waiting: a blocked row is invisible to every spawn pass, so it came back
// to Needs you for a person to restart by hand. Their words: "something that's
// waiting should be logically in the backlog and then it should automatically
// resume without the user needing to know otherwise."
//
// So each tick asks one thing of every blocked row with a `blockedBy`: has
// every thread it names finished, and did the last of them finish after the
// wait was written? If so it is reopened and queued for a worker, once.
//
// What must NOT resume: a wait with one blocker still open, a blocker this Mac
// cannot see, a wait whose blockers had all finished before this rule existed
// (the store held 7 of those, and resuming them on the first tick after a ship
// would start 7 workers nobody asked for), a row she stopped, and the same
// finish twice.
import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const T = 1_786_000_000_000;

let sup;
let items;
let spawned;
let reopened;

const row = (id, over = {}) => ({ id, product: 'p', status: 'open', kind: 'task', title: id, wrote: {}, ...over });
const finished = (id, at) => row(id, { status: 'done', wrote: { status: { ts: at, source: 'agent' } } });
const waiting = (id, blockedBy, over = {}) => row(id, {
  status: 'blocked', blockedBy,
  wrote: { status: { ts: T, source: 'agent' }, blockedBy: { ts: T, source: 'agent' } },
  ...over,
});

beforeEach(() => {
  spawned = [];
  reopened = [];
  items = [];
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 2, authProfiles: ['default'] },
    {
      listItems: () => items,
      listProducts: () => [],
      isDue: () => true,
      answerItem: (product, id, patch) => {
        reopened.push({ id, ...patch });
        const item = items.find((i) => i.id === id);
        if (item && patch.status) item.status = patch.status;
        return item;
      },
    },
    '/nonexistent-app',
  );
  sup.spawnWorker = (item, opts) => { spawned.push({ id: item.id, ...opts }); sup.sessions.set(item.id, {}); };
  // The rule started before any of these waits were written.
  sup._waitsSince = T - 1;
});

describe('the wait clears', () => {
  it('reopens the thread and queues a worker when its only blocker finishes', () => {
    items = [finished('w-engine', T + 1000), waiting('w-hermes', ['w-engine'])];
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-hermes']);
    expect(reopened).toEqual([{ id: 'w-hermes', status: 'open' }]);
    expect(sup._resumeQueue.has('w-hermes')).toBe(true);
  });

  it('waits for the last of several blockers', () => {
    items = [finished('w-engine', T + 1000), row('w-opencode'), waiting('w-hermes', ['w-engine', 'w-opencode'])];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
    items[1] = finished('w-opencode', T + 2000);
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-hermes']);
  });

  it('resumes a chain one link at a time, as each finishes', () => {
    items = [finished('w-opencode', T + 1000), waiting('w-hermes', ['w-opencode']), waiting('w-video', ['w-hermes'])];
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-hermes']);
    items[1] = { ...items[1], status: 'done', wrote: { ...items[1].wrote, status: { ts: T + 5000, source: 'agent' } } };
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-video']);
  });

  it('runs off the tick, through the same queue a resume by name uses', async () => {
    items = [finished('w-engine', T + 1000), waiting('w-hermes', ['w-engine'])];
    sup.serveRepeats = async () => {};
    sup.parkOnATimer = () => {};
    sup.shipQueue = { tick: () => {} };
    await sup._tick();
    expect(spawned.map((s) => s.id)).toContain('w-hermes');
  });
});

describe('what must not resume', () => {
  it('a wait with a blocker still open', () => {
    items = [row('w-opencode'), waiting('w-hermes', ['w-opencode'])];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });

  it('a wait naming a thread this Mac cannot see', () => {
    items = [finished('w-engine', T + 1000), waiting('w-hermes', ['w-engine', 'w-gone'])];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });

  it('a wait whose blockers finished before the wait was written', () => {
    items = [finished('w-engine', T - 5000), waiting('w-hermes', ['w-engine'])];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });

  it('a wait that cleared before this rule existed', () => {
    sup._waitsSince = T + 10_000;
    items = [finished('w-engine', T + 1000), waiting('w-hermes', ['w-engine'])];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });

  it('a row she stopped', () => {
    items = [finished('w-engine', T + 1000), waiting('w-hermes', ['w-engine'], {
      wrote: { status: { ts: T + 2000, source: 'founder' }, blockedBy: { ts: T, source: 'agent' } },
    })];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });

  it('a row that is not blocked, or names no blocker', () => {
    items = [finished('w-engine', T + 1000), row('w-open', { blockedBy: ['w-engine'] }), waiting('w-none', [])];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });

  it('the same finish twice, even if a worker put the row back to blocked', () => {
    items = [finished('w-engine', T + 1000), waiting('w-hermes', ['w-engine'])];
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-hermes']);
    items[1].status = 'blocked';
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });
});
