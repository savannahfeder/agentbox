// "week" on its own means one week, and so do "day", "hour" and the rest.
//
// What broke: typing "week" in the Schedule box read as "not a time", though
// "a week", "1 week" and "1w" all worked (parseWhen('week') was null). A unit
// said alone is a count of one.
//
// Only the whole phrase: "this week" names no moment and stays refused, and
// "next week" keeps meaning the coming Monday.
//
// Every date is built in local time. 2026-10-04 is a Sunday.
import { describe, it, expect } from 'vitest';
import { parseWhen } from '../renderer/src/format.ts';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const now = at(2026, 10, 4, 12, 5);
const read = (text) => parseWhen(text, now)?.ts ?? null;

describe('a unit said alone is one of it', () => {
  const cases = [
    ['week', at(2026, 10, 11, 8)],
    ['Week', at(2026, 10, 11, 8)],
    ['wk', at(2026, 10, 11, 8)],
    ['in week', at(2026, 10, 11, 8)],
    ['day', at(2026, 10, 5, 8)],
    ['hour', now + 3_600_000],
    ['hr', now + 3_600_000],
    ['minute', now + 60_000],
    ['min', now + 60_000],
    ['month', at(2026, 11, 4, 8)],
    ['year', at(2027, 10, 4, 8)],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}"`, () => expect(read(text)).toBe(expected));
  }
});

describe('what it must not turn into a count of one', () => {
  it('"next week" is still the coming Monday', () => expect(read('next week')).toBe(at(2026, 10, 5, 8)));
  for (const text of ['this week', 'weeks', 'hours', 'weekly', 'week sometime', 'every week']) {
    it(`"${text}" is refused`, () => expect(read(text)).toBeNull());
  }
});
