// The power test of 2026-10-25 typed "fridays only at 4pm" and got a rule for
// Fridays at 8:00am: after the day, only an "at" straight away was read as the
// time, so "only at 4pm" fell through to the 8am default.
import { describe, it, expect } from 'vitest';

const { parseRepeat } = await import('../renderer/src/format.ts');

describe('a schedule in a reply', () => {
  it('keeps its time when "only" or "just" comes before the at', () => {
    expect(parseRepeat('fridays only at 4pm')).toMatchObject({ rule: { every: 'week', on: 5, at: '16:00' } });
    expect(parseRepeat('saying this again, mondays just at 9:30am, short')).toMatchObject({ rule: { every: 'week', on: 1, at: '09:30' } });
    expect(parseRepeat('fridays at 4pm')).toMatchObject({ rule: { every: 'week', on: 5, at: '16:00' } });
  });

  it('still defaults to 8am when no time is said, and still refuses one it cannot read', () => {
    expect(parseRepeat('fridays only')).toMatchObject({ rule: { every: 'week', on: 5, at: '08:00' } });
    expect(parseRepeat('fridays only at teatime')).toEqual({ unreadable: true });
  });
});
