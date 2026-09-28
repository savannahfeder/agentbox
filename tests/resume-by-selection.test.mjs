// Resuming is a choice about WHICH, not a switch.
//
// Some of what stops is work she has moved past, or work she does not want
// spending her plan a fourth time. All-or-nothing made her choose between
// restarting things she had written off and restarting nothing.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

const answered = (id, product, answer) => ({
  id, product, answer, status: 'open',
  wrote: { answer: { ts: 1_786_000_000_000, source: 'founder' } },
});

const ITEMS = [
  answered('w-9ccc2474bf', 'the-frontier', 'Option 1: one design pass.'),
  answered('w-1c720a51be', 'the-frontier', 'I do not like the names Insight and Renown.'),
  answered('w-4b7fa70647', 'harbour-new', 'Option 1: Merge it.'),
];

let sup;
let ticked;
beforeEach(() => {
  ticked = 0;
  sup = new Supervisor(
    { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
    { listItems: () => ITEMS },
    '/nonexistent-app',
  );
  sup.tick = async () => { ticked += 1; };
  for (const i of ITEMS) sup._handledAnswers.add(sup._answerKey(i, i.answer));
});

const stillMarked = (id) => {
  const item = ITEMS.find((i) => i.id === id);
  return sup._answerDelivered(item, item.answer);
};

describe('resuming a selection', () => {
  it('resumes only the rows she ticked and leaves the rest stopped', () => {
    const cleared = sup.resumeStopped(['w-9ccc2474bf', 'w-4b7fa70647']);

    expect(cleared).toBe(2);
    expect(stillMarked('w-9ccc2474bf')).toBe(false); // picked up on the next tick
    expect(stillMarked('w-4b7fa70647')).toBe(false);
    expect(stillMarked('w-1c720a51be')).toBe(true);  // the one she did not tick
    expect(ticked).toBe(1);
  });

  it('clears the attempt cap only for what she chose', () => {
    // Three real failures parks an item; her explicit "try again" outranks that,
    // but not for rows she left alone.
    for (const i of ITEMS) sup._deliveryAttempts[sup._answerKey(i, i.answer)] = 3;

    sup.resumeStopped(['w-1c720a51be']);

    expect(sup._deliveryAttempts[sup._answerKey(ITEMS[1], ITEMS[1].answer)]).toBeUndefined();
    expect(sup._deliveryAttempts[sup._answerKey(ITEMS[0], ITEMS[0].answer)]).toBe(3);
  });

  it('still resumes everything when nothing is selected', () => {
    // The morning after a usage limit took the whole fleet down, all is right.
    expect(sup.resumeStopped()).toBe(3);
    expect(ITEMS.every((i) => !stillMarked(i.id))).toBe(true);
  });

  it('treats an empty selection as no selection rather than as nothing', () => {
    expect(sup.resumeStopped([])).toBe(3);
  });

  it('never resumes a row a worker is already on, ticked or not', () => {
    sup.sessions.set('w-9ccc2474bf', { itemId: 'w-9ccc2474bf' });
    const cleared = sup.resumeStopped(['w-9ccc2474bf', 'w-4b7fa70647']);
    expect(cleared).toBe(1);
    expect(stillMarked('w-9ccc2474bf')).toBe(true);
  });
});
