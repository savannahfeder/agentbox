// A TIME, TYPED IN WORDS: the one reader under every box that takes one.
//
// The Schedule box (Snooze.tsx), Send later in the composer
// (composer-rules.ts `momentFromWords`) and the When menu on a new thread
// (When.tsx `readWhen`) all come here through `parseWhen` in format.ts, so a
// phrase one of them reads, all of them read, at the same minute.
//
// No model, and no library: a phrase is cut into words and every word has to
// be spent on something this knows (a stretch of time, a day, a date, a clock,
// a part of the day) or on a filler word like "at" or "on". One word left over
// and the whole phrase is refused. That is what keeps "tomorrow sometime" and
// "satisfy the customer" refusals rather than guesses, and a refusal is shown
// as "not a time", which is honest; a guess is a row that comes back when
// nobody asked for it.
//
// Before 2026-10-04 this was a list of exact shapes, and it refused "one week",
// "tomorrow at noon", "3pm tomorrow", "friday afternoon", "oct 10" and "eod"
// (tests/the-schedule-box-reads-what-people-actually-type.test.mjs).
//
// The defaults, so nobody re-derives them:
// - A day with no hour lands at 8am, the hour every preset row already uses.
// - morning 8am, afternoon 2pm, evening and tonight 6pm, night 8pm, end of
//   day 5pm, end of week Friday 5pm.
// - "next friday" is the coming Friday, the way "next monday" always was.
// - A clock with no am or pm: 1 to 6 is the afternoon, 12 is noon. 7 to 11 is
//   the morning on a named day, and otherwise whichever of the two comes next.
// - A moment already gone is never handed back. With no day named it rolls to
//   tomorrow ("8am" at 10am); with a day named ("today at 9am") it is refused.

type Period = 'morning' | 'afternoon' | 'evening' | 'night';

const PERIOD_HOUR: Record<Period, number> = { morning: 8, afternoon: 14, evening: 18, night: 20 };

const FILLER = new Set(['at', 'on', 'by', 'around', 'about', 'for', 'until', 'till', 'til', 'the', 'of', 'and']);

const TOMORROW = new Set(['tomorrow', 'tmrw', 'tmr', 'tom', 'tmw', 'tomorow', 'tommorow', 'tommorrow']);

// Whole words only: `sat[a-z]*` once read "satisfy the customer" as Saturday.
// No plurals either, because "fridays" is a rhythm and belongs to the repeat
// grammar, which gets first look in readWhen.
const WEEKDAY = /^(?:(sun)(?:day)?|(mon)(?:day)?|(tue)(?:s|sday)?|(wed)(?:s|nesday)?|(thu)(?:r|rs|rsday)?|(fri)(?:day)?|(sat)(?:urday)?)$/;

const MONTH = /^(?:(jan)(?:uary)?|(feb)(?:ruary)?|(mar)(?:ch)?|(apr)(?:il)?|(may)|(jun)e?|(jul)y?|(aug)(?:ust)?|(sep)(?:t|tember)?|(oct)(?:ober)?|(nov)(?:ember)?|(dec)(?:ember)?)$/;

const UNIT: Record<string, Unit> = {
  m: 'min', min: 'min', mins: 'min', minute: 'min', minutes: 'min',
  h: 'hour', hr: 'hour', hrs: 'hour', hour: 'hour', hours: 'hour',
  d: 'day', day: 'day', days: 'day',
  w: 'week', wk: 'week', wks: 'week', week: 'week', weeks: 'week',
  mo: 'month', mos: 'month', month: 'month', months: 'month',
  y: 'year', yr: 'year', yrs: 'year', year: 'year', years: 'year',
};
type Unit = 'min' | 'hour' | 'day' | 'week' | 'month' | 'year';

const UNITS_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS_WORDS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];

const CARDINAL = new RegExp(
  `\\b(?:(${TENS_WORDS.join('|')})(?:[\\s-](${UNITS_WORDS.slice(0, 9).join('|')}))?|(${UNITS_WORDS.join('|')}))\\b`, 'g');
const ORDINAL = new RegExp(
  `\\b(?:(twenty|thirty)[\\s-])?(${ORDINAL_WORDS.join('|')})\\b|\\b(twentieth|thirtieth)\\b`, 'g');

