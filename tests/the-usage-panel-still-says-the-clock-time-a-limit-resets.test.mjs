// THE USAGE PANEL STILL SAYS THE CLOCK TIME A CLAUDE LIMIT RESETS.
//
// What broke (2026-10-19, caught before it shipped): Claude usage moved from
// scraping `/usage` text to Claude Code's `get_usage` answer, which carries
// only the instant of each reset. The sidebar panel words a reset from
// `resetsText`, and without it fell back to Codex's countdown, so "Resets
// 6:19pm" would have become "Resets in 3h 49m" and the week "Resets in 2d 1h",
// against the decision recorded on `limitRows` in shared/usage.mjs.
import { describe, expect, it } from 'vitest';
import { readUsageReport } from '../shared/claude-usage.mjs';
import { limitRows } from '../shared/usage.mjs';

const now = new Date(2026, 9, 20, 14, 30).getTime();
const iso = (day, h, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const report = (session, week) => ({
  rate_limits_available: true,
  rate_limits: { five_hour: { utilization: 9, resets_at: session }, seven_day: { utilization: 37, resets_at: week } },
});

describe('a reset read from the provider', () => {
  it('her case: today is a clock time, another day carries its weekday', () => {
    const [session, week] = readUsageReport(report(iso(20, 18, 19), iso(22, 16)), now);
    expect(session).toMatchObject({ resetsText: '6:19pm', resetsOn: null });
    expect(week).toMatchObject({ resetsText: '4pm', resetsOn: 'Thu' });
    expect(limitRows([session, week], now).map((r) => r.when)).toEqual(['Resets 6:19pm', 'Resets Thu at 4pm']);
  });

  it('just after midnight is tomorrow, not today', () => {
    const [session] = readUsageReport(report(iso(21, 0, 5), null), now);
    expect(session).toMatchObject({ resetsText: '12:05am', resetsOn: 'Wed' });
  });

  it('must NOT invent a time when the provider gives none', () => {
    const [session, week] = readUsageReport(report(null, 'not a date'), now);
    expect(session).toMatchObject({ resetsAt: null, resetsText: null, resetsOn: null });
    expect(week).toMatchObject({ resetsAt: null, resetsText: null, resetsOn: null });
    expect(limitRows([session], now)[0].when).toBeNull();
  });
});
