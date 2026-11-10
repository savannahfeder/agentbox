// THE SCHEDULE BOX READS WHAT PEOPLE ACTUALLY TYPE.
//
// Reported 2026-10-04 with two screenshots: the Schedule box answering "not a
// time" to "one week", and the composer's Send later box offering
// "3h, fri 6pm, tomorrow 9am". The ask: read most of what a person would
// naturally type, in both boxes, through the same engine, with no model; some
// phrases will never be readable and that is fine.
//
// Measured before the change, at the screenshot's own moment (Sunday 12:05pm),
// against the phrases in this file: 87 of the 104 that should read were
// refused, among them "one week", "in a week", "tomorrow at noon",
// "3pm tomorrow", "friday afternoon", "oct 10", "the 15th", "eod" and
// "half past 4". Four it should have refused it read instead: "13pm" as 1pm
// today, "in 5" as 5am tomorrow, "fridays" as a one-off, and "in 0 minutes" as now.
//
// The other half matters as much. The grammar may say no, but it may never
// invent a moment: "tomorrow sometime", "satisfy the customer", "in 5" and
// "every friday" must stay refused, and a moment already gone must never be
// handed back, because an overdue schedule is due forever and reads as the
// row coming straight back.
//
// Every date is built in local time. 2026-10-04 is a Sunday.
import { describe, it, expect } from 'vitest';
import { parseWhen } from '../renderer/src/format.ts';
import { momentFromWords } from '../renderer/src/threads/composer-rules.ts';
import { readWhen } from '../renderer/src/components/When.tsx';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const now = at(2026, 10, 4, 12, 5);
const read = (text) => parseWhen(text, now)?.ts ?? null;

function reads(cases) {
  for (const [text, expected] of cases) {
    it(`"${text}"`, () => expect(read(text)).toBe(expected));
  }
}

describe('the phrase in the screenshot, and its neighbours', () => {
  reads([
    ['one week', at(2026, 10, 11, 8)],
    ['a week', at(2026, 10, 11, 8)],
    ['1 week', at(2026, 10, 11, 8)],
    ['1w', at(2026, 10, 11, 8)],
    ['in a week', at(2026, 10, 11, 8)],
    ['in one week', at(2026, 10, 11, 8)],
    ['a week from now', at(2026, 10, 11, 8)],
    ['2 weeks', at(2026, 10, 18, 8)],
    ['in two weeks', at(2026, 10, 18, 8)],
    ['2 wks', at(2026, 10, 18, 8)],
    ['in a month', at(2026, 11, 4, 8)],
    ['in 3 days at 5pm', at(2026, 10, 7, 17)],
    ['in two days', at(2026, 10, 6, 8)],
  ]);
});

describe('stretches of time, said the way people say them', () => {
  reads([
    ['a couple of hours', now + 2 * 3_600_000],
    ['couple hours', now + 2 * 3_600_000],
    ['a few hours', now + 3 * 3_600_000],
    ['an hour and a half', now + 90 * 60_000],
    ['1.5 hours', now + 90 * 60_000],
    ['90 min', now + 90 * 60_000],
    ['1h30', now + 90 * 60_000],
    ['1h 30m', now + 90 * 60_000],
    ['2 hours 30 minutes', now + 150 * 60_000],
    ['2 and a half hours', now + 150 * 60_000],
    ['a half hour', now + 30 * 60_000],
    ['45 minutes from now', now + 45 * 60_000],
    ['in 20 mins', now + 20 * 60_000],
    ['twenty five minutes', now + 25 * 60_000],
    ['in forty-five mins', now + 45 * 60_000],
    ['in 2 hrs', now + 2 * 3_600_000],
  ]);
});

describe('a clock, in all its spellings', () => {
  reads([
    ['at 3pm', at(2026, 10, 4, 15)],
    ['3 pm', at(2026, 10, 4, 15)],
    ['3p', at(2026, 10, 4, 15)],
    ['3 p.m.', at(2026, 10, 4, 15)],
    ['at 3', at(2026, 10, 4, 15)],
    ['3:30', at(2026, 10, 4, 15, 30)],
    ['15:30', at(2026, 10, 4, 15, 30)],
    ['half past 4', at(2026, 10, 4, 16, 30)],
    ['quarter past 4', at(2026, 10, 4, 16, 15)],
    ['quarter to 5', at(2026, 10, 4, 16, 45)],
    ['six thirty pm', at(2026, 10, 4, 18, 30)],
    ["5 o'clock", at(2026, 10, 4, 17)],
    // 12:05 has gone, so noon is tomorrow's.
    ['noon', at(2026, 10, 5, 12)],
    ['midnight', at(2026, 10, 5, 0)],
    ['eod', at(2026, 10, 4, 17)],
    ['end of day', at(2026, 10, 4, 17)],
    ['end of the day', at(2026, 10, 4, 17)],
    ['cob', at(2026, 10, 4, 17)],
  ]);
});