/** The words of a phrase, spelled one way, ready to be spent. */
function normalise(raw: string): string[] {
  let t = (raw ?? '').toLowerCase().trim()
    .replace(/[.!?]+$/, '')
    .replace(/,/g, ' ')
    .replace(/@/g, ' at ')
    .replace(/\s+/g, ' ');

  // Phrases that mean one thing, said as several words.
  t = t
    .replace(/\b(?:half an? (?:hour|hr)|an? half (?:hour|hr)|half (?:hour|hr))\b/g, '30 minutes')
    .replace(/\b(?:the )?day after (?:tomorrow|tmrw)\b/g, 'overmorrow')
    .replace(/\b(?:end of (?:the )?(?:day|today)|end of business|close of business|eod|eob|cob)\b/g, 'eod')
    .replace(/\b(?:end of (?:the )?week|eow)\b/g, 'eow')
    .replace(/\bfirst thing(?: in the morning)?\b/g, 'morning')
    .replace(/\bin the (morning|afternoon|evening)\b/g, '$1')
    .replace(/\bat night\b/g, 'night')
    .replace(/\s*o'?clock\b/g, '')
    .replace(/\bfrom now\b/g, '')
    .replace(/\b(?:a )?couple(?: of)?\b/g, '2')
    .replace(/\b(?:a )?few\b/g, '3')
    .replace(/\b(?:midday|lunch ?time|lunch)\b/g, 'noon');

  // Numbers spelled the way they are said. Ordinals first, so "twenty first"
  // is the 21st rather than 20 and a stray "first".
  t = t.replace(ORDINAL, (_m, tens, ord, round) => {
    if (round) return round === 'twentieth' ? '20th' : '30th';
    return `${(tens === 'twenty' ? 20 : tens === 'thirty' ? 30 : 0) + ORDINAL_WORDS.indexOf(ord) + 1}th`;
  });
  t = t.replace(CARDINAL, (_m, tens, unit, small) => {
    if (small) return String(UNITS_WORDS.indexOf(small) + 1);
    return String((TENS_WORDS.indexOf(tens) + 2) * 10 + (unit ? UNITS_WORDS.indexOf(unit) + 1 : 0));
  });

  // "an hour and a half", "2 and a half hours".
  t = t
    .replace(/\b(\d+|an?) ([a-z]+) and a half\b/g, (_m, n, unit) => `${/^\d/.test(n) ? n : 1}.5 ${unit}`)
    .replace(/\b(\d+) and a half\b/g, '$1.5');

  // am and pm, glued to their number: "3 p.m.", "3 pm" and "3p" are all "3pm".
  t = t.replace(/(\d)\s*([ap])\.?(?:\s?m\.?)?(?=\s|$)/g, '$1$2m');

  // Clocks said in words.
  t = t
    .replace(/\bhalf past (\d{1,2})(am|pm)?\b/g, '$1:30$2')
    .replace(/\bquarter past (\d{1,2})(am|pm)?\b/g, '$1:15$2')
    .replace(/\bquarter to (\d{1,2})(am|pm)?\b/g, (_m, h, mer) => `${Number(h) - 1 || 12}:45${mer ?? ''}`)
    .replace(/\b(\d{1,2}) ([0-5]\d)(am|pm)\b/g, '$1:$2$3')
    .replace(/\bat (\d{1,2}) ([0-5]\d)\b/g, 'at $1:$2');

  return t.split(' ').filter(Boolean);
}

interface Clock { h: number; m: number; mer?: 'am' | 'pm'; sure: boolean }

interface State {
  any: boolean;
  date?: Date;
  /** Days to add when the moment has already gone. 0 refuses instead. */
  roll: number;
  exact?: number;
  clock?: Clock;
  period?: Period;
  fallback?: number;
  midnight?: boolean;
  needDuration?: boolean;
  thisDay?: boolean;
}

function dayOf(now: number, plus = 0): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + plus);
  return d;
}

/** Always the NEXT one: "mon" on a Monday means the Monday coming, not today. */
function comingWeekday(now: number, day: number): Date {
  const today = new Date(now).getDay();
  return dayOf(now, ((day - today) + 7) % 7 || 7);
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  const want = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + months);
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(want, last));
  return out;
}

/** A real calendar day, or null: "feb 30" is not one. */
function calendarDay(y: number, m: number, d: number): Date | null {
  const out = new Date(y, m, d);
  return out.getMonth() === m && out.getDate() === d ? out : null;
}

const groupIndex = (m: RegExpMatchArray) => m.slice(1).findIndex(Boolean);

function setDate(s: State, d: Date | null, roll = 0): boolean {
  if (!d || s.date) return false;
  s.date = d;
  s.roll = roll;
  return true;
}

function setClock(s: State, c: Clock | null): boolean {
  if (!c || s.clock || s.fallback !== undefined) return false;
  s.clock = c;
  return true;
}

function clockOf(word: string): Clock | null {
  const m = word.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const mer = m[3] as 'am' | 'pm' | undefined;
  if (min > 59) return null;
  if (mer) return h >= 1 && h <= 12 ? { h, m: min, mer, sure: true } : null;
  if (h > 23) return null;
  // "09:00", "0:30" and "18:30" say exactly which hour they mean.
  const sure = h === 0 || h >= 13 || (m[1].length === 2 && m[1].startsWith('0'));
  return { h, m: min, sure };
}

