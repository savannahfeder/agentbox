// A PHONE ACCOUNT'S "OUT OF USAGE UNTIL" MATCHES ITS OWN METER (2026-11-16).
//
// 2026-11-15 workday, issue 16: Settings, Claude Code, the work account said
// "Out of usage until tomorrow 8:16am" and its session meter under it said
// "Mon 8:17am". Both read the same instant, about 8:16:40: the meter rounds to
// the nearest minute (shared/usage.mts `toMinute`) and the line dropped the
// seconds. The line now rounds the same way.
import { describe, it, expect } from 'vitest';
import { backAt } from '../mobile/src/lib/back-at.ts';
import { hourWords } from '../renderer/src/account-words.ts';

const now = new Date(2026, 10, 15, 13, 0, 0).getTime();
const at = (h: number, m: number, s: number) => new Date(2026, 10, 16, h, m, s).getTime();

describe('when an account is back, on the phone', () => {
  it('past the half minute: the same minute as the meter', () => {
    expect(backAt(at(8, 16, 40), now)).toBe('Out of usage until tomorrow 8:17am');
    expect(hourWords(at(8, 16, 40))).toBe('8:17am');
  });
  it('before the half minute: the minute it is in, as the meter says', () => {
    expect(backAt(at(8, 16, 20), now)).toBe('Out of usage until tomorrow 8:16am');
    expect(hourWords(at(8, 16, 20))).toBe('8:16am');
  });
  it('a reset just before midnight that rounds into the next day names that day', () => {
    expect(backAt(at(23, 59, 45), now)).toBe('Out of usage until Tue 12:00am');
  });
  it('a reset already past says nothing', () => {
    expect(backAt(now - 1000, now)).toBeNull();
  });
});
