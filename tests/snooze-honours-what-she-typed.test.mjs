// The schedule box must never act on words it could not read.
//
// The bug, straight out of her ledger (personal/, 2026-08-10): at 5:32:43pm she
// asked for tomorrow and the ledger recorded 6:02pm, thirty minutes later, and
// the row duly came back at 6:02pm. It works perfectly; it was scheduling a
// time she never picked.
//
// The mechanism was one line in Snooze.tsx:
//
//     if (parsed) onPick(parsed.ts, parsed.label);
//     else if (options[selected]) choose(options[selected]);
//
// `parseWhen('tomorrow')` returned null, so the second branch ran and applied
// options[0], "In 30 minutes". The preview beside the box was already saying
// "not a time", so the UI told her it did not understand and then acted anyway.
// Nine of her thirteen ledger lines on that one row are re-snoozes, two of them
// written within nine seconds of the row reappearing.
//
// The rule: text she typed decides, always. Text we could not read is a
// REFUSAL, never a silent fall-through to whichever preset is highlighted.
// Same family as the store's own law that an unmeasured number must never
// become a plausible figure.

import { describe, it, expect } from 'vitest';
import { enterMeans, parseWhen } from '../renderer/src/format';

const now = new Date(2026, 7, 5, 10, 0, 0).getTime();

describe('what Enter means in the schedule box', () => {
  it('an empty box applies the highlighted preset', () => {
    expect(enterMeans('', null)).toBe('selected');
    expect(enterMeans('   ', null)).toBe('selected');
  });

  it('text it can read wins over the highlighted preset', () => {
    expect(enterMeans('3h', parseWhen('3h', now))).toBe('typed');
    expect(enterMeans('tomorrow', parseWhen('tomorrow', now))).toBe('typed');
  });

  // The regression itself.
  it('text it cannot read is refused, never swapped for a preset', () => {
    expect(enterMeans('after my meeting', parseWhen('after my meeting', now))).toBe('refuse');
    expect(enterMeans('whenever', null)).toBe('refuse');
  });

  it('the word she actually typed no longer refuses', () => {
    expect(enterMeans('tomorrow', parseWhen('tomorrow', now))).not.toBe('refuse');
  });
});