/** A stretch of time from here: "2 hours 30 minutes", "1h30", "a week". */
function durationAt(w: string[], i: number):
  { used: number; ms: number; days: number; months: number; clocked: boolean } | null {
  let used = 0;
  let ms = 0; let days = 0; let months = 0;
  let any = false; let clocked = false;
  for (;;) {
    let j = i + used;
    if (any && w[j] === 'and') j += 1;
    const part = partAt(w, j);
    if (!part) break;
    const { n, unit } = part;
    if (!Number.isInteger(n) && unit !== 'min' && unit !== 'hour') return null;
    if (unit === 'min' || unit === 'hour') clocked = true;
    if (unit === 'min') ms += n * 60_000;
    else if (unit === 'hour') ms += n * 3_600_000;
    else if (unit === 'day') days += n;
    else if (unit === 'week') days += n * 7;
    else if (unit === 'month') months += n;
    else months += n * 12;
    used = j - i + part.used;
    any = true;
  }
  return any ? { used, ms, days, months, clocked } : null;
}

function partAt(w: string[], j: number): { n: number; unit: Unit; used: number } | null {
  const word = w[j];
  if (!word) return null;
  const glued = word.match(/^(\d+)h(\d{1,2})m?$/);
  if (glued) return { n: Number(glued[1]) + Number(glued[2]) / 60, unit: 'hour', used: 1 };
  const one = word.match(/^(\d+(?:\.\d+)?)([a-z]+)$/);
  if (one && UNIT[one[2]]) return { n: Number(one[1]), unit: UNIT[one[2]], used: 1 };
  const count = /^\d+(?:\.\d+)?$/.test(word) ? Number(word) : word === 'a' || word === 'an' ? 1 : null;
  if (count !== null && w[j + 1] && UNIT[w[j + 1]]) return { n: count, unit: UNIT[w[j + 1]], used: 2 };
  return null;
}

/** "oct 10", "10 oct", "the 10th of october", each with an optional year. */
function monthDateAt(w: string[], i: number, now: number): { used: number; date: Date | null } | null {
  const dayNum = (word?: string) => word?.match(/^(\d{1,2})(?:st|nd|rd|th)?$/)?.[1];
  const year = (word?: string) => (word && /^\d{4}$/.test(word) ? Number(word) : null);
  let month = -1; let day: string | undefined; let used = 0;

  const first = w[i].match(MONTH);
  if (first && dayNum(w[i + 1])) {
    month = groupIndex(first); day = dayNum(w[i + 1]); used = 2;
  } else if (dayNum(w[i])) {
    const of = w[i + 1] === 'of' ? 1 : 0;
    const after = w[i + 1 + of]?.match(MONTH);
    if (!after) return null;
    month = groupIndex(after); day = dayNum(w[i]); used = 2 + of;
  } else return null;

  const y = year(w[i + used]);
  if (y !== null) used += 1;
  const today = dayOf(now);
  let date = calendarDay(y ?? today.getFullYear(), month, Number(day));
  // No year said, and the day has gone this year: it is next year's.
  if (date && y === null && date < today) date = calendarDay(today.getFullYear() + 1, month, Number(day));
  return { used, date };
}

