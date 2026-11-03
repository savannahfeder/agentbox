// A DAY WITH AN EXTRA HOUR STILL KNOWS WHAT TODAY IS.
//
// main went red on 2026-11-02 in two files, on Linux and macOS alike, and the
// commit it was blamed on had touched nothing either one reads. Both had
// written `Date.now() - 86_400_000` and expected the word "yesterday". The
// whole suite runs in Pacific time (tests/agentbox-home.setup.mjs), where
// 2026-11-01 was 25 hours long, so at 23:13 that evening 86,400,000 ms back
// was 00:13 the SAME MORNING. The import card said "today" and the inbox said
// "24 hours ago", both correct, and the tests were the ones that were wrong.
//
// The words are calendar days, not multiples of a fixed number. This holds
// both formatters to that on the two days a year the arithmetic diverges, so
// the next red main is not fixed by breaking the code.
import { describe, it, expect } from 'vitest';
import { importLines } from '../renderer/src/agent-import-card';
import { updatedWords } from '../renderer/src/threads/page-rules.ts';

// 2026-11-01 23:13 PST: an hour after the clocks went back, the moment that
// broke main. 2026-03-08 is the 23-hour day the other way.
const LONG_EVENING = new Date('2026-11-01T23:13:00-08:00').getTime();
const SHORT_EVENING = new Date('2026-03-08T23:13:00-07:00').getTime();
const PLAIN_NOON = new Date('2026-06-15T12:00:00-07:00').getTime();
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** What the import card's line says about a conversation at `when`. */
const cardWords = (when, now) => importLines(
  [{
    key: 'project:p', kind: 'project', name: 'Orders Api', slug: 'orders-api', folder: '/w/a', where: '~/w/a', items: [],
    threads: [{ id: 'a', source: 'terminal', folder: '/w/a', folderName: 'a', short: '~/w/a', title: 'A thread', when, path: '/t/a' }],
  }],
  now,
)[0].meta.split(' · ').pop();

describe('the day the clocks go back, when it is 25 hours long', () => {
  it('calls 24 hours ago today, because it is still today', () => {
    expect(cardWords(LONG_EVENING - DAY, LONG_EVENING)).toBe('today');
    expect(updatedWords(LONG_EVENING - DAY, LONG_EVENING)).toBe('24 hours ago');
  });

  it('calls the same hour on the previous date yesterday, at 25 hours ago', () => {
    const then = new Date('2026-10-31T23:13:00-07:00').getTime();
    expect(then).toBe(LONG_EVENING - 25 * HOUR);
    expect(cardWords(then, LONG_EVENING)).toBe('yesterday');
    expect(updatedWords(then, LONG_EVENING)).toBe('Yesterday');
  });

  it('turns over at local midnight and nowhere else', () => {
    const midnight = new Date('2026-11-01T00:00:00-07:00').getTime();
    expect(cardWords(midnight, LONG_EVENING)).toBe('today');
    expect(cardWords(midnight - 1, LONG_EVENING)).toBe('yesterday');
    // 24, not 23: 23:13 into a 25-hour day is a full 24 hours past its midnight.
    expect(updatedWords(midnight, LONG_EVENING)).toBe('24 hours ago');
    expect(updatedWords(midnight - 1, LONG_EVENING)).toBe('Yesterday');
  });
});

describe('the day the clocks go forward, when it is 23 hours long', () => {
  it('calls the same hour yesterday, at 23 hours ago', () => {
    const then = new Date('2026-03-07T23:13:00-08:00').getTime();
    expect(then).toBe(SHORT_EVENING - 23 * HOUR);
    expect(cardWords(then, SHORT_EVENING)).toBe('yesterday');
    expect(updatedWords(then, SHORT_EVENING)).toBe('Yesterday');
  });

  it('calls 24 hours ago yesterday too, that being the day before', () => {
    expect(cardWords(SHORT_EVENING - DAY, SHORT_EVENING)).toBe('yesterday');
    expect(updatedWords(SHORT_EVENING - DAY, SHORT_EVENING)).toBe('Yesterday');
  });
});

describe('every other day of the year, where 24 hours is a day', () => {
  it('calls 24 hours ago yesterday', () => {
    expect(cardWords(PLAIN_NOON - DAY, PLAIN_NOON)).toBe('yesterday');
    expect(updatedWords(PLAIN_NOON - DAY, PLAIN_NOON)).toBe('Yesterday');
  });

  it('still calls this morning today', () => {
    expect(cardWords(PLAIN_NOON - 4 * HOUR, PLAIN_NOON)).toBe('today');
    expect(updatedWords(PLAIN_NOON - 4 * HOUR, PLAIN_NOON)).toBe('4 hours ago');
  });
});
