// THIS WEEK'S TODAY PAGE SAYS "TODAY" FOR TODAY'S LINES.
//
// Built on 2026-10-31, the This week view wrote every line's weekday, so a line
// from an hour ago read "Sat" on a Saturday. A day name is for other days only.
import { describe, it, expect } from 'vitest';
import { lineWhen } from '../renderer/src/team/today';

const now = new Date(2026, 9, 31, 15, 0).getTime();
const at = (day, hour) => new Date(2026, 9, day, hour, 5).getTime();

describe('a line\'s time on the Today page', () => {
  it('says Today in This week for a line from today', () => {
    expect(lineWhen(at(31, 9), 'week', now)).toBe('Today');
  });

  it('says Yesterday, then the weekday, for older lines in This week', () => {
    expect(lineWhen(at(30, 9), 'week', now)).toBe('Yesterday');
    expect(lineWhen(at(28, 9), 'week', now)).toBe('Wed');
  });

  it('keeps the clock time in Today and Yesterday', () => {
    expect(lineWhen(at(31, 9), 'today', now)).toBe('9:05am');
    expect(lineWhen(at(30, 21), 'yesterday', now)).toBe('9:05pm');
  });
});
