// A THREAD ADDED TO LATER NEVER STARTS ITSELF.
//
// What was missing: you could write a thread down and schedule it for a moment,
// but you could not write one down and leave it unstarted. The only way to park
// work with no date was to invent one, so people either started work they were
// not ready for or kept it out of the app entirely.
//
// The answer is one more row on the card's own Send later menu, "Add it to
// Later", and one field behind it: `start`, which is 'later' while the thread
// waits for you and 'now' once you start it. Everything that decides whether
// work may begin already goes through `isDue`, so the whole of the behaviour is
// that one predicate: a thread in Later is not claimable, spawns nothing, and
// is not in the inbox.
//
// Measured before the fix: `isDue({ start: 'later' })` was true, because the
// field did not exist and the fold dropped it.
import { describe, it, expect } from 'vitest';
import { isDue, isClaimable, foldWorkItems, WORK_ITEM_FIELDS } from '../shared/work-items.mjs';
import { threadState } from '../shared/thread-cards.mjs';

const NOW = Date.now();
const HOUR = 3_600_000;
const line = (patch, ts = NOW) => ({ id: 'w-later', ts, source: 'founder', patch });

describe('a thread added to Later', () => {
  it('is not due, so nothing starts it', () => {
    expect(isDue({ start: 'later' }, NOW)).toBe(false);
  });

  it('is not claimable, so no worker can pull it', () => {
    expect(isClaimable({ status: 'open', start: 'later' }, NOW)).toBe(false);
  });

  it('stays unstarted however long it sits there, unlike a schedule', () => {
    // A schedule is a moment that arrives. This one never does by itself.
    expect(isDue({ runAt: NOW - HOUR }, NOW)).toBe(true);
    expect(isDue({ start: 'later' }, NOW + 365 * 24 * HOUR)).toBe(false);
  });

  it('starts when you start it, which writes start: now', () => {
    expect(isDue({ start: 'now' }, NOW)).toBe(true);
    expect(isClaimable({ status: 'open', start: 'now' }, NOW)).toBe(true);
  });

  it('leaves every ordinary thread exactly as it was', () => {
    expect(isDue({}, NOW)).toBe(true);
    expect(isDue({ runAt: 0 }, NOW)).toBe(true);
    expect(isDue({ runAt: NOW + HOUR }, NOW)).toBe(false);
    expect(isClaimable({ status: 'open' }, NOW)).toBe(true);
  });
});

describe('the field itself', () => {
  it('is a work item field, so the ledger keeps it', () => {
    expect(WORK_ITEM_FIELDS).toContain('start');
  });

  it('folds through the ledger and can be cleared again', () => {
    const held = foldWorkItems([line({ title: 'Rewrite the refunds page', start: 'later' })]).get('w-later');
    expect(held.start).toBe('later');
    expect(isDue(held, NOW)).toBe(false);
    const started = foldWorkItems([
      line({ title: 'Rewrite the refunds page', start: 'later' }),
      line({ start: 'now' }, NOW + 1),
    ]).get('w-later');
    expect(started.start).toBe('now');
    expect(isDue(started, NOW + 1)).toBe(true);
  });

  it('takes those two words and nothing else', () => {
    const odd = foldWorkItems([line({ title: 'x', start: 'soonish' })]).get('w-later');
    expect(odd.start).toBeUndefined();
    expect(isDue(odd, NOW)).toBe(true);
  });
});

describe('what the rest of the app sees', () => {
  it('reads as not running, the same family as a scheduled thread', () => {
    expect(threadState({ status: 'open', start: 'later', labels: ['founder'] }, NOW)).toBe('scheduled');
  });

  it('still reads as running once it is started', () => {
    expect(threadState({ status: 'open', start: 'now', labels: ['founder'] }, NOW)).toBe('running');
  });
});