describe('a day with a time on it, in either order', () => {
  reads([
    ['tomorrow at noon', at(2026, 10, 5, 12)],
    ['noon tomorrow', at(2026, 10, 5, 12)],
    ['3pm tomorrow', at(2026, 10, 5, 15)],
    ['3 pm tomorrow', at(2026, 10, 5, 15)],
    ['tomorrow at 3', at(2026, 10, 5, 15)],
    ['tomorrow at 9', at(2026, 10, 5, 9)],
    ['tomorrow afternoon', at(2026, 10, 5, 14)],
    ['tomorrow evening', at(2026, 10, 5, 18)],
    ['tomorrow night', at(2026, 10, 5, 20)],
    ['tomorrow morning at 9', at(2026, 10, 5, 9)],
    ['tomorrow evening at 7', at(2026, 10, 5, 19)],
    ['tomorrow eod', at(2026, 10, 5, 17)],
    ['this afternoon', at(2026, 10, 4, 14)],
    ['tonight at 9', at(2026, 10, 4, 21)],
    ['this evening at 7:30', at(2026, 10, 4, 19, 30)],
    ['today at 12:06', at(2026, 10, 4, 12, 6)],
    ['day after tomorrow', at(2026, 10, 6, 8)],
    ['the day after tomorrow at 10am', at(2026, 10, 6, 10)],
    ['Tomorrow at 3pm.', at(2026, 10, 5, 15)],
    ['until tomorrow', at(2026, 10, 5, 8)],
  ]);
});

describe('a weekday', () => {
  reads([
    ['friday', at(2026, 10, 9, 8)],
    ['on friday', at(2026, 10, 9, 8)],
    ['this friday', at(2026, 10, 9, 8)],
    ['next friday', at(2026, 10, 9, 8)],
    ['friday at 3pm', at(2026, 10, 9, 15)],
    ['3pm friday', at(2026, 10, 9, 15)],
    ['3pm on friday', at(2026, 10, 9, 15)],
    ['Friday, 3pm', at(2026, 10, 9, 15)],
    ['friday afternoon', at(2026, 10, 9, 14)],
    ['friday morning', at(2026, 10, 9, 8)],
    ['fri @ 9am', at(2026, 10, 9, 9)],
    ['thurs 10am', at(2026, 10, 8, 10)],
    ['tues', at(2026, 10, 6, 8)],
    ['weds at 4', at(2026, 10, 7, 16)],
    ['monday at 9', at(2026, 10, 5, 9)],
    ['next week at 3pm', at(2026, 10, 5, 15)],
    ['this weekend', at(2026, 10, 10, 8)],
    ['weekend', at(2026, 10, 10, 8)],
    ['end of week', at(2026, 10, 9, 17)],
    ['eow', at(2026, 10, 9, 17)],
    ['next month', at(2026, 11, 1, 8)],
  ]);
});

describe('a date on the calendar', () => {
  reads([
    ['oct 10', at(2026, 10, 10, 8)],
    ['october 10th', at(2026, 10, 10, 8)],
    ['10 oct', at(2026, 10, 10, 8)],
    ['the 10th of october', at(2026, 10, 10, 8)],
    ['Oct 10 at 2pm', at(2026, 10, 10, 14)],
    ['october 10, 2026', at(2026, 10, 10, 8)],
    ['10/10', at(2026, 10, 10, 8)],
    ['10/10/2026', at(2026, 10, 10, 8)],
    ['2026-10-10', at(2026, 10, 10, 8)],
    ['2026-10-10 14:00', at(2026, 10, 10, 14)],
    ['the 15th', at(2026, 10, 15, 8)],
    ['on the 15th at 9am', at(2026, 10, 15, 9)],
    // The 2nd of this month has gone, so it is next month's.
    ['the 2nd', at(2026, 11, 2, 8)],
    // January has gone this year, so it is next year's.
    ['jan 5', at(2027, 1, 5, 8)],
    ['Dec 24 at 6pm', at(2026, 12, 24, 18)],
    ['oct 4 at 5pm', at(2026, 10, 4, 17)],
  ]);
});

describe('what it must still refuse', () => {
  const refused = [
    'after my meeting', 'whenever', 'sometime', 'soon', 'later', 'tomorrow sometime',
    'tomorrowland', 'todays standup', 'satisfy the customer', 'friday or saturday',
    // A bare number after "in" has no unit, and guessing minutes is a guess.
    'in 5', 'in 30',
    'yesterday', 'last friday', '13pm', '25:00', '9:75', 'feb 30', 'oct 32',
    // Already gone: today's hour, today's date, and this very minute.
    'today at 9am', 'noon today', 'oct 4 at 9am', 'today at 12:05', 'in 0 minutes',
    // A stretch of hours cannot also carry a clock or a day.
    '3 hours at 5pm', '2 hours tomorrow',
    // A rhythm belongs to the repeat grammar, never to a one-off.
    'every friday', 'fridays', 'every day at 9am',
    '99', '',
  ];
  for (const text of refused) {
    it(`"${text}"`, () => expect(read(text)).toBeNull());
  }
});

// Three boxes read a typed time: Schedule calls parseWhen, Send later calls
// momentFromWords, and the When menu on a new thread calls readWhen. The ask
// was one engine under all three, so a phrase one of them reads, all of them
// read, at the same minute.
describe('every box reads with the same engine', () => {
  const phrases = ['one week', 'tomorrow at noon', 'friday afternoon', 'oct 10 at 2pm', 'half past 4', 'eod'];
  for (const text of phrases) {
    it(`"${text}"`, () => {
      const ts = read(text);
      expect(ts).not.toBeNull();
      expect(momentFromWords(text, now)?.ts).toBe(ts);
      expect(readWhen(text, now)?.runAt).toBe(ts);
    });
  }
});
