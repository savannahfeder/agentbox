// A REPLY TO A THREAD OPENED FROM SEARCH STAYS ON IT (w-3d0fa23ffb, 2026-10-22).
//
// The power tester searched "idempot", opened today's idempotency thread,
// replied, and was taken to "write tests for the refund flow", which matched
// nothing she had searched for, under a breadcrumb still reading SEARCH. The
// rule already said a thread opened from search keeps you on it after a reply
// (advance.ts, 2026-10-13); it only looked at the tab under the search, and that
// tab was Needs you, so the reply moved her on through Needs you. Search open
// now counts as not clearing the inbox.
import { it, expect } from 'vitest';
import { replyMovesOn } from '../renderer/src/advance.ts';

it('a reply from a thread opened from search stays on it, though it sits in Needs you', () => {
  expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 1, inboxSize: 5, searching: true })).toBe(false);
});

it('on the board too', () => {
  expect(replyMovesOn({ view: 'inbox', onBoard: true, index: 1, inboxSize: 5, searching: true })).toBe(false);
});

it('working through Needs you with no search open still moves on', () => {
  expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 1, inboxSize: 5, searching: false })).toBe(true);
  expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 1, inboxSize: 5 })).toBe(true);
});
