// A LIMIT PAST ITS ALLOWANCE READS 100%, NOT 101%, AND IS NOT DROPPED.
//
// What broke (2026-10-20): the cloud's Gmail tile said "Session 101%". The
// cloud reads a reply's utilization header, which went to 1.01 once the
// session was over its allowance, and multiplied it by 100. The Mac's own
// reader had the opposite fault: a provider utilization above 100 was thrown
// away, so a meter that was over its limit vanished instead of reading full.
import { describe, expect, it } from 'vitest';
import { cloudLimits } from '../main/cloud/logins.mjs';
import { readUsageReport } from '../shared/claude-usage.mjs';

const report = (session) => ({ rate_limits_available: true, rate_limits: { five_hour: { utilization: session, resets_at: null } } });

describe('a meter that is over its limit', () => {
  it('her case: the cloud says 101 and the tile says 100', () => {
    expect(cloudLimits([{ span: 'session', percent: 101, resetsAt: null }])[0].percent).toBe(100);
  });

  it('the Mac keeps an over-limit reading and calls it full', () => {
    expect(readUsageReport(report(101)).map((l) => l.percent)).toEqual([100]);
    expect(readUsageReport(report(100.4)).map((l) => l.percent)).toEqual([100]);
  });

  it('must NOT change a reading under 100, or keep one that is not a number', () => {
    expect(cloudLimits([{ span: 'session', percent: 99, resetsAt: null }])[0].percent).toBe(99);
    expect(cloudLimits([{ span: 'week', percent: 100, resetsAt: null }])[0].percent).toBe(100);
    expect(readUsageReport(report(-1))).toEqual([]);
    expect(readUsageReport(report(Number.NaN))).toEqual([]);
  });
});
