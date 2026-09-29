// Resuming has to reach the rows that most need it: the finished ones.
//
// It had not been moved arbitrarily. A user asked for a status update on a
// live thread, a worker answered the question in `result` and wrote `done` in the same append,
// because `done` is the only terminal a worker has. The store now refuses that
// close (the app's holdOpenIfSheSpokeLast). This is the other half: the rows
// already closed that way, and every row a worker files for any other reason,
// have to be reachable.
//
// Nothing could reach them. Both the continuation pass and resumeStopped carry
// the same guard — `status !== 'open'` and out — so a done row was invisible to
// every path that spawns anything. The only cure was a new reply, which reopens
// the thread; the palette's own resume command could not see it.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk and not only what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity these tests are
// about. A home with nothing in it is the machine every one of them means.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';


const T = 1_786_000_000_000;

let sup;
let items;
let spawned;
let reopened;

const row = (id, over) => ({
  id, product: 'meadow', status: 'open', kind: 'question', title: id,
  wrote: {}, ...over,
});

beforeEach(() => {
  spawned = [];
  reopened = [];
  items = [
    // The real shape: agent-filed question, her reply, closed by the worker
    // that answered it.
    row('w-6ab3cc09b4', {
      status: 'done', answer: 'status?', result: 'Nothing is running.',
      wrote: { answer: { ts: T, source: 'founder' }, result: { ts: T - 1000, source: 'agent' } },
    }),
    // Closed with nothing outstanding: she can still put someone back on it.
    row('w-quiet', { status: 'done', result: 'Shipped.', wrote: { result: { ts: T, source: 'agent' } } }),
    // Working right now. Asking to resume this does nothing.
    row('w-live', { status: 'claimed' }),
  ];

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
  sup.sessions.set('w-live', { itemId: 'w-live' });
});

describe('resuming a row a worker already filed', () => {
  it('reopens a done row and puts a worker back on it', () => {
    const r = sup.resumeItems(['w-6ab3cc09b4']);

    expect(reopened).toEqual([{ id: 'w-6ab3cc09b4', status: 'open' }]);
    expect(spawned.map((s) => s.id)).toEqual(['w-6ab3cc09b4']);
    expect(r.resumed).toBe(1);
  });

  it('carries her unanswered reply, so the worker is briefed as a continuation', () => {
    sup.resumeItems(['w-6ab3cc09b4']);
    expect(spawned[0].continuation).toBe(true);
  });

  it('resumes a done row that carries no reply at all', () => {
    const r = sup.resumeItems(['w-quiet']);
    expect(r.resumed).toBe(1);
    expect(spawned.map((s) => s.id)).toEqual(['w-quiet']);
    expect(spawned[0].continuation).toBe(false);
  });

  it('outranks a delivery mark and the three-failure cap', () => {
    // The exact state that makes a row read "stopped" and stay that way: her
    // answer already marked delivered, and three workers already dead on it.
    const item = items[0];
    sup._handledAnswers.add(sup._answerKey(item, item.answer));
    sup._deliveryAttempts[sup._answerKey(item, item.answer)] = 3;

    const r = sup.resumeItems(['w-6ab3cc09b4']);

    expect(r.resumed).toBe(1);
    expect(spawned.map((s) => s.id)).toEqual(['w-6ab3cc09b4']);
    // The cap is gone, so the next failure is the first of three again.
    expect(sup._deliveryAttempts[sup._answerKey(item, item.answer)]).toBeUndefined();
    // The mark is back, because a spawn promises to carry the user's words. That is
    // the promise being re-made, not the old stale one still standing.
    expect(sup._answerDelivered(item, item.answer)).toBe(true);
  });

  it('does nothing to a row a worker is already on', () => {
    const r = sup.resumeItems(['w-live']);
    expect(spawned).toEqual([]);
    expect(reopened).toEqual([]);
    expect(r.resumed).toBe(0);
    expect(r.working).toBe(1);
  });

  it('touches only the ids it was given', () => {
    sup.resumeItems(['w-6ab3cc09b4']);
    expect(reopened.map((r) => r.id)).toEqual(['w-6ab3cc09b4']);
    expect(spawned.map((s) => s.id)).toEqual(['w-6ab3cc09b4']);
  });

  it('refuses an empty ask rather than resuming the whole ledger', () => {
    expect(sup.resumeItems([]).resumed).toBe(0);
    expect(sup.resumeItems(null).resumed).toBe(0);
    expect(spawned).toEqual([]);
  });
});

describe('more rows than slots', () => {
  it('starts what fits and queues the rest, rather than dropping them', () => {
    // One slot is already taken by w-live, so a two-row resume fits one.
    const r = sup.resumeItems(['w-6ab3cc09b4', 'w-quiet']);

    expect(r.resumed).toBe(1);
    expect(r.queued).toBe(1);
    // Both are open: the queued one is not left looking finished.
    expect(items.find((i) => i.id === 'w-quiet').status).toBe('open');
  });

  it('drains the queue on a later tick, when a slot frees', async () => {
    sup.resumeItems(['w-6ab3cc09b4', 'w-quiet']);
    const waiting = [...sup._resumeQueue];
    expect(waiting.length).toBe(1);

    // The session that held the slot exits.
    sup.sessions.delete('w-live');
    sup.sessions.delete(waiting[0] === 'w-quiet' ? 'w-6ab3cc09b4' : 'w-quiet');
    spawned = [];
    await sup.tick();

    expect(spawned.map((s) => s.id)).toContain(waiting[0]);
    expect(sup._resumeQueue.size).toBe(0);
  });
});
