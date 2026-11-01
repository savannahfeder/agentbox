// A LIMIT ANTHROPIC NO LONGER LISTS IS NOT DRAWN.
//
// Reported 2026-10-31: Anthropic has removed or changed the five hour limit.
// Claude Code's usage answer (2.1.314, read 2026-10-30) carries the limits in
// two shapes: the old named fields (`five_hour`, `seven_day`) and a `limits`
// list of the ones that apply (`session`, `weekly_all`, `weekly_scoped`). The
// page read only the named fields, so a field left behind with a number in
// it would have gone on drawing a session meter for a limit that is gone.
//
// The fix: when the answer carries the list, the session and week meters come
// from the list, and a limit missing from it is not drawn. An answer without
// the list (an older Claude Code, or one served from its own cache) reads the
// named fields as before.
import { describe, it, expect } from 'vitest';
import { readUsageReport } from '../shared/claude-usage.mjs';

const T = Date.parse('2026-10-30T22:24:00Z');
const answer = (rateLimits) => JSON.stringify({ rate_limits_available: true, rate_limits: rateLimits });
const row = (kind, percent, resetsAt, extra = {}) => ({ kind, group: kind === 'session' ? 'session' : 'weekly', percent, severity: 'normal', resets_at: resetsAt, scope: null, is_active: false, ...extra });
const spans = (limits) => limits.map((l) => [l.span, l.qualifier, l.percent]);

const FIVE = { utilization: 63, resets_at: '2026-10-30T23:00:00.5+00:00' };
const SEVEN = { utilization: 61, resets_at: '2026-11-01T21:00:00.5+00:00' };

describe('which limits are drawn', () => {
  it('the reported case: a five hour field Anthropic no longer lists is not drawn', () => {
    const out = readUsageReport(answer({ five_hour: FIVE, seven_day: SEVEN, limits: [row('weekly_all', 61, SEVEN.resets_at)] }), T);
    expect(spans(out)).toEqual([['week', 'all models', 61]]);
  });

  it('a five hour field that is gone is not drawn either', () => {
    const out = readUsageReport(answer({ five_hour: null, seven_day: SEVEN }), T);
    expect(spans(out)).toEqual([['week', 'all models', 61]]);
  });

  it('a listed limit takes its number and reset from the list', () => {
    const out = readUsageReport(answer({ five_hour: FIVE, seven_day: SEVEN, limits: [row('session', 64, '2026-10-30T23:00:00+00:00'), row('weekly_all', 61, SEVEN.resets_at)] }), T);
    expect(spans(out)).toEqual([['session', null, 64], ['week', 'all models', 61]]);
    expect(out[0].resetsAt).toBe(Date.parse('2026-10-30T23:00:00Z'));
  });

  it('an answer with no list reads the named fields, as it always did', () => {
    const out = readUsageReport(answer({ five_hour: FIVE, seven_day: SEVEN }), T);
    expect(spans(out)).toEqual([['session', null, 63], ['week', 'all models', 61]]);
  });

  it('must NOT drop the model weeks, which are listed separately', () => {
    const out = readUsageReport(answer({
      five_hour: FIVE, seven_day: SEVEN,
      limits: [row('weekly_all', 61, SEVEN.resets_at), row('weekly_scoped', 0, SEVEN.resets_at, { scope: { model: { display_name: 'Fable' } } })],
      model_scoped: [{ display_name: 'Fable', utilization: 0, resets_at: SEVEN.resets_at }],
    }), T);
    expect(spans(out)).toEqual([['week', 'all models', 61], ['week', 'Fable', 0]]);
  });
});