/** One component at w[i]. How many words it spent, or 0 if none fits. */
function step(w: string[], i: number, s: State, now: number): number {
  const word = w[i];
  const next = w[i + 1];

  if (word === 'in') { s.needDuration = true; return 1; }
  if (word === 'this' || word === 'coming') { s.thisDay = true; return 1; }
  if (FILLER.has(word)) return 1;

  const span = durationAt(w, i);
  if (span) {
    s.needDuration = false;
    s.any = true;
    // Hours and minutes are an exact stretch from now; days and longer land
    // on a day, at a time of their own.
    if (span.clocked) {
      if (s.exact !== undefined || span.months) return 0;
      s.exact = span.ms + span.days * 86_400_000;
      return span.used;
    }
    return setDate(s, addMonths(dayOf(now, span.days), span.months)) ? span.used : 0;
  }
  if (s.needDuration) return 0;
  s.any = true;

  if (word === 'today') return setDate(s, dayOf(now)) ? 1 : 0;
  if (TOMORROW.has(word)) return setDate(s, dayOf(now, 1)) ? 1 : 0;
  if (word === 'overmorrow') return setDate(s, dayOf(now, 2)) ? 1 : 0;
  if (word === 'tonight') {
    if (s.period) return 0;
    s.period = 'evening';
    return 1;
  }
  if (word === 'morning' || word === 'afternoon' || word === 'evening' || word === 'night') {
    if (s.period) return 0;
    s.period = word;
    return 1;
  }

  if (word === 'next') {
    const day = next?.match(WEEKDAY);
    if (day) return setDate(s, comingWeekday(now, groupIndex(day))) ? 2 : 0;
    if (next === 'week') return setDate(s, comingWeekday(now, 1)) ? 2 : 0;
    if (next === 'weekend') return setDate(s, comingWeekday(now, 6)) ? 2 : 0;
    if (next === 'month') {
      const first = dayOf(now);
      first.setDate(1);
      return setDate(s, addMonths(first, 1)) ? 2 : 0;
    }
    return 0;
  }

  const day = word.match(WEEKDAY);
  if (day) {
    const target = groupIndex(day);
    // "this friday" on a Friday is today, while it is still ahead.
    if (s.thisDay && target === new Date(now).getDay()) return setDate(s, dayOf(now), 7) ? 1 : 0;
    return setDate(s, comingWeekday(now, target)) ? 1 : 0;
  }
  if (word === 'weekend') {
    const saturday = new Date(now).getDay() === 6;
    return setDate(s, saturday ? dayOf(now, 1) : comingWeekday(now, 6)) ? 1 : 0;
  }
  if (word === 'eow') {
    if (s.fallback !== undefined || s.clock) return 0;
    s.fallback = 17;
    return setDate(s, dayOf(now, (5 - new Date(now).getDay() + 7) % 7), 7) ? 1 : 0;
  }
  if (word === 'eod') {
    if (s.fallback !== undefined || s.clock) return 0;
    s.fallback = 17;
    return 1;
  }
  if (word === 'noon') return setClock(s, { h: 12, m: 0, mer: 'pm', sure: true }) ? 1 : 0;
  if (word === 'midnight') {
    s.midnight = true;
    return setClock(s, { h: 0, m: 0, sure: true }) ? 1 : 0;
  }

  const md = monthDateAt(w, i, now);
  if (md) return setDate(s, md.date) ? md.used : 0;

  const ordinal = word.match(/^(\d{1,2})(?:st|nd|rd|th)$/);
  if (ordinal) {
    // "the 15th": this month's, unless it has gone, then next month's.
    const today = dayOf(now);
    const n = Number(ordinal[1]);
    const month = n < today.getDate() ? today.getMonth() + 1 : today.getMonth();
    return setDate(s, calendarDay(today.getFullYear(), month, n)) ? 1 : 0;
  }

  const iso = word.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return setDate(s, calendarDay(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))) ? 1 : 0;

  // Month first, the way it is written where this app is used.
  const slash = word.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (slash) {
    const today = dayOf(now);
    const y = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : today.getFullYear();
    let date = calendarDay(y, Number(slash[1]) - 1, Number(slash[2]));
    if (date && !slash[3] && date < today) date = calendarDay(y + 1, Number(slash[1]) - 1, Number(slash[2]));
    return setDate(s, date) ? 1 : 0;
  }

  return setClock(s, clockOf(word)) ? 1 : 0;
}

/** The hour a clock with no am or pm means, given what else was said. */
function hourOf(c: Clock, s: State, now: number): number {
  if (c.sure) {
    if (c.mer === 'pm') return c.h % 12 + 12;
    if (c.mer === 'am') return c.h % 12;
    return c.h;
  }
  if (c.h === 12) return 12;
  if (s.period) return s.period === 'morning' ? c.h : c.h + 12;
  if (c.h <= 6) return c.h + 12;
  if (s.date) return c.h;
  const morning = new Date(now);
  morning.setHours(c.h, c.m, 0, 0);
  return morning.getTime() > now ? c.h : c.h + 12;
}

/** The moment a typed phrase names, or null if it names none still ahead. */
export function readMoment(raw: string, now = Date.now()): number | null {
  const w = normalise(raw);
  if (!w.length) return null;
  const s: State = { any: false, roll: 1 };
  for (let i = 0; i < w.length;) {
    const used = step(w, i, s, now);
    if (!used) return null;
    i += used;
  }
  if (!s.any || s.needDuration) return null;

  if (s.exact !== undefined) {
    if (s.date || s.clock || s.period || s.fallback !== undefined) return null;
    const ts = now + s.exact;
    return ts > now ? ts : null;
  }

  const d = new Date(s.date ?? dayOf(now));
  const roll = s.date ? s.roll : 1;
  if (s.clock) d.setHours(hourOf(s.clock, s, now), s.clock.m, 0, 0);
  else if (s.period) d.setHours(PERIOD_HOUR[s.period], 0, 0, 0);
  else d.setHours(s.fallback ?? 8, 0, 0, 0);
  // Midnight on a named day is the end of that day.
  if (s.midnight && s.date) d.setDate(d.getDate() + 1);
  if (d.getTime() <= now && roll) d.setDate(d.getDate() + roll);
  return d.getTime() > now ? d.getTime() : null;
}
