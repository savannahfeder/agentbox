// AFTER UNDOING "SHIP IT", THE SHIP IT AND DISCARD CHOICES WERE GONE.
//
// A synthetic tester picked "1 Ship it" on a finished thread, pressed Z
// ("Option 1 withdrawn, back in your inbox") and opened the thread again: the
// log said "Undid picking Ship it" and "You withdrew your reply", but only
// Reply was left, so the change could not be shipped without typing.
//
// The undo writes '(withdrawn)' over the answer, which stamps the answer
// newer than the result, and the app's own offer read any newer answer as
// "you already answered it".
import { describe, expect, it } from 'vitest';
import { shipOfferLive } from '../renderer/src/ship-offer.ts';

const left = { change: true, running: false };
const finished = {
  status: 'open',
  labels: [],
  body: 'Add a /health endpoint.',
  result: 'Added GET /health with a test. Committed as c41c3f4 on this task\'s branch.',
  wrote: { body: { ts: 100 }, result: { ts: 400 } },
};

describe('the Ship it offer after a pick you took back', () => {
  it('comes back once the pick is withdrawn', () => {
    const undone = { ...finished, answer: '(withdrawn)', wrote: { ...finished.wrote, answer: { ts: 500 } } };
    expect(shipOfferLive(undone, left)).toBe(true);
  });

  it('stays away while the pick stands', () => {
    const picked = { ...finished, answer: 'Option 1: Ship it', wrote: { ...finished.wrote, answer: { ts: 500 } } };
    expect(shipOfferLive(picked, left)).toBe(false);
  });

  it('stays away when something newer than the withdrawn pick was said', () => {
    const undoneThenNoted = { ...finished, answer: '(withdrawn)', note: 'Shipped to main.', wrote: { ...finished.wrote, answer: { ts: 500 }, note: { ts: 600 } } };
    expect(shipOfferLive(undoneThenNoted, left)).toBe(false);
  });
});
