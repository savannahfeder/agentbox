// EVERY ACCOUNT METER SAYS WHEN IT RESETS, NOT ONLY A FULL ONE.
//
// What broke (2026-10-20): Settings › Claude Code showed three cloud logins and
// two on this computer at 9% to 53%, and not one reset time. The tiles only
// said "back 5:10pm" once a meter reached 100%, so the time that mattered most
// was hidden until it was too late. Measured by drawing the page in the
// fixture world (?fixtures&settings=claude&accounts=two&cloudread): no time
// on any meter under 100%.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { meterPair, resetWords } from '../renderer/src/account-words.ts';
import { MiniMeters } from '../renderer/src/components/Settings';

const now = new Date(2026, 9, 20, 14, 30).getTime();
const on = (day, h, m = 0) => new Date(2026, 9, day, h, m).getTime();
const limit = (span, percent, extra = {}) => ({
  span, qualifier: span === 'week' ? 'all models' : null, name: span, percent,
  resetsText: null, resetsOn: null, resetsAt: null, zone: null, ...extra,
});
const draw = (limits) => renderToStaticMarkup(React.createElement(MiniMeters, { limits, now }));
const times = (html) => [...html.matchAll(/class="acct-meter-when"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe('when a limit resets, in words', () => {
  it('today is a clock time', () => {
    expect(resetWords(limit('session', 9, { resetsAt: on(20, 18, 19) }), now)).toBe('6:19pm');
  });

  it('another day leads with its weekday (tests/a-reset-says-its-weekday)', () => {
    expect(resetWords(limit('week', 37, { resetsAt: on(22, 16) }), now)).toBe('Thu 4pm');
    expect(resetWords(limit('session', 9, { resetsAt: on(21, 0, 30) }), now)).toBe('Wed 12:30am');
  });

  it('a reading with only the words Claude Code printed keeps them', () => {
    expect(resetWords(limit('session', 9, { resetsText: '8pm' }), now)).toBe('8pm');
    expect(resetWords(limit('week', 37, { resetsText: '4pm', resetsOn: 'Oct 22' }), now)).toBe('Oct 22, 4pm');
  });

  it('must NOT say a time that has gone by, or one it was never told', () => {
    expect(resetWords(limit('session', 9, { resetsAt: on(20, 14, 0) }), now)).toBeNull();
    expect(resetWords(limit('session', 9, { resetsAt: now }), now)).toBeNull();
    expect(resetWords(limit('session', 0), now)).toBeNull();
  });
});

describe('the meters on every account tile', () => {
  it('her case: a meter at 9% says when it resets', () => {
    const [session, week] = meterPair([limit('session', 9, { resetsAt: on(20, 18, 19) }), limit('week', 37, { resetsAt: on(22, 16) })], now);
    expect(session.resets).toBe('6:19pm');
    expect(week.resets).toBe('Thu 4pm');
    expect(times(draw([limit('session', 9, { resetsAt: on(20, 18, 19) }), limit('week', 37, { resetsAt: on(22, 16) })]))).toEqual(['6:19pm', 'Thu 4pm']);
  });

  it('a full meter keeps its number and still says when it resets', () => {
    const html = draw([limit('session', 100, { resetsText: '5:09pm' }), limit('week', 15, { resetsAt: on(26, 11, 59) })]);
    expect(html).toContain('acct-meter full');
    expect(html).toContain('100%');
    expect(times(html)).toEqual(['5:09pm', 'Mon 11:59am']);
  });

  it('one at 0% and one at 99% say it the same way', () => {
    expect(times(draw([limit('session', 0, { resetsText: '8pm' }), limit('week', 99, { resetsText: '4pm', resetsOn: 'Oct 22' })]))).toEqual(['8pm', 'Oct 22, 4pm']);
  });

  it('must NOT invent a time: a meter with no reset keeps an empty cell so the columns line up', () => {
    const html = draw([limit('session', 5), limit('week', 9, { resetsText: '4pm', resetsOn: 'Oct 22' })]);
    expect(times(html)).toEqual(['', 'Oct 22, 4pm']);
    expect(html).not.toMatch(/back /);
  });
});
