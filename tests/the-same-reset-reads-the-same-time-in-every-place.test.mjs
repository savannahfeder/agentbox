// THE SAME RESET READS THE SAME TIME IN EVERY PLACE, AND A WINDOW THAT HAS
// RESET IS NOT DRAWN FULL.
//
// What broke (2026-10-21, a screenshot of Settings › Claude Code): one
// account's week reset read "Thu 11:59am" under This computer and "Thu 12pm"
// under Cloud, and its session "9:09pm" and "9:10pm". Claude Code's get_usage
// gives the instant a second or less before the minute, the cloud's reply
// header gives it in whole seconds on the minute, and both clocks dropped the
// seconds. The same screenshot drew the cloud's other account at Session 100%
// with no reset time beside it: its window had already reset, and the meter
// kept the old number while the tile said Ready.
import { describe, expect, it } from 'vitest';
import { hourWords, meterPair } from '../renderer/src/account-words.ts';
import { readUsageReport } from '../shared/claude-usage.mjs';
import { resetDay } from '../shared/usage.mjs';

const at = (d, h, m = 0, s = 0, ms = 0) => new Date(2026, 9, d, h, m, s, ms).getTime();
const NOW = at(21, 15, 0);

describe('a reset is said to the nearest minute', () => {
  it('the reported case:11:59:59.6 is noon and 9:09:59 is 9:10pm', () => {
    expect(hourWords(at(22, 11, 59, 59, 600))).toBe('12pm');
    expect(hourWords(at(21, 21, 9, 59))).toBe('9:10pm');
  });

  it('either side of the half minute', () => {
    expect(hourWords(at(21, 21, 9, 29, 999))).toBe('9:09pm');
    expect(hourWords(at(21, 21, 9, 30))).toBe('9:10pm');
  });

  it('must NOT move a reset that is already on the minute', () => {
    expect(hourWords(at(21, 16, 0))).toBe('4pm');
    expect(hourWords(at(21, 21, 9))).toBe('9:09pm');
  });

  it('a second before midnight is the next day', () => {
    expect(resetDay(at(21, 23, 59, 59, 700), NOW)).toBe('Thu');
    expect(resetDay(at(21, 23, 59, 0), NOW)).toBeNull();
  });

  it('this computer’s reading says the same words as the cloud’s', () => {
    const iso = new Date(at(22, 11, 59, 59, 600)).toISOString();
    const [week] = readUsageReport({ rate_limits_available: true, rate_limits: { seven_day: { utilization: 82, resets_at: iso } } }, NOW);
    expect([week.resetsText, week.resetsOn]).toEqual(['12pm', 'Thu']);
  });
});

const session = (percent, resetsAt, extra = {}) => ({ span: 'session', qualifier: null, name: 'This session', percent, resetsText: null, resetsOn: null, resetsAt, zone: null, ...extra });

describe('a window that has reset', () => {
  it('the reported case:a session read at 100% that reset since reads 0, with no time', () => {
    expect(meterPair([session(100, NOW - 60_000)], NOW)[0]).toMatchObject({ percent: 0, resets: null });
  });

  it('must NOT empty a window that has yet to reset, or one whose reset is not known', () => {
    expect(meterPair([session(100, NOW + 60_000)], NOW)[0].percent).toBe(100);
    expect(meterPair([session(100, null, { resetsText: '5:09pm' })], NOW)[0].percent).toBe(100);
  });
});
