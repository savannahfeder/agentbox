// AFTER A RELAUNCH THE SESSION ROW WAS GONE AND THE SIDEBAR SHOWED THE WEEK
// (QA batch 011, F-166 and F-193).
//
// Six QA sessions relaunched the app hours after Codex last ran. The popover
// read "CODEX, This week 30% used, Read 6h ago" with no session row at all, and
// the sidebar read "Codex 30%". After one run it read "Codex 2%", the session.
// The five hour window in the reading had ended, `limitsStillRunning` dropped
// it, and `headlineLimit` fell back to the fullest window left: the week. So
// the one number in the sidebar changed meaning with nothing saying so, and the
// popover hid the window a person checks before starting agents.
//
// The new window has still never been read, so it is not drawn as a zero
// (shared/codex-usage.mts). It keeps its row and says Reset; the sidebar shows
// no figure rather than another window's.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { limitRows, limitsToShow, usageSentence } from '../shared/usage.mts';
import { UsagePill, agentsInUse } from '../renderer/src/components/UsagePill.tsx';
import { UsageOverview } from '../renderer/src/components/UsageOverview.tsx';
import { codexAccountReadings } from '../main/codex-usage.mts';
import { meterPair } from '../renderer/src/account-words.ts';
globalThis.React = React;

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-31T14:10:00Z');

const limit = (over) => ({ span: 'session', qualifier: null, name: 'This session', percent: 2, resetsAt: null, resetsText: null, resetsOn: null, zone: null, ...over });
const week = (over) => limit({ span: 'week', name: 'This week', percent: 30, resetsAt: NOW + 3 * DAY + 16 * HOUR, ...over });
const ENDED = limit({ resetsAt: NOW - HOUR });
const RELAUNCH = { engine: 'codex', at: NOW - 6 * HOUR, limits: [ENDED, week()] };

const row = (usage) => renderToStaticMarkup(createElement(UsagePill, { now: NOW, sidebar: true, usage, all: [usage], recent: 'codex', engineWord: 'Codex' }));

describe('a five hour window that ended since the reading', () => {
  it('keeps its row, saying Reset, above the week', () => {
    expect(limitRows(RELAUNCH.limits, NOW).map((r) => [r.name, r.used, r.when])).toEqual([
      ['This session', null, null],
      ['This week', 30, 'Resets in 3d 16h'],
    ]);
  });

  it('is never given a percent', () => {
    const [session] = limitsToShow(RELAUNCH.limits, NOW);
    expect(session.reset).toBe(true);
    expect(Number.isFinite(session.percent)).toBe(false);
  });

  it('is said aloud as reset', () => {
    expect(usageSentence(RELAUNCH.limits, NOW, 'Codex')).toBe('Codex. This session: reset since the last reading. This week: 30% used, 3d 16h left.');
  });
});

describe('the sidebar row', () => {
  it('shows no figure rather than the week’s', () => {
    const html = row(RELAUNCH);
    expect(html).not.toContain('>30%<');
    expect(html).not.toContain('>0%<');
    expect(html).toContain('Codex');
  });

  it('shows the session once a run reads it again', () => {
    const after = { engine: 'codex', at: NOW, limits: [limit({ resetsAt: NOW + 4 * HOUR + 57 * 60_000 }), week({ percent: 31 })] };
    expect(row(after)).toContain('>2%<');
  });

  it('still shows the week on a plan that has no five hour window', () => {
    const weekOnly = { engine: 'codex', at: NOW, limits: [week()] };
    expect(row(weekOnly)).toContain('>30%<');
  });

  it('still draws nothing when every window in the reading has ended', () => {
    const spent = { ...RELAUNCH, limits: [ENDED, week({ resetsAt: NOW - HOUR })] };
    expect(row(spent)).toBe('');
    expect(agentsInUse([spent], 'codex', spent, NOW)).toEqual([]);
  });
});

describe('Settings', () => {
  it('Codex keeps the session row, reading Reset', () => {
    const [one] = codexAccountReadings({
      profiles: ['main'], homeOf: () => '/codex', currentHome: '/codex', now: NOW,
      current: { limits: RELAUNCH.limits, at: RELAUNCH.at },
    });
    expect(one.limits.map((l) => l.name)).toEqual(['This session', 'This week']);
    const html = renderToStaticMarkup(createElement(UsageOverview, { readings: [{ engine: 'codex', at: RELAUNCH.at, limits: one.limits }], now: NOW }));
    expect(html).toContain('This session');
    expect(html).toContain('Reset');
    expect(html).not.toContain('NaN');
  });

  it('the Codex account tile shows the session as reset, not missing', () => {
    const [one] = codexAccountReadings({
      profiles: ['main'], homeOf: () => '/codex', currentHome: '/codex', now: NOW,
      current: { limits: RELAUNCH.limits, at: RELAUNCH.at },
    });
    expect(meterPair(one.limits, NOW).map((m) => [m.word, m.percent, m.resets])).toEqual([
      ['Session', null, 'Reset'],
      ['Week', 30, meterPair([week()], NOW)[0].resets],
    ]);
  });
});
