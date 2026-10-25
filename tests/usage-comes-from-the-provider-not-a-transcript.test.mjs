// On 2026-10-17 two local accounts showed the same 8% session and 39% week.
// A text scrape could not establish provenance, and refresh failures were hidden.
// Claude Code 2.1.302 exposes get_usage with skip_behaviors, returning provider
// percentages separately from estimates based on local transcripts.
import { expect, it } from 'vitest';
import * as format from '../shared/claude-usage.mjs';
import { ClaudeUsage } from '../main/claude-usage.mjs';

const reset = '2026-10-18T03:00:00Z';
const report = (session = 8, week = 39) => ({
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: session, resets_at: reset },
    seven_day: { utilization: week, resets_at: null },
  },
});

it('reads provider percentages and exact reset instants from the structured report', () => {
  expect(format.readUsageReport(report())).toMatchObject([
    { span: 'session', percent: 8, resetsAt: Date.parse(reset), name: 'This session' },
    { span: 'week', qualifier: 'all models', percent: 39, resetsAt: null },
  ]);
});

it('keeps zero, fractional utilization, and a full allowance distinct', () => {
  expect(format.readUsageReport(report(0, 100)).map(r => r.percent)).toEqual([0, 100]);
  expect(format.readUsageReport(report(0.5, 39.25)).map(r => r.percent)).toEqual([1, 39]);
});

it('says whole percents, and never rounds a limit into full or into unused', () => {
  expect(format.readUsageReport(report(0.2, 99.6)).map(r => r.percent)).toEqual([1, 99]);
  expect(format.readUsageReport(report(12.5, 44.49)).map(r => r.percent)).toEqual([13, 44]);
});

it('never substitutes token totals, local behavior estimates, or plausible prose for provider usage', () => {
  for (const value of [null, {}, 'Current session: 8% used', {
    rate_limits_available: false, rate_limits: report().rate_limits,
    session: { total_cost_usd: 1 }, behaviors: { week: { pct: 39 } },
  }]) expect(format.readUsageReport(value)).toEqual([]);
});

it('refuses missing, nonnumeric, and out-of-range percentages without turning them into zero', () => {
  // Over 100 is full, not unreadable (tests/a-limit-past-its-allowance-reads-100-percent).
  for (const bad of [null, undefined, '8', NaN, Infinity, -1]) {
    const data = report();
    data.rate_limits.five_hour.utilization = bad;
    expect(format.readUsageReport(data).map(r => r.percent)).toEqual([39]);
  }
});

it('keeps named weekly model windows and ignores unknown spending fields', () => {
  const data = report();
  data.rate_limits.model_scoped = [{ display_name: 'Example model', utilization: 22, resets_at: reset }];
  data.rate_limits.extra_usage = { utilization: 90 };
  expect(format.readUsageReport(data).map(r => [r.name, r.percent])).toEqual([
    ['This session', 8], ['This week', 39], ['This week, Example model', 22],
  ]);
});

it('the live reader accepts structured data and requests no transcript scan or model turn', async () => {
  let args;
  const usage = new ClaudeUsage({ bin: () => '/fake/claude', run: (_b, a, _o, done) => {
    args = a;
    done(null, JSON.stringify(report()));
  } });
  expect(await usage.refreshNow()).toMatchObject({ ok: true, reading: { limits: [{ percent: 8 }, { percent: 39 }] } });
  expect(args).toContain('stream-json');
  expect(args).not.toContain('/usage');
});

it('a plausible text answer cannot acquire a fresh checked time', async () => {
  const usage = new ClaudeUsage({ bin: () => '/fake/claude', run: (_b, _a, _o, done) => done(null, 'Current session: 8% used') });
  expect(await usage.refreshNow()).toMatchObject({ ok: false });
  expect(usage.peek()).toBeNull();
});

it('an older CLI asks for an update rather than implying the subscription ended', async () => {
  const usage = new ClaudeUsage({ bin: () => '/fake/claude', run: (_b, _a, _o, done) => done(Error('get_usage is not supported in this context')) });
  expect((await usage.refreshNow()).error).toMatch(/Update Claude Code/);
});
