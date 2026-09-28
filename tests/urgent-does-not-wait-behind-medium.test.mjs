// AN URGENT TASK OUTRANKS A MEDIUM ANSWER. IT USED TO OUTRANK NOTHING.
//
// Measured from her own store rather than reconstructed:
//   22:43:58  she files, the landing page, Urgent (9)
//   22:44:21  a Medium continuation takes a slot
//   ...       35 more sessions start on agentbox, EVERY ONE a continuation,
// 20 of them Medium
//   22:55:01  she files this complaint
//   00:09:36  her Urgent row finally spawns, 85 minutes and 38 seconds later,
// in the same second as the only other fresh row of the night
//
// The cause was structural and had nothing to do with the cap. The tick ran
// two passes: EVERY eligible continuation, then fresh work with whatever slots
// were left. Priority only competed inside a pass, so no fresh item of any
// priority could beat any continuation of any priority. Not one fresh item
// spawned in those 85 minutes; two spawned in the same second once the answer
// backlog ran dry, which is the signature of starvation rather than load.
//
// The freed slot went to the next answer in line, because the answers were a
// queue in front of hers rather than beside it.
//
// One queue now, one score. Continuations still win a TIE, which is the old
// intent (an answer she has already given beats new work of equal standing)
// without letting it outrank her own tag.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk and not only what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity these tests are
// about. A home with nothing in it is the machine every one of them means.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';


const NOW = 1_787_179_438_178; // 2026-08-19 22:43:58.178, the moment she filed it

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

// Her own task: the 'founder' label is what compose stamps, and it is what
// makes a row fresh work rather than a proposal waiting on her.
const hers = (id, priority, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  priority, answer: undefined, createdAt: NOW, updatedAt: NOW,
  claim: null, claimExpired: false, ...extra,
});

// A card she has answered. The answer is the continuation's whole reason to run.
const answered = (id, priority, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'question', labels: ['landing'],
  priority, answer: 'approved', createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
  claim: null, claimExpired: false,
  wrote: { answer: { ts: NOW - 60_000, source: 'founder' } },
  ...extra,
});

let sup; let spawned;
const build = (items, slots = 1) => {
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  spawned = [];
  sup.spawnWorker = (item) => { spawned.push(item.id); sup.sessions.set(item.id, { itemId: item.id }); };
  return sup;
};

beforeEach(() => { build([]); });

describe('her urgent task against a lower-priority answer', () => {
  // The regression, at the smallest size that shows it: one free slot, one
  // Medium answer, one Urgent task of hers. This is the stopped-a-task case.
  it('takes the urgent task first when only one slot is free', async () => {
    build([answered('w-medium-answer', 5), hers('w-4434b189ef', 9)], 1);
    await sup.tick();
    expect(spawned).toEqual(['w-4434b189ef']);
  });

  // Her real evening, at the real cap: her Urgent row must be in the first
  // wave, not behind ten answers.
  it('does not let a wall of medium answers bury it', async () => {
    const wall = Array.from({ length: 10 }, (_, n) => answered(`w-ans-${n}`, 5));
    build([...wall, hers('w-4434b189ef', 9)], 6);
    await sup.tick();
    expect(spawned[0]).toBe('w-4434b189ef');
  });

  // The other half of "one queue": high answers still beat low fresh work.
  // This is not "fresh work wins", it is "the number she picked wins".
  it('still takes an urgent answer ahead of a low task', async () => {
    build([hers('w-low-task', 2), answered('w-urgent-answer', 9)], 1);
    await sup.tick();
    expect(spawned).toEqual(['w-urgent-answer']);
  });

  // What survives of the old rule. Continuations went first for a reason and
  // that reason is intact wherever priority does not separate them.
  it('gives a tie to the answer, as it always did', async () => {
    build([hers('w-her-task', 5), answered('w-her-answer', 5)], 1);
    await sup.tick();
    expect(spawned).toEqual(['w-her-answer']);
  });

  // Priority is a real number and not two buckets: every step has to sort.
  it('orders the whole queue by the number, not by which kind it is', async () => {
    build([
      answered('w-a5', 5), hers('w-t7', 7), answered('w-a9', 9), hers('w-t2', 2), answered('w-a7', 7),
    ], 9);
    await sup.tick();
    // 9, then the two 7s with the answer winning the tie, then 5, then 2.
    expect(spawned).toEqual(['w-a9', 'w-a7', 'w-t7', 'w-a5', 'w-t2']);
  });

  // The cap was never the bug and must not become one: it still holds.
  it('never puts more workers up than the cap allows', async () => {
    const many = Array.from({ length: 20 }, (_, n) => answered(`w-ans-${n}`, 5));
    build([...many, hers('w-4434b189ef', 9)], 3);
    await sup.tick();
    expect(spawned.length).toBe(3);
    expect(spawned[0]).toBe('w-4434b189ef');
  });

  // Nothing starves inside a tie either: oldest first, which is what stops a
  // freshly-touched row from cutting in front of one that has waited all night.
  it('breaks a tie between two of her tasks by which she filed first', async () => {
    build([
      hers('w-later', 5, { createdAt: NOW + 5_000 }),
      hers('w-earlier', 5, { createdAt: NOW - 5_000 }),
    ], 2);
    await sup.tick();
    expect(spawned).toEqual(['w-earlier', 'w-later']);
  });
});

// The filters that decide what may spawn AT ALL are unchanged by the merge.
// They were spread across two passes and are now one predicate each, which is
// exactly the kind of move that quietly lets a proposal auto-run.
describe('what one queue may still never spawn', () => {
  it('leaves an agent-filed question waiting for her, however urgent it is', async () => {
    build([{ ...answered('w-proposal', 9), answer: undefined, labels: ['landing'] }], 3);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('leaves an agent-filed review waiting for her too', async () => {
    build([{ ...hers('w-review', 9), kind: 'review', labels: [] }], 3);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('reads a withdrawn reply as a cancel, not an answer', async () => {
    build([answered('w-withdrawn', 9, { answer: '(withdrawn)' })], 3);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // A paused PROJECT was a case here until that feature was deleted
  // (w-d19d6d387c, 2026-09-22). Pausing the fleet still stops everything.

  it('leaves a row alone while its moment has not come', async () => {
    const items = [hers('w-later', 9)];
    build(items, 3);
    sup.store.isDue = () => false;
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('does not hand a resting row straight to another worker', async () => {
    build([hers('w-rested', 9)], 3);
    sup.restingUntil = () => Date.now() + 60_000;
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('does not spawn twice on a row it is already running', async () => {
    build([hers('w-running', 9)], 3);
    sup.sessions.set('w-running', { itemId: 'w-running' });
    await sup.tick();
    expect(spawned).toEqual([]);
  });
});
