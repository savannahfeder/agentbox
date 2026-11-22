// A CODEX REFUSED OVER AND OVER STILL SHOWS ITS LAST READING (r-00a452c588-20261122).
//
// A Codex at its usage limit refuses a run in about two seconds, and that run's
// log holds one rate-limit report with every window null. The reader looked at
// the three newest logs and stopped, so three refused runs in a row hid the
// last real figure. Measured on ~/.codex on 2026-11-21: after 1,842 refused
// tester runs the newest real reading (5-hour window 99%, week 48%) was still
// on disk and `loggedCodexLimits` answered null, so the meter had nothing to
// draw and the product loop's pacer said "run, no reading for this week yet".
//
// Now a small log with only all-null reports does not use up the look-back.

import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { forgetLoggedLimits, loggedCodexLimits } from '../main/codex-usage-file.mts';

const NULL_FAMILY = { limit_id: 'premium', primary: null, secondary: null, credits: { has_credits: false, unlimited: false, balance: '0' }, rate_limit_reached_type: null };
const REAL = { limit_id: 'codex', primary: { used_percent: 99, window_minutes: 300, resets_at: 1795332160 }, secondary: { used_percent: 48, window_minutes: 10080, resets_at: 1795677380 } };

const report = (limits: unknown, at: string) => `${JSON.stringify({ timestamp: at, type: 'event_msg', payload: { type: 'token_count', rate_limits: limits } })}\n`;
const talk = `${JSON.stringify({ timestamp: '2026-11-21T20:00:00Z', type: 'response_item', payload: { type: 'message' } })}\n`;
const refused = () => `${talk}${report(NULL_FAMILY, '2026-11-22T03:24:02.524Z')}${JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete', error: { message: 'You’ve hit your usage limit.', codex_error_info: 'usage_limit_exceeded' } } })}\n`;
const good = () => `${talk}${report(REAL, '2026-11-22T02:26:22.203Z')}`;
const quiet = () => talk;

/** A Codex home whose logs are these, the last one newest. A log may say how long ago it was last written. */
function home(...logs: (string | { text: string; daysAgo: number })[]) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-refused-')));
  const sessions = path.join(dir, 'sessions', '2026', '11', '21');
  fs.mkdirSync(sessions, { recursive: true });
  const start = Date.now() - 60 * 60_000;
  logs.forEach((entry, i) => {
    const { text, daysAgo } = typeof entry === 'string' ? { text: entry, daysAgo: 0 } : entry;
    const file = path.join(sessions, `rollout-2026-11-21T10-00-00-${String(i).padStart(4, '0')}.jsonl`);
    const at = new Date(start + i * 1000 - daysAgo * 24 * 3600_000);
    fs.writeFileSync(file, text);
    fs.utimesSync(file, at, at);
  });
  return dir;
}

beforeEach(() => forgetLoggedLimits());

describe('a login refused since its last real run', () => {
  it('reads the last real report past refused runs', () => {
    expect(loggedCodexLimits(home(good(), refused()))?.snapshot.primary).toEqual(REAL.primary);
    expect(loggedCodexLimits(home(good(), refused(), refused(), refused(), refused(), refused()))?.snapshot).toEqual({ primary: REAL.primary, secondary: REAL.secondary });
  });

  it('and is dated when it was true', () => {
    expect(loggedCodexLimits(home(good(), refused(), refused(), refused()))?.at).toBe(Date.parse('2026-11-22T02:26:22.203Z'));
  });

  it('reads the newest real one of several', () => {
    const newer = `${talk}${report({ ...REAL, primary: { ...REAL.primary, used_percent: 12 } }, '2026-11-22T02:50:00Z')}`;
    expect(loggedCodexLimits(home(good(), newer, refused(), refused(), refused(), refused()))?.snapshot.primary).toMatchObject({ used_percent: 12 });
  });
});

describe('what still ends the look back', () => {
  it('three ordinary logs that say nothing', () => {
    expect(loggedCodexLimits(home(good(), quiet(), quiet(), quiet()))).toBe(null);
    expect(loggedCodexLimits(home(good(), quiet(), quiet()))?.snapshot.primary).toEqual(REAL.primary);
    expect(loggedCodexLimits(home(good(), refused(), quiet(), refused(), quiet(), refused(), quiet()))).toBe(null);
  });

  it('a long log that ends in an all-null report, which is an ordinary run, not a refused one', () => {
    const long = `${talk.repeat(12000)}${report(NULL_FAMILY, '2026-11-22T03:24:02Z')}`;
    expect(long.length).toBeGreaterThan(1024 * 1024);
    expect(loggedCodexLimits(home(good(), long, long, long))).toBe(null);
  });

  it('sixty refused runs, so a login refused for weeks costs a bounded read', () => {
    expect(loggedCodexLimits(home(good(), ...Array.from({ length: 59 }, refused)))?.snapshot.primary).toEqual(REAL.primary);
    expect(loggedCodexLimits(home(good(), ...Array.from({ length: 60 }, refused)))).toBe(null);
  });

  it('a real report nobody has written to in a fortnight, behind refused runs', () => {
    expect(loggedCodexLimits(home({ text: good(), daysAgo: 13 }, refused(), refused(), refused()))?.snapshot.primary).toEqual(REAL.primary);
    expect(loggedCodexLimits(home({ text: good(), daysAgo: 15 }, refused(), refused(), refused()))).toBe(null);
  });

  it('no reading at all', () => {
    expect(loggedCodexLimits(home(refused(), refused()))).toBe(null);
    expect(loggedCodexLimits(home(quiet()))).toBe(null);
  });
});
