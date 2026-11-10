// A METER PAST ITS RESET SHOWS NO NUMBER.
//
// The account cards drew a window that had reset since its reading as 0%
// (renderer/src/account-words.ts, "a number read in a window that has since
// reset belongs to the old window"). 0% is true only at the instant of the
// reset; an account in use spends from the new window straight away, so the
// card stated a figure nobody had read. Asked for on 2026-10-31: delayed
// information is acceptable, made-up information is not.
//
// The fix: such a meter keeps its row, with no number and an empty bar, and
// says it has reset, until a reading of the new window arrives.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { meterPair } from '../renderer/src/account-words.ts';
import { MiniMeters } from '../renderer/src/components/Settings';

const now = Date.parse('2026-10-30T23:10:00Z');
const limit = (span, percent, resetsAt) => ({ span, qualifier: span === 'week' ? 'all models' : null, name: span, percent, resetsText: null, resetsOn: null, resetsAt, zone: null });

describe('a window that has reset since it was read', () => {
  it('the reported case: the session reset at 4pm and was read before it, so it has no number', () => {
    const [session, week] = meterPair([limit('session', 46, now - 10 * 60_000), limit('week', 59, now + 2 * 86_400_000)], now);
    expect([session.percent, session.resets]).toEqual([null, 'Reset']);
    expect(week.percent).toBe(59);
  });

  it('is drawn with an empty bar and a dash, never 0%', () => {
    const html = renderToStaticMarkup(React.createElement(MiniMeters, { limits: [limit('session', 46, now - 60_000)], now }));
    expect(html).not.toContain('<span class="acct-meter-pct">0%</span>');
    expect(html).toContain('<span class="acct-meter-pct">–</span>');
    expect(html).toContain('width:0%');
  });

  it('must NOT blank a window still running, even one minute from its reset', () => {
    const [session] = meterPair([limit('session', 46, now + 60_000)], now);
    expect(session.percent).toBe(46);
  });

  it('must NOT blank a window whose reset nobody reported', () => {
    const [session] = meterPair([limit('session', 0, null)], now);
    expect(session.percent).toBe(0);
  });
});
