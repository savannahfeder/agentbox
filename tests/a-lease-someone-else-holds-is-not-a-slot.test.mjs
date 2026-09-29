// HER ANSWER MUST NOT BE SPENT ON A ROW THAT WILL REFUSE THE SESSION.
//
// Agentbox, measured from the ledger and the session logs rather than
// reconstructed:
//   12:35:43  the working session writes its result
//   12:36:25  it exits WITHOUT releasing the row; its lease runs to 12:40:04
//   12:36:22  an answer lands on the row
//   12:36:26  the tick spawns the continuation to carry that word, and marks
// the answer handled AT SPAWN. That is one spawn per answer, spent.
//   12:36:44  the continuation calls claim_work_item and is REFUSED: the dead
// session's lease is still live for another three and a half
// minutes. Verbatim: "Claim refused - already held by another
// session (mcp-72466). Ending without touching the branch or the
// item, per protocol."
//   12:36:47  it exits, having written nothing at all.
//
// The row then sat carrying her answer with nobody coming, and it would have
// sat there forever: the mark stays in `_handledAnswers`, so no later tick
// looks at that answer again. Nothing on screen said so.
//
// A lease is not the row's fault and it is not permanent. The tick can simply
// WAIT: leave the mark unwritten, spawn nothing, and take the row on a later
// pass once the lease has lapsed. Fifteen seconds a pass, and the answer lands
// three minutes late instead of never.
//
// Why the retry counter is not the answer to this. A refused session exits in
// about twenty seconds, which is inside FAST_EXIT_MS, so it also trips the
// fleet-wide spawn cooldown: 60s, then 120s. Three attempts against this lease
// would have fallen at 12:36:47, 12:37:47 and 12:39:47, ALL of them inside a
// lease that ran to 12:40:04. The answer is given up on, three sessions are
// burnt, and every other product's spawns are stalled behind the cooldown.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

const ANSWERED = 1_786_822_582_584; // 2026-08-15 12:36:22.584, "merge it"
const LEASE_UNTIL = 1_786_822_804_409; // 12:40:04.409, the dead session's lease
const NOW = 1_786_822_586_015; // 12:36:26.015, the tick that spawned into it

// The row exactly as the fold held it at 12:36:26: open (she wrote that when
// she answered), her answer on it, and a claim whose holder is already dead but
// whose lease has not lapsed.
const held = {
  id: 'w-01666ceb2c', product: 'agentbox', status: 'open', kind: 'question',
  answer: 'merge it', updatedAt: ANSWERED,
  claim: { holder: 'mcp-72466', leaseUntil: LEASE_UNTIL },
  claimExpired: false,
  wrote: {
    answer: { ts: ANSWERED, source: 'founder' },
    status: { ts: ANSWERED, source: 'founder' },
    result: { ts: 1_786_822_543_855, source: 'agent' }, // 12:35:43, before she spoke
    title: { ts: 1_786_798_130_976, source: 'agent' },
    body: { ts: 1_786_798_130_976, source: 'agent' },
  },
};

// The same row four minutes later: nobody released it, the lease simply ran out.
const lapsed = { ...held, claim: { ...held.claim }, claimExpired: true };

// And the ordinary case: no worker has ever touched it.
const free = { ...held, claim: null, claimExpired: false };

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settled: [],
  settleAnswer(slug, id, ts) { this.settled.push([slug, id, ts]); },
});

let sup; let spawned;
const build = (items) => {
  sup = new Supervisor(
    { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  spawned = [];
  sup.spawnWorker = (item) => spawned.push(item.id);
  return sup;
};

beforeEach(() => { build([]); });

describe('a continuation is not spawned into a lease someone else still holds', () => {
  it('spawns nothing, and leaves her answer unspent, while the lease is live', async () => {
    build([held]);
    await sup.tick();
    expect(spawned).toEqual([]);
    // THE HALF THAT MATTERS: the mark is what makes the loss permanent. If it
    // is written here, no tick ever looks at this answer again.
    expect(sup._answerDelivered(held)).toBe(false);
  });

  it('carries the answer as soon as the lease lapses', async () => {
    build([lapsed]);
    await sup.tick();
    expect(spawned).toEqual(['w-01666ceb2c']);
    expect(sup._answerDelivered(lapsed)).toBe(true);
  });

  it('still carries it straight away when nobody holds the row', async () => {
    build([free]);
    await sup.tick();
    expect(spawned).toEqual(['w-01666ceb2c']);
  });

  it('does not advertise a row it will not spawn on as queued', () => {
    build([held]);
    expect(sup.status().queued).not.toContain('w-01666ceb2c');
    build([lapsed]);
    expect(sup.status().queued).toContain('w-01666ceb2c');
  });

  it('is about someone else, not about us: our own session already skips it', () => {
    // A row WE are running on is skipped by the session check a line above, and
    // must not be counted as blocked by its own worker's lease.
    build([held]);
    sup.sessions.set('w-01666ceb2c', { itemId: 'w-01666ceb2c' });
    expect(sup.claimHeldElsewhere(held)).toBe(false);
    sup.sessions.delete('w-01666ceb2c');
    expect(sup.claimHeldElsewhere(held)).toBe(true);
  });

  it('treats a row with no claim at all as free', () => {
    build([free]);
    expect(sup.claimHeldElsewhere(free)).toBe(false);
    expect(sup.claimHeldElsewhere(lapsed)).toBe(false);
  });
});
