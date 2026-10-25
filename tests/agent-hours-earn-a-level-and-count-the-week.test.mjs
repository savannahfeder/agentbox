// AGENT HOURS EARN A LEVEL AND COUNT THE WEEK (w-3d0fa23ffb, 2026-10-20).
//
// Rooms shows a level from agent hours ("I find agent hours level
// compelling"), ranks by this week's hours, a streak of days in a row, and a
// chart of hours since you started. Nothing in the app kept a history of runs:
// a run's length went to PostHog and was gone (main/analytics.mjs
// runEndedProps), and the only durable trace of a run was its log file.
//
// These are the rules, measured with fixed clocks in the test time zone
// (America/Los_Angeles, set in tests/agentbox-home.setup.mjs): the edges of
// a week and a day, a streak with a gap, runs counted once however often they
// are written, and a run read back from its trace log. The level curve is
// tests/a-level-takes-months-to-master-not-weeks.test.mjs.
import { describe, it, expect } from 'vitest';
import { summarizeRuns, dedupeRuns, runFromTrace } from '../shared/agent-hours.mjs';

const H = 3600;
const at = (iso) => new Date(iso).getTime();
const run = (endIso, hours, extra = {}) => {
  const end = at(endIso);
  return { key: `w-${end}`, at: end, start: end - hours * H * 1000, item: 'w-x', product: 'p', engine: 'claude', seconds: hours * H, failed: false, ...extra };
};

describe('a week, a day, all time', () => {
  // Wednesday 22 October 2026, 15:00 in Los Angeles.
  const now = at('2026-10-22T15:00:00-07:00');

  it('the week starts on local Monday at midnight', () => {
    const s = summarizeRuns([
      run('2026-10-19T00:30:00-07:00', 2), // Monday just after midnight: this week
      run('2026-10-18T23:30:00-07:00', 3), // Sunday night: last week
    ], { now });
    expect(s.weekStart).toBe('2026-10-19');
    expect(s.week).toBeCloseTo(2);
    expect(s.total).toBeCloseTo(5);
  });

  it('today is the local date, not the UTC one', () => {
    const s = summarizeRuns([
      run('2026-10-22T00:10:00-07:00', 1), // today
      run('2026-10-21T23:50:00-07:00', 4), // yesterday, though already the 22nd in UTC
    ], { now });
    expect(s.day).toBe('2026-10-22');
    expect(s.today).toBeCloseTo(1);
  });

  it('overlapping runs each count: five agents for an hour is five hours', () => {
    const five = Array.from({ length: 5 }, (_, i) => run('2026-10-22T12:00:00-07:00', 1, { key: `k${i}` }));
    expect(summarizeRuns(five, { now }).today).toBeCloseTo(5);
  });

  it('a failed run counts, a run whose agent never started does not', () => {
    const s = summarizeRuns([
      run('2026-10-22T10:00:00-07:00', 1, { key: 'a', failed: true }),
      run('2026-10-22T11:00:00-07:00', 1, { key: 'b', began: false }),
    ], { now });
    expect(s.today).toBeCloseTo(1);
  });

  it('carries the level of the total', () => {
    const five = Array.from({ length: 5 }, (_, i) => run(`2026-10-0${i + 1}T10:00:00-07:00`, 20, { key: `d${i}` }));
    expect(summarizeRuns(five, { now }).level).toBe(16);
  });

  it('one run is never believed past a day', () => {
    expect(summarizeRuns([run('2026-10-01T10:00:00-07:00', 100)], { now }).total).toBeCloseTo(24);
  });

  it('a run from the future is ignored, not counted', () => {
    expect(summarizeRuns([run('2026-10-23T10:00:00-07:00', 3)], { now }).total).toBe(0);
  });
});

describe('days in a row', () => {
  const now = at('2026-10-22T15:00:00-07:00');
  const day = (d) => run(`2026-10-${d}T12:00:00-07:00`, 0.5, { key: d });

  it('counts back from today', () => {
    expect(summarizeRuns(['20', '21', '22'].map(day), { now }).streak).toBe(3);
  });
  it('a quiet morning does not break it: it counts back from yesterday', () => {
    expect(summarizeRuns(['19', '20', '21'].map(day), { now }).streak).toBe(3);
  });
  it('a missed day does', () => {
    expect(summarizeRuns(['18', '19', '21', '22'].map(day), { now }).streak).toBe(2);
  });
  it('nothing for two days is no streak', () => {
    expect(summarizeRuns(['18', '19', '20'].map(day), { now }).streak).toBe(0);
  });
  it('keeps the last 60 active dates, newest last, for adding up across Macs', () => {
    const s = summarizeRuns(['20', '22', '21', '22'].map((d, i) => run(`2026-10-${d}T12:00:00-07:00`, 0.5, { key: `${d}-${i}` })), { now });
    expect(s.activeDays).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });
});

