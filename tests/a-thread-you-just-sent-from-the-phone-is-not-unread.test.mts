// A THREAD YOU JUST SENT FROM THE PHONE IS NOT UNREAD (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 31: a tester sent two threads with the
// computer offline, and both carried the unread dot, so a check-in went on
// opening threads that held only their own message and "Queued". A thread is
// unread when it has an answer newer than your last look; with no answer, it
// fell back to when it was made. Your own thread with no answer yet has
// nothing new for you.
import { describe, it, expect } from 'vitest';
import { isUnread } from '../mobile/src/lib/unread';

const NOW = Date.parse('2026-11-03T20:00:00Z');
const seen = { at: {}, since: NOW - 3600_000 };

describe('the unread dot', () => {
  it('not on a thread you sent from the phone that the computer has not taken', () => {
    expect(isUnread({ product: 'a', id: 'w-1', createdAt: NOW - 60_000, waitsForMac: true }, seen)).toBe(false);
  });
  it('not on a thread you wrote that has no answer yet', () => {
    expect(isUnread({ product: 'a', id: 'w-2', createdAt: NOW - 60_000, wrote: { body: { ts: NOW - 60_000, source: 'founder' } } }, seen)).toBe(false);
  });
  it('on a thread you wrote once its answer arrives', () => {
    expect(isUnread({ product: 'a', id: 'w-3', createdAt: NOW - 600_000, wrote: { body: { ts: NOW - 600_000, source: 'founder' }, result: { ts: NOW - 60_000, source: 'agent' } } }, seen)).toBe(true);
  });
  it('on a thread an agent filed for you, as before', () => {
    expect(isUnread({ product: 'a', id: 'w-4', createdAt: NOW - 60_000, wrote: { body: { ts: NOW - 60_000, source: 'agent' } } }, seen)).toBe(true);
  });
});
