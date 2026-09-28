// AN ANSWER THE AGENT HAS FINISHED ACTING ON IS NEWS, NOT A STOPPED AGENT.
//
// Both halves of that were one state. A worker finishes acting on her answer
// and leaves the row exactly as it found it: `open`, with her answer still on
// it, because the thread is alive and closing it is wrong ( was filed on a
// one-word status question with a whole workstream inside it). There was
// nothing anywhere saying the answer had been DEALT WITH. Only
// `_handledAnswers`, in supervisor memory, which the renderer cannot see and
// which every "Resume interrupted agents" wipes.
//
// So one set of rows read three wrong ways at once:
//
//   1. belongsInInbox treats an open row carrying a live answer as the agent's
//      again, so the finished result never reached her. Eleven of her twelve
//      rows had a result written AFTER her answer; the titles were the reports.
//   2. supervisor.status.stalled is the same predicate, so every one of them
//      printed "stopped".
//   3. Resuming them (the only thing the UI offered) cleared the delivery mark
//      and spawned a worker on an answer from two days ago. It read the row,
//      found nothing to do, and exited inside a minute. had 23 sessions on the
//      same stale word, every one of them "success", every one a no-op. One of
//      them said so: "That is the ninth session to be spawned on this same
//      stale word."
//
// The missing fact is now written on the ITEM, where every reader can see it
// and no resume can wipe it: `answeredThrough`, the ts of the answer a session
// finished acting on. Her next answer carries a later ts, so the row goes live
// again on its own.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { answerSettled } from '../shared/answers.mjs';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules';

const T = 1_786_410_863_019; // when she answered w-417ee07635, 2026-08-10

// as the fold hands it over: her ask, her answer, the agent's result written
// after it, and the row still open because the thread is alive.
const settled = {
  id: 'w-417ee07635', product: 'meadow', status: 'open', kind: 'directive',
  labels: ['founder'], priority: 3,
  title: 'The greave matches your painting and you have picked the shine.',
  answer: "Yeah these don't look bad. My only issue is that it's really missing a metallic",
  result: 'The dial is metal now and the page is published.',
  answeredThrough: T,
  createdAt: T - 90_000_000, updatedAt: T + 650_000,
  wrote: { answer: { ts: T, source: 'founder' }, result: { ts: T + 650_000, source: 'agent' } },
};

// The same row before any worker got to her answer: still owed to a worker.
const owed = { ...settled, answeredThrough: undefined, result: undefined };

// She has spoken again since. A later answer outranks the settlement.
const answeredAgain = {
  ...settled,
  answer: 'still not fixed, he is the same colour as his clothes',
  wrote: { ...settled.wrote, answer: { ts: T + 2_000_000, source: 'founder' } },
};

describe('the fact itself', () => {
  it('is settled only when the settlement covers the answer on the row', () => {
    expect(answerSettled(settled)).toBe(true);
    expect(answerSettled(owed)).toBe(false);
    expect(answerSettled(answeredAgain)).toBe(false);
  });

  it('is never true of a row with no answer, or a withdrawn one', () => {
    expect(answerSettled({ ...settled, answer: undefined })).toBe(false);
    expect(answerSettled({ ...settled, answer: '(withdrawn)' })).toBe(false);
  });
});

describe('where the row goes', () => {
  it('reaches her inbox once the agent has finished acting on her answer', () => {
    expect(belongsInInbox(settled)).toBe(true);
  });

  it('is not in two tabs at once: In progress is a promise a worker is coming', () => {
    expect(belongsInProgress(settled)).toBe(false);
    expect(belongsInProgress(owed)).toBe(true);
  });

  it('goes back to the agent the moment she answers again', () => {
    expect(belongsInInbox(answeredAgain)).toBe(false);
    expect(belongsInProgress(answeredAgain)).toBe(true);
  });

  it('leaves a row a worker is on right now alone', () => {
    const claimed = { ...settled, status: 'claimed' };
    expect(belongsInProgress(claimed)).toBe(true);
    expect(belongsInInbox(claimed)).toBe(false);
  });

  it('still keeps an answer nobody has acted on out of her inbox', () => {
    expect(belongsInInbox(owed)).toBe(false);
  });
});

/* ------------------------------ the supervisor --------------------------- */

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
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
beforeEach(() => { build([]); });

describe('what the supervisor says about it', () => {
  it('does not call a settled row stopped', () => {
    build([settled]);
    sup._handledAnswers.add(sup._answerKey(settled));
    expect(sup.status().stalled).not.toContain(settled.id);
  });

  it('still calls a genuinely stranded row stopped', () => {
    build([owed]);
    sup._handledAnswers.add(sup._answerKey(owed));
    expect(sup.status().stalled).toContain(owed.id);
  });

  it('does not advertise a settled row as queued either', () => {
    build([settled]);
    expect(sup.status().queued).not.toContain(settled.id);
  });

  it('writes the settlement down when a session finishes on her answer', () => {
    build([settled]);
    const session = { result: 'done, the dial is metal', resultIsError: false, child: { kill() {} } };
    expect(sup.settleDelivery(owed, owed.answer, session, null)).toBe('delivered');
    expect(sup.store.settled).toEqual([['meadow', 'w-417ee07635', T]]);
  });

  it('writes nothing down when the session did not finish', () => {
    build([owed]);
    const session = { result: null, resultIsError: false, child: { kill() {} } };
    sup.settleDelivery(owed, owed.answer, session, null);
    expect(sup.store.settled).toEqual([]);
  });

  it('does not spend her plan respawning a worker on a settled answer', async () => {
    build([settled]);
    const spawned = [];
    sup.spawnWorker = (item) => spawned.push(item.id);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('resume-everything leaves settled rows alone, and says so honestly', () => {
    build([settled]);
    sup._handledAnswers.add(sup._answerKey(settled));
    expect(sup.resumeStopped()).toBe(0);
    expect(sup._answerDelivered(settled)).toBe(true);
  });

  it('but her naming a row by hand still puts a worker back on it', () => {
    build([settled]);
    const spawned = [];
    sup.spawnWorker = (item) => spawned.push(item.id);
    sup.resumeItems([settled.id]);
    expect(spawned).toEqual([settled.id]);
  });
});
