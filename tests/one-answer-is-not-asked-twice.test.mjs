// A ROW THAT ALREADY ANSWERED HER IS NOT PICKED UP AND ANSWERED AGAIN.
//
// Half of that is drawn: two messages on one row, folded by item-thread.ts.
// This is the other half, which is that the second message should never have
// been written. A worker that finishes an ask and leaves the row OPEN, so she
// can still reply on it, leaves a row that `isFresh` still counts as work
// nobody has done. The rest ladder delays the next worker and does not stop
// it, and any word from her resets the ladder to its first rung, so the loop
// runs for as long as she takes to answer.
//
// Measured on her Agentbox store the day this landed:
//   266 results written with no reply from her since the previous result
//   119 rows carrying at least one of them
//   107 opening on a bold line character-identical to the one above it
//     5 rows in the loop at that moment, three already three answers deep
//
// The row this test is for was one of the five: results at 15:02, 16:03 and a
// third session claiming at 16:19, and she had not replied once.
//
// The rule is the one the file already states for agent-filed proposals, read
// from the other end. A finished answer on an open row IS a proposal waiting
// on her, whoever labelled the row. She loses nothing by the wait: rowSummary
// shows a result newer than the body on an open row, so it is in her inbox
// being read.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor, awaitingHer } from '../main/supervisor.mjs';

const NOW = 1_788_218_369_484; // 2026-08-31 16:19:29, the third claim on w-d3056d8467

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

// Her own row: the 'founder' label is what makes it fresh work at all.
const hers = (id, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  priority: 7, answer: undefined, createdAt: NOW - 3_600_000, updatedAt: NOW,
  claim: null, claimExpired: false,
  wrote: { body: { ts: NOW - 3_600_000, source: 'founder' } },
  ...extra,
});

// The same row after a worker has finished and left it open for her reply.
const answeredByUs = (id, at = NOW - 60_000) => hers(id, {
  result: '**Merge the repeat fix, or keep both copies when the second says more.**',
  wrote: {
    body: { ts: NOW - 3_600_000, source: 'founder' },
    result: { ts: at, source: 'agent' },
  },
});

let sup; let spawned;
const build = (items, slots = 2) => {
  sup = new Supervisor(
    { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  spawned = [];
  sup.spawnWorker = (item) => { spawned.push(item.id); sup.sessions.set(item.id, { itemId: item.id }); };
  return sup;
};

beforeEach(() => { build([]); });

describe('a row already holding an answer for her', () => {
  it('is not handed to another worker', async () => {
    build([answeredByUs('w-d3056d8467')]);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('is picked up when no answer has been written yet', async () => {
    build([hers('w-d3056d8467')]);
    await sup.tick();
    expect(spawned).toEqual(['w-d3056d8467']);
  });

  // The wait ends on HER, not on a clock. This is what keeps the rule from
  // stranding anything: one word from her and the row is ordinary work again.
  it('is fresh again the moment she writes to it', async () => {
    const row = answeredByUs('w-d3056d8467');
    row.wrote.answer = { ts: NOW, source: 'founder' };
    build([row]);
    await sup.tick();
    expect(spawned).toEqual(['w-d3056d8467']);
  });

  // A row she answered a MINUTE before our result is still waiting on her: the
  // watermark is which came last, not whether she ever spoke.
  it('stays put when her word came before the answer', async () => {
    const row = answeredByUs('w-d3056d8467');
    row.wrote.answer = { ts: NOW - 120_000, source: 'founder' };
    build([row]);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // Only a finished word holds the row. A checkpoint is a worker saying where
  // it got to, and a run that checkpointed and then died has left real work
  // undone; reading that as an answer would strand the row for good.
  it('does not count a checkpoint as an answer', async () => {
    const row = hers('w-d3056d8467');
    row.note = 'Reading the thread code now.';
    row.wrote.note = { ts: NOW - 60_000, source: 'agent' };
    build([row]);
    await sup.tick();
    expect(spawned).toEqual(['w-d3056d8467']);
  });
});

describe('awaitingHer, on its own', () => {
  it('is false for a row nobody has answered', () => {
    expect(awaitingHer(hers('w-1'))).toBe(false);
  });

  it('is false for a result the founder wrote herself', () => {
    const row = hers('w-1');
    row.wrote.result = { ts: NOW, source: 'founder' };
    expect(awaitingHer(row)).toBe(false);
  });

  it('is true for an agent result newer than anything of hers', () => {
    expect(awaitingHer(answeredByUs('w-1'))).toBe(true);
  });

  it('survives a row with no wrote map at all', () => {
    expect(awaitingHer({ id: 'w-1' })).toBe(false);
    expect(awaitingHer(undefined)).toBe(false);
  });
});
