// EVERY CODEX ACCOUNT SHOWS ITS OWN LIMITS, NOT ONLY THE ONE IN USE.
//
// What broke (2026-10-25, a screenshot of Settings › Codex): the Free account
// in use showed its Month meter and the Plus account beside it showed nothing,
// while every Claude Code tile shows its session and week. Codex writes each
// account's limits into that account's own session logs, under its own
// CODEX_HOME, so they can be read for every account without asking OpenAI.
// Measured by handing `codexAccountReadings` two homes' logs and drawing the
// tiles they make.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codexAccountReadings } from '../main/codex-usage.mjs';
import { codexAccountsOnce } from '../renderer/src/accounts-once.ts';

const DAY = 24 * 60;
const freeLog = { snapshot: { primary: { used_percent: 27, window_minutes: 30 * DAY, resets_at: 1_800_000_000 }, secondary: null }, at: 1000 };
const plusLog = { snapshot: { primary: { used_percent: 12, window_minutes: 300, resets_at: 1_800_000_000 }, secondary: { used_percent: 31, window_minutes: 7 * DAY, resets_at: 1_800_500_000 } }, at: 2000 };
const logs = { '/h/.codex': freeLog, '/h/.codex-2': plusLog };
const homeOf = (profile) => (profile === 'default' ? '/h/.codex' : profile);
const readLog = (home) => logs[home] ?? null;
const spans = (r) => r.limits?.map((l) => [l.span, l.percent]);

describe('codexAccountReadings', () => {
  it('her case: the Plus account not in use gets its session and week', () => {
    const readings = codexAccountReadings({ profiles: ['default', '/h/.codex-2'], homeOf, readLog });
    expect(readings.map(spans)).toEqual([[['month', 27]], [['session', 12], ['week', 31]]]);
    expect(readings[1]).toMatchObject({ profile: '/h/.codex-2', at: 2000 });
  });

  it('the account in use takes the live reading over its log', () => {
    const live = { limits: [{ span: 'month', percent: 40 }], at: 9000 };
    const [inUse, other] = codexAccountReadings({ profiles: ['default', '/h/.codex-2'], homeOf, readLog, current: live, currentHome: '/h/.codex' });
    expect(inUse).toEqual({ profile: 'default', limits: live.limits, at: 9000 });
    expect(spans(other)).toEqual([['session', 12], ['week', 31]]);
  });

  it('must NOT put the live reading on another account', () => {
    const live = { limits: [{ span: 'month', percent: 40 }], at: 9000 };
    const readings = codexAccountReadings({ profiles: ['/h/.codex-2'], homeOf, readLog, current: live, currentHome: '/h/.codex' });
    expect(spans(readings[0])).toEqual([['session', 12], ['week', 31]]);
  });

  it('a window whose reset has gone past is dropped, and the week is kept', () => {
    const now = (1_800_000_000 + 3600) * 1000;
    const readings = codexAccountReadings({ profiles: ['/h/.codex-2'], homeOf, readLog, now });
    expect(spans(readings[0])).toEqual([['week', 31]]);
  });

  it('a log whose every window has reset counts as no reading', () => {
    const now = (1_800_500_000 + 3600) * 1000;
    expect(codexAccountReadings({ profiles: ['/h/.codex-2'], homeOf, readLog, now })).toEqual([{ profile: '/h/.codex-2' }]);
  });

  it('an account that has never run here has no limits rather than zeroes', () => {
    const readings = codexAccountReadings({ profiles: ['/h/.codex-3'], homeOf, readLog });
    expect(readings).toEqual([{ profile: '/h/.codex-3' }]);
  });
});

describe('the tiles', () => {
  const here = (profile, email, extra = {}) => ({ profile, email, plan: 'Plus', chosen: false, signedIn: true, trouble: null, dir: null, ...extra });

  it('each tile carries its own account\'s reading', () => {
    const readings = codexAccountReadings({ profiles: ['default', '/h/.codex-2'], homeOf, readLog });
    const tiles = codexAccountsOnce({
      here: [here('default', 'work@example.test', { chosen: true, plan: 'Free' }), here('/h/.codex-2', 'you@example.test')],
      readings,
    });
    expect(tiles.map((t) => t.limits?.map((l) => l.span))).toEqual([['month'], ['session', 'week']]);
  });

  it('the page asks main for every Codex account\'s reading', () => {
    const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
    const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
    expect(settings).toContain("api.accountUsage({ engine: 'codex'");
    expect(ipc).toContain('supervisor.codexAccountUsage()');
  });
});
