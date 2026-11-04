// A THREAD RESUMED WITH NO FREE AGENT READS QUEUED, AND KEEPS ITS PLACE.
//
// What broke (w-d08dcbb6fc, 2026-10-28): after a usage limit and a switch of
// account, the person selected stuck threads and pressed Resume. With every
// slot full, `resumeItems` puts a thread in its own line (`_resumeQueue`) and
// the toast says "waiting for a slot", but status().queued never read that
// line, so the row went on reading "Nothing running". Measured here: queued []
// straight after a resume that answered { queued: 1 }.
//
// And a resume whose start the door turned away (the Mac asleep, a folder
// still being made) had already deleted the thread's retry record, so a thread
// carrying the app's own limit note was never fresh work again.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const NOW = Date.now();
const HOUR = 3_600_000;

let items;
const store = () => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
  answerItem: (product, id, patch) => {
    const it = items.find((i) => i.id === id);
    if (it && patch.status) it.status = patch.status;
    return it;
  },
});

const hers = (id, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'], priority: 2,
  createdAt: NOW - 2 * HOUR, updatedAt: NOW - 2 * HOUR, claim: null, claimExpired: false,
  wrote: { title: { ts: NOW - 2 * HOUR, source: 'founder' } },
  ...extra,
});

const stoppedByALimit = (id) => hers(id, {
  result: 'Claude Code hit its usage limit partway through, so this task is not finished.',
  wrote: { title: { ts: NOW - 2 * HOUR, source: 'founder' }, result: { ts: NOW - 60_000, source: 'agent' } },
});

let sup; let spawned; let doorOpen;

const build = (rows, slots = 1) => {
  items = rows;
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    store(),
    '/nonexistent-app',
  );
  spawned = [];
  doorOpen = true;
  sup.spawnWorker = (item) => {
    if (!doorOpen) return;
    spawned.push(item.id);
    sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW, tail: [] });
  };
  sup._saveState = () => {};
  return sup;
};

const running = (id) => sup.sessions.set(id, { itemId: id, product: 'agentbox', startedAt: NOW, tail: [] });

beforeEach(() => { build([]); });

describe('resume with every agent busy', () => {
  it('says the thread is queued', () => {
    build([hers('w-busy', { priority: 9 }), stoppedByALimit('w-stuck')]);
    running('w-busy');
    expect(sup.resumeItems(['w-stuck'])).toMatchObject({ resumed: 0, queued: 1 });
    expect(sup.status().queued).toContain('w-stuck');
  });

  it('starts it once an agent is free', async () => {
    build([hers('w-busy', { priority: 9 }), stoppedByALimit('w-stuck')]);
    running('w-busy');
    sup.resumeItems(['w-stuck']);
    sup.sessions.delete('w-busy');
    items[0].status = 'done';
    await sup.tick();
    expect(spawned).toEqual(['w-stuck']);
  });

  // THE CASE THAT MUST NOT MATCH: a thread closed while it waited is not queued.
  it('drops a thread that was closed while it waited', () => {
    build([hers('w-busy', { priority: 9 }), stoppedByALimit('w-stuck')]);
    running('w-busy');
    sup.resumeItems(['w-stuck']);
    items[1].status = 'done';
    expect(sup.status().queued).not.toContain('w-stuck');
  });
});

describe('resume whose start was turned away at the door', () => {
  it('leaves a thread the limit stopped for the queue to start', async () => {
    build([stoppedByALimit('w-stuck')], 2);
    sup._fruitless['agentbox:w-stuck'] = { runs: 1, endedAt: NOW - 60_000, founderAt: NOW - 2 * HOUR, account: 'default', saidAt: NOW - 60_000, saidTs: NOW - 60_000 };
    doorOpen = false;
    sup.resumeItems(['w-stuck']);
    expect(spawned).toEqual([]);
    doorOpen = true;
    await sup.tick();
    expect(spawned).toEqual(['w-stuck']);
  });

  it('still ends the rest it was serving', () => {
    build([hers('w-rest')], 2);
    sup._fruitless['agentbox:w-rest'] = { runs: 3, endedAt: NOW, founderAt: NOW - 2 * HOUR };
    expect(sup.restingUntil(items[0])).toBeGreaterThan(NOW);
    doorOpen = false;
    sup.resumeItems(['w-rest']);
    expect(sup.restingUntil(items[0])).toBe(0);
  });
});
