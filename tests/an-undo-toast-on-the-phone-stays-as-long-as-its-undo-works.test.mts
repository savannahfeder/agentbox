// Two synthetic testers on the phone (2026-11-06, findings 27 and 40) closed a
// thread or put one in Later and went for Undo a few seconds later; twice each
// the toast was already gone. The phone's Undo window is PHONE_UNDO_MS (6 s),
// and the Mac holds a send that long plus a margin for it, but the toast's
// timer gave six seconds only to a toast that names a thread to open. "Moved to
// Later · Undo", "Closed 2 threads · Undo" and the rest carry no thread, so
// they left after the plain toast's 2.5 s, before the window had half run.
import { describe, it, expect } from 'vitest';
import { toastLife } from '../mobile/src/lib/overlays';
import { PHONE_UNDO_MS, PHONE_UNDO_HOLD_MS } from '../shared/phone-undo.mts';

const undo = async () => {};

describe('how long a phone toast stays', () => {
  it('a toast with Undo stays the whole Undo window', () => {
    expect(toastLife({ undo })).toBe(PHONE_UNDO_MS);
  });
  it('one that names a thread and offers Undo stays the same window, not longer', () => {
    expect(toastLife({ undo, goes: { product: 'mac:alpha', id: 'w-1' } })).toBe(PHONE_UNDO_MS);
  });
  it('never outlasts what the Mac holds for it', () => {
    expect(toastLife({ undo })).toBeLessThan(PHONE_UNDO_HOLD_MS);
  });
  it('a plain line with nothing to press still goes quickly', () => {
    expect(toastLife({})).toBe(2500);
    expect(toastLife({ undo: null })).toBe(2500);
  });
});
