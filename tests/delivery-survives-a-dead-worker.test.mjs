// A worker that did not finish delivered nothing, however long it took.
//
// The delivery mark is written at SPAWN. It is a promise that a worker will
// carry her answer, not a record that one did, so a session that dies leaves it
// lying. That was known and was wired to the wrong predicate: only sessions
// dying inside FAST_EXIT_MS (45s) released it. All three measured runs died at two to
// four minutes with `error_during_execution` — past the window — so the mark
// stood, no tick would ever consider them again, and nothing said so. Her words
// sat in the ledger where no worker would ever read them.
//
// Duration was never the question. These are the four cases.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

const ITEM = {
  id: 'w-9ccc2474bf', product: 'the-frontier', answer: 'Option 1: One design pass, as an HTML page.',
  wrote: { answer: { ts: 1_786_050_000_000, source: 'founder' } },
};
const ANSWER = ITEM.answer;

let sup;
beforeEach(() => {
  // A supervisor with nowhere to persist: the state file path is inside a temp
  // dir that does not exist, and _saveState swallows its own write errors.
  sup = new Supervisor(
    { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
    { listItems: () => [] },
    '/nonexistent-app',
  );
});

const mark = () => sup._handledAnswers.add(sup._answerKey(ITEM, ANSWER));
const marked = () => sup._answerDelivered(ITEM, ANSWER);

describe('settling a continuation as its session exits', () => {
  it('releases the answer when the session errored out, however long it ran', () => {
    mark();
    // Exactly what her three sessions reported: a result, flagged as an error.
    const verdict = sup.settleDelivery(ITEM, ANSWER, { result: 'error_during_execution', resultIsError: true }, null);
    expect(verdict).toBe('retrying');
    expect(marked()).toBe(false); // the next tick will pick it up again
  });

  it('keeps the answer delivered when the session finished cleanly', () => {
    mark();
    const verdict = sup.settleDelivery(ITEM, ANSWER, { result: 'Wrote the design page.', resultIsError: false }, null);
    expect(verdict).toBe('delivered');
    expect(marked()).toBe(true); // and it is not handed to a second worker
  });

  it('does not spend an attempt on a session WE killed', () => {
    // Every app restart takes the fleet down with it (killAll). Charging those
    // to the item is how a few restarts would exhaust its retries; before this,
    // a restart stranded every continuation older than 45 seconds outright and
    // the marks had to be pruned by hand.
    mark();
    const verdict = sup.settleDelivery(ITEM, ANSWER, { result: null }, 'SIGTERM');
    expect(verdict).toBe('interrupted');
    expect(marked()).toBe(false);
    expect(sup._deliveryAttempts[sup._answerKey(ITEM, ANSWER)]).toBeUndefined();
  });

  it('stops after three real failures instead of respawning forever', () => {
    const dead = { result: 'error_during_execution', resultIsError: true };
    mark();
    expect(sup.settleDelivery(ITEM, ANSWER, dead, null)).toBe('retrying');
    mark();
    expect(sup.settleDelivery(ITEM, ANSWER, dead, null)).toBe('retrying');
    mark();
    expect(sup.settleDelivery(ITEM, ANSWER, dead, null)).toBe('given up');
    expect(marked()).toBe(true); // stays marked, so the row reads "stopped" honestly
  });

  it('forgets the failures once the answer finally lands', () => {
    const dead = { result: 'error_during_execution', resultIsError: true };
    mark(); sup.settleDelivery(ITEM, ANSWER, dead, null);
    mark(); sup.settleDelivery(ITEM, ANSWER, { result: 'Done.', resultIsError: false }, null);
    expect(sup._deliveryAttempts[sup._answerKey(ITEM, ANSWER)]).toBeUndefined();
  });

  it('lets her "resume interrupted agents" outrank the cap', () => {
    const dead = { result: 'error_during_execution', resultIsError: true };
    for (let n = 0; n < 3; n += 1) { mark(); sup.settleDelivery(ITEM, ANSWER, dead, null); }
    expect(marked()).toBe(true);

    sup.store.listItems = () => [{ ...ITEM, status: 'open' }];
    sup.tick = async () => {};
    sup.resumeStopped();

    expect(marked()).toBe(false);
    expect(sup._deliveryAttempts[sup._answerKey(ITEM, ANSWER)]).toBeUndefined();
  });
});

describe('two identical nudges are two asks', () => {
  it('keys the delivery on when she wrote, not only on what she wrote', () => {
    const first = { ...ITEM, answer: 'any update?', wrote: { answer: { ts: 1000 } } };
    const again = { ...ITEM, answer: 'any update?', wrote: { answer: { ts: 1000 + 240_000 } } };
    sup._handledAnswers.add(sup._answerKey(first, first.answer));
    expect(sup._answerDelivered(first, first.answer)).toBe(true);
    expect(sup._answerDelivered(again, again.answer)).toBe(false);
  });

  it('still honours a mark written before the key carried a time', () => {
    // 185 of those were on disk; without this every one of them respawns at once.
    sup._handledAnswers.add(sup._legacyAnswerKey(ITEM, ANSWER));
    expect(sup._answerDelivered(ITEM, ANSWER)).toBe(true);
  });
});
