// SHE TYPED WHILE THE AGENT WAS WORKING, AND THE FINISHED ROUND NEVER CAME BACK.
//
// Reported on w-72aa8c0b8d with two photographs of it: a row reading "stopped"
// whose result was written, complete, with its options under it. It never
// reached the inbox, and it was found only by going and looking for it.
//
// What happened, replayed off her own ledger. A reply typed at a session that
// is RUNNING is steered straight into it (live-replies.mjs) and marked
// delivered on the spot. The worker reads it, acts on it, writes its result and
// exits. The exit path then writes down which answer was settled, and the item
// it holds is the snapshot taken at SPAWN, so it wrote down the answer BEFORE
// the one she had just been answered on.
//
// `answerSettled` reads the row as still owing her a worker: out of the inbox,
// "stopped" on the row, and nothing coming, because the word it is waiting on
// is already marked delivered and no continuation will ever be spawned for it.
//
// Measured on real ledgers: 62 of 1,841 settlements ever written recorded an
// older answer than the newest one on the row at that moment, across 39 rows.
// One row did it three rounds running in a single evening.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { answerSettled } from '../shared/answers.mjs';
import { belongsInInbox } from '../renderer/src/list-rules';

const SPAWNED = 1_790_131_152_960; // she answered at 19:39:12
const TYPED = 1_790_131_203_784;   // and again at 19:40:03, into the running session
const RESULT = 1_790_131_696_000;  // the worker wrote the round at 19:48:16

// The row at spawn: the session is started to carry her 19:39 words.
const atSpawn = {
  id: 'w-fc98f80e52', product: 'astral', status: 'open', kind: 'directive',
  labels: ['founder'], priority: 2,
  title: 'Launch video shots and cursor',
  answer: 'When I said exploring different shapes, I meant all of them',
  createdAt: SPAWNED - 5_000_000, updatedAt: SPAWNED,
  wrote: { answer: { ts: SPAWNED, source: 'founder' } },
};

// Her next words, steered into that same running session.
const liveReply = {
  ...atSpawn,
  answer: 'We also need shots for everything on the page',
  wrote: { answer: { ts: TYPED, source: 'founder' } },
};

// And the row as the worker left it: the round written, the thread alive.
const asLeft = {
  ...liveReply,
  result: 'Ten launch video shots are redrawn, pick a cursor colourway.',
  updatedAt: RESULT,
  wrote: { answer: { ts: TYPED, source: 'founder' }, result: { ts: RESULT, source: 'agent' } },
};

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  readItem: (_slug, id) => items.find((i) => i.id === id),
  isDue: () => true,
  settled: [],
  settleAnswer(slug, id, ts) { this.settled.push([slug, id, ts]); },
});

let sup;
const build = (items) => {
  sup = new Supervisor(
    { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  return sup;
};

const finishedRun = () => ({ result: 'the round is on the row', resultIsError: false, lastLiveReply: liveReply });

beforeEach(() => { build([asLeft]); });

describe('the answer a session really carried', () => {
  it('is the last word steered into it, not the one it was spawned for', () => {
    expect(sup.carriedThrough(atSpawn, finishedRun())).toBe(TYPED);
  });

  it('is the spawn answer when she never typed into the run', () => {
    expect(sup.carriedThrough(atSpawn, { result: 'done', resultIsError: false })).toBe(SPAWNED);
  });
});

describe('a continuation she replied into', () => {
  it('settles the words she actually got answered on', () => {
    expect(sup.settleDelivery(atSpawn, atSpawn.answer, finishedRun(), null)).toBe('delivered');
    expect(sup.store.settled).toEqual([['astral', 'w-fc98f80e52', TYPED]]);
  });

  it('puts the finished round in her inbox, where she was losing it', () => {
    sup.settleDelivery(atSpawn, atSpawn.answer, finishedRun(), null);
    const [, , ts] = sup.store.settled[0];
    const row = { ...asLeft, answeredThrough: ts };
    expect(answerSettled(row)).toBe(true);
    expect(belongsInInbox(row)).toBe(true);
  });

  it('hands her words back to the queue when the run died holding them', () => {
    const died = { result: null, resultIsError: false, lastLiveReply: liveReply };
    sup._handledAnswers.add(sup._answerKey(liveReply));
    sup.settleDelivery(atSpawn, atSpawn.answer, died, null);
    expect(sup.store.settled).toEqual([]);
    expect(sup._answerDelivered(liveReply)).toBe(false);
  });
});

describe('a reply typed into ordinary fresh work', () => {
  // No answer was on the row when this session started, so nothing on the exit
  // path ever wrote a settlement down at all.
  const fresh = { ...atSpawn, answer: undefined, wrote: {} };

  it('is settled by the run that answered it', () => {
    expect(sup.settleLiveReply(fresh, finishedRun())).toBe('delivered');
    expect(sup.store.settled).toEqual([['astral', 'w-fc98f80e52', TYPED]]);
  });

  it('goes back in the queue when the run said nothing after it', () => {
    build([{ ...asLeft, wrote: { answer: { ts: TYPED, source: 'founder' }, result: { ts: TYPED - 1000, source: 'agent' } } }]);
    sup._handledAnswers.add(sup._answerKey(liveReply));
    expect(sup.settleLiveReply(fresh, finishedRun())).toBe('undelivered');
    expect(sup.store.settled).toEqual([]);
    expect(sup._answerDelivered(liveReply)).toBe(false);
  });

  it('is nothing to settle on a run she never typed into', () => {
    expect(sup.settleLiveReply(fresh, { result: 'done', resultIsError: false })).toBe('nothing to settle');
    expect(sup.store.settled).toEqual([]);
  });
});
