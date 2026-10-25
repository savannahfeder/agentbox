// A RESET SAYS ITS WEEKDAY.
//
// What she asked (2026-10-20): the account tiles said "Oct 22, 4pm" and "I have
// to figure out which day it is and it's easy to forget". A reset on another
// day now leads with the weekday ("Thu 4pm"). One six or more days out also
// carries its date, because "Tue 1pm" read on a Tuesday means today.
import { describe, expect, it } from 'vitest';
import { resetDay } from '../shared/usage.mjs';
import { resetWords } from '../renderer/src/account-words.ts';
import { readUsageReport } from '../shared/claude-usage.mjs';
import { limitRows } from '../shared/usage.mjs';

// Tuesday, Oct 20 2026, 2:30pm, in whatever zone the run is in.
const now = new Date(2026, 9, 20, 14, 30).getTime();
const on = (day, h, m = 0) => new Date(2026, 9, day, h, m).getTime();
const limit = (resetsAt) => ({ span: 'week', qualifier: 'all models', name: 'This week', percent: 37, resetsText: null, resetsOn: null, resetsAt, zone: null });

describe('the day a limit resets', () => {
  it('her case: Thursday Oct 22 at 4pm reads as Thu', () => {
    expect(resetDay(on(22, 16), now)).toBe('Thu');
    expect(resetWords(limit(on(22, 16)), now)).toBe('Thu 4pm');
  });

  it('today says only the time, and just after midnight is tomorrow', () => {
    expect(resetDay(on(20, 23, 59), now)).toBeNull();
    expect(resetWords(limit(on(20, 18, 19)), now)).toBe('6:19pm');
    expect(resetWords(limit(on(21, 0, 30)), now)).toBe('Wed 12:30am');
  });

  it('five days out is still only a weekday', () => {
    expect(resetWords(limit(on(25, 16)), now)).toBe('Sun 4pm');
  });

  it('must NOT say only "Tue" a week out on a Tuesday, or anything six days out', () => {
    expect(resetWords(limit(on(27, 13)), now)).toBe('Tue Oct 27, 1pm');
    expect(resetWords(limit(on(26, 15)), now)).toBe('Mon Oct 26, 3pm');
  });

  it('the sidebar panel says it the same way', () => {
    const report = { rate_limits_available: true, rate_limits: {
      five_hour: { utilization: 9, resets_at: new Date(on(20, 18, 19)).toISOString() },
      seven_day: { utilization: 37, resets_at: new Date(on(22, 16)).toISOString() },
    } };
    expect(limitRows(readUsageReport(report, now), now).map((r) => r.when)).toEqual(['Resets 6:19pm', 'Resets Thu at 4pm']);
  });
});
