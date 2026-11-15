// A long list dates its rows with one formatter, not a new one per row.
//
// What broke: `/` took 540 to 850 ms to open search on an inbox of 800
// threads (scripts/scratch/time-keys.mjs, headless Chromium, keydown to the
// first frame with the field drawn). A CPU profile put 320 ms of it in
// `stamp`, because `toLocaleDateString` and `toLocaleTimeString` build a new
// Intl.DateTimeFormat on every call, about 0.4 ms each, and every row asks for
// one.
//
// The rule: the words stay exactly what `toLocale*String` printed, and a
// thousand rows build at most one formatter per shape of date.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ago, stamp, dayLabel, dayAndTime } from '../renderer/src/format';
import { updatedWords } from '../renderer/src/threads/page-rules';

const now = new Date(2026, 10, 8, 15, 30).getTime();
const daysAgo = (d, h = 9) => new Date(2026, 10, 8 - d, h, 5).getTime();

afterEach(() => vi.restoreAllMocks());

function countFormatters(run) {
  const Real = Intl.DateTimeFormat;
  let made = 0;
  const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (...args) { made++; return new Real(...args); });
  const spyDate = vi.spyOn(Date.prototype, 'toLocaleDateString');
  const spyTime = vi.spyOn(Date.prototype, 'toLocaleTimeString');
  const spyBoth = vi.spyOn(Date.prototype, 'toLocaleString');
  run();
  const viaDate = spyDate.mock.calls.length + spyTime.mock.calls.length + spyBoth.mock.calls.length;
  spy.mockRestore();
  return { made, viaDate };
}

describe('a long list dates its rows with one formatter', () => {
  it('prints the same words toLocale*String printed', () => {
    for (const ts of [daysAgo(0), daysAgo(0, 23), daysAgo(1), daysAgo(3), daysAgo(9), daysAgo(40), daysAgo(400)]) {
      const d = new Date(ts);
      const sameDay = d.toDateString() === new Date(now).toDateString();
      expect(stamp(ts, now)).toBe(sameDay
        ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase());
      if (now - ts >= 7 * 86_400_000) {
        expect(ago(ts, now)).toBe(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        expect(updatedWords(ts, now)).toBe(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
      }
    }
    const tomorrowish = new Date(2026, 10, 12, 8, 0).getTime();
    expect(dayLabel(tomorrowish, now)).toBe(new Date(tomorrowish).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }));
    expect(dayAndTime(tomorrowish, now)).toBe(new Date(tomorrowish).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }));
  });

  it('a thousand rows build a handful of formatters, not a thousand', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => daysAgo(i % 60, i % 24));
    const { made, viaDate } = countFormatters(() => {
      for (const ts of rows) { stamp(ts, now); ago(ts, now); updatedWords(ts, now); dayLabel(ts + 30 * 86_400_000, now); dayAndTime(ts, now); }
    });
    expect(viaDate).toBe(0);
    expect(made).toBeLessThanOrEqual(6);
  });

  it('a date of a different shape still gets its own words', () => {
    const ts = daysAgo(40);
    expect(stamp(ts, now)).not.toBe(dayAndTime(ts, now));
  });
});
