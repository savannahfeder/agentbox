// A REPLY HELD FOR ITS UNDO READS AS QUEUED, NOT "NOTHING RUNNING" (w-3d0fa23ffb, 2026-10-22).
//
// The power tester replied on a thread, pressed esc, and found it under In
// progress reading NOTHING RUNNING; a few seconds later it said WORKING, and
// for a moment she thought her reply had not started. Every send is held for
// three seconds so Z can take it back, and in those seconds no agent is on it
// and none is queued, so the row said the one thing that was not true: that
// nothing was coming. An answer held for its undo now counts as queued.
import { it, expect } from 'vitest';
import { queuedWithHeld } from '../renderer/src/fleet.ts';
import { liveLine } from '../renderer/src/live-line.ts';

const row = { id: 'w-1', status: 'open', title: 'add an idempotency key', result: 'done', wrote: {} };

it('the thread whose reply is held reads Queued', () => {
  expect(liveLine(row, { queued: queuedWithHeld([], 'w-1'), inProgress: true })?.state).toBe('queued');
});

it('without a held reply it is idle, as before', () => {
  expect(liveLine(row, { queued: queuedWithHeld([], null), inProgress: true })?.state).toBe('idle');
});

it("another thread's held reply changes nothing here", () => {
  expect(liveLine(row, { queued: queuedWithHeld(['w-9'], 'w-2'), inProgress: true })?.state).toBe('idle');
});

it('a fleet not read yet stays not read, and a thread already queued is not doubled', () => {
  expect(queuedWithHeld(undefined, 'w-1')).toBeUndefined();
  expect(queuedWithHeld(['w-1'], 'w-1')).toEqual(['w-1']);
});
