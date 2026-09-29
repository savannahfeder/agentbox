// The schedule box must never act on words it could not read.
//
// The bug: a snooze typed as "tomorrow" was recorded as thirty minutes later,
// and the row duly came back thirty minutes later. It works perfectly; it was
// scheduling a time nobody picked.
//
// The mechanism was one line in Snooze.tsx:
//
//     if (parsed) onPick(parsed.ts, parsed.label);
//     else if (options[selected]) choose(options[selected]);
//
// `parseWhen('tomorrow')` returned null, so the second branch ran and applied
// options[0], "In 30 minutes". The preview beside the box was already saying
// "not a time", so the UI said it did not understand and then acted anyway.
// The row kept coming back and being snoozed again.
//
// The rule: typed text decides, always. Text we could not read is a
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
