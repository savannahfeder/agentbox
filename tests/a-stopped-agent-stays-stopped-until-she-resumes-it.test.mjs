// A STOPPED AGENT STAYS STOPPED UNTIL SHE RESUMES IT.
//
// Stop is a promise: the run ends, the row goes to her inbox, and nothing
// happens on it again until she replies, resumes it or sends it back to the
// queue. Measured on her own ledger and session logs, 2026-10-01, the promise
// was broken on the very next tick:
//
//   07:41:41  she replies to a running agent (the reply is steered into it)
//   07:43:25  she presses stop: the run is killed, the row is written blocked
//   07:43:34  the run exits (143)
//   07:43:44  a NEW run starts on the same row, "continuation (the founder
//             answered)", carrying the 07:41:41 reply. The row is still
//             blocked, so it sits in her inbox while an agent works on it.
//   07:44:47  she presses stop again.
//
// Why: a kill of ours hands the reply it was carrying back to the queue
// (settleDelivery, 'interrupted'), which is right for an app restart and wrong
// for her stop. And the queue counts a blocked row with an unhandled reply as
// a continuation, because her reply to a parked row is meant to wake it. Her
// OLD reply, from before she stopped it, is not that reply.
//
// So a row she stopped is not a continuation until she speaks after the stop.
// A row an agent parked is untouched: her reply there is still the thing that
// wakes it.

import { describe, it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { stoppedByHer } from '../shared/answers.mjs';

const REPLIED = 1_790_865_701_000; // 07:41:41, the reply steered into the run
const STOPPED = 1_790_865_805_983; // 07:43:25, her stop

// The row as the fold held it after the stop: blocked, written by her, her
// reply on it from before.
const stopped = {
  id: 'w-e731ca9376', product: 'astral', status: 'blocked', kind: 'task',
  labels: ['founder'], answer: 'where is the preview link',
  updatedAt: STOPPED, claim: null, claimExpired: false,
  wrote: {
    answer: { ts: REPLIED, source: 'founder' },
    status: { ts: STOPPED, source: 'founder' },
  },
};

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

const build = (items) => {
  const sup = new Supervisor(
    { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  const spawned = [];
  sup.spawnWorker = (item) => spawned.push(item.id);
  return { sup, spawned };
};

describe('a stopped agent stays stopped', () => {
  it('does not start again on the reply she sent before she stopped it', async () => {
    const { sup, spawned } = build([stopped]);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('does not start again after the kill hands that reply back to the queue', async () => {
    // Her exact sequence: the run is carrying the reply, she stops it, the exit
    // settles the delivery as interrupted, and the next tick runs.
    const running = { ...stopped, status: 'claimed', wrote: { ...stopped.wrote, status: { ts: REPLIED, source: 'agent' } } };
    const { sup, spawned } = build([stopped]);
    const session = { child: { kill() {} }, itemId: stopped.id, product: stopped.product, result: null, tail: [] };
    sup.sessions.set(stopped.id, session);
    sup._handledAnswers.add(sup._answerKey(running));
    sup.stopSession(stopped.id);
    sup.settleDelivery(running, running.answer, session, null);
    sup.sessions.delete(stopped.id);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('starts when she replies after the stop', async () => {
    // A reply also writes the row open, which is the ordinary case.
    const replied = {
      ...stopped, status: 'open', answer: 'hello',
      wrote: { answer: { ts: STOPPED + 30_000, source: 'founder' }, status: { ts: STOPPED + 30_000, source: 'founder' } },
    };
    const { sup, spawned } = build([replied]);
    await sup.tick();
    expect(spawned).toEqual([stopped.id]);
  });

  it('starts on a reply newer than the stop even if the row still reads blocked', async () => {
    const newer = { ...stopped, answer: 'carry on', wrote: { ...stopped.wrote, answer: { ts: STOPPED + 1, source: 'founder' } } };
    const { sup, spawned } = build([newer]);
    await sup.tick();
    expect(spawned).toEqual([stopped.id]);
  });

  it('starts when she sends it back to the queue', async () => {
    const reopened = { ...stopped, status: 'open', wrote: { ...stopped.wrote, status: { ts: STOPPED + 5_000, source: 'founder' } } };
    const { sup, spawned } = build([reopened]);
    await sup.tick();
    expect(spawned).toEqual([stopped.id]);
  });

  it('still wakes a row an agent parked when her reply is waiting on it', async () => {
    // The case that must NOT match: an agent blocked the row, she answered.
    const parked = { ...stopped, wrote: { answer: { ts: STOPPED + 1, source: 'founder' }, status: { ts: STOPPED, source: 'agent' } } };
    const { sup, spawned } = build([parked]);
    await sup.tick();
    expect(spawned).toEqual([stopped.id]);
  });
});

describe('stoppedByHer', () => {
  it('is her stop with nothing said since', () => {
    expect(stoppedByHer(stopped)).toBe(true);
  });

  it('holds when the reply and the stop share a moment', () => {
    expect(stoppedByHer({ ...stopped, wrote: { ...stopped.wrote, answer: { ts: STOPPED, source: 'founder' } } })).toBe(true);
  });

  it('ends the moment she speaks after it', () => {
    expect(stoppedByHer({ ...stopped, wrote: { ...stopped.wrote, answer: { ts: STOPPED + 1, source: 'founder' } } })).toBe(false);
  });

  it('is never a row an agent blocked', () => {
    expect(stoppedByHer({ ...stopped, wrote: { ...stopped.wrote, status: { ts: STOPPED, source: 'agent' } } })).toBe(false);
  });

  it('is never a row that is not blocked', () => {
    expect(stoppedByHer({ ...stopped, status: 'open' })).toBe(false);
    expect(stoppedByHer({ ...stopped, status: 'done' })).toBe(false);
  });
});