describe('the months, for the chart', () => {
  it('twelve months ending this one, oldest first, empty months as zero', () => {
    const now = at('2026-10-22T15:00:00-07:00');
    const s = summarizeRuns([run('2026-03-10T12:00:00-07:00', 10), run('2026-10-02T12:00:00-07:00', 2)], { now });
    expect(s.byMonth).toHaveLength(12);
    expect(s.byMonth[0].month).toBe('2025-11');
    expect(s.byMonth.at(-1)).toEqual({ month: '2026-10', hours: 2 });
    expect(s.byMonth.find((m) => m.month === '2026-03').hours).toBeCloseTo(10);
    expect(s.byMonth.find((m) => m.month === '2026-04').hours).toBe(0);
  });
});

describe('counted once', () => {
  it('the same run written twice (a backfill and the live write) is one run', () => {
    const r = run('2026-10-22T10:00:00-07:00', 2, { key: 'w-1:1792000000000' });
    expect(dedupeRuns([r, { ...r }, run('2026-10-22T11:00:00-07:00', 1, { key: 'w-2:1' })])).toHaveLength(2);
  });
  it('the line written when a run ended wins over one read back from its log', () => {
    const read = run('2026-10-22T10:00:00-07:00', 0.1, { key: 'w-1:1', backfilled: true });
    const written = run('2026-10-22T11:00:00-07:00', 1, { key: 'w-1:1' });
    expect(dedupeRuns([read, written])).toEqual([written]);
    expect(dedupeRuns([written, read])).toEqual([written]);
  });
  it('a line with no key or no length is dropped', () => {
    expect(dedupeRuns([{ at: 1, seconds: 5 }, { key: 'x', at: 1 }, null, 'junk'])).toEqual([]);
  });
});

describe('reading a run back from its trace log', () => {
  const start = at('2026-10-20T09:00:00-07:00');
  const name = `${start}.log`;

  it('start from the file name, end from the exit footer', () => {
    const text = `# Fix the build\n# w-abc · spawned 2026-10-20T16:00:00.000Z\n...\n\n# exited (0) 2026-10-20T16:30:00.000Z\n`;
    const r = runFromTrace({ name, text, mtimeMs: start + 99_999_999, item: 'w-abc', product: 'p' });
    expect(r).toMatchObject({ key: `w-abc:${start}`, start, at: at('2026-10-20T16:30:00.000Z'), seconds: 1800, item: 'w-abc', product: 'p' });
  });

  // A run the person stopped says so after the time (shared/dead-run-trace.mjs).
  it('a run stopped on request still ends at its footer', () => {
    const text = '# x\n# w-abc · spawned …\n\n# exited (143) 2026-10-20T16:30:00.000Z · stopped on request\n';
    const r = runFromTrace({ name, text, mtimeMs: start + 99_999_999, item: 'w-abc', product: 'p' });
    expect(r).toMatchObject({ seconds: 1800, failed: true });
  });

  it('no footer (the app crashed): the file’s last write is the end', () => {
    const r = runFromTrace({ name, text: '# x\n# w-abc · spawned …\n', mtimeMs: start + 600_000, item: 'w-abc', product: 'p' });
    expect(r.seconds).toBe(600);
  });

  it('a name that is not a time, or an end before the start, gives nothing', () => {
    expect(runFromTrace({ name: 'notes.log', text: '', mtimeMs: start, item: 'w', product: 'p' })).toBeNull();
    expect(runFromTrace({ name, text: '# exited (0) 2020-01-01T00:00:00.000Z\n', mtimeMs: start, item: 'w', product: 'p' })).toBeNull();
  });

  it('a run longer than a day is not believed', () => {
    expect(runFromTrace({ name, text: '', mtimeMs: start + 30 * 3600_000, item: 'w', product: 'p' })).toBeNull();
  });
});
