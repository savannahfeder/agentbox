// EVERY ACCOUNT SHOWS ITS OWN USAGE, NOT ONLY THE ONE IN USE.
//
// What broke (2026-10-16): two Claude logins on one Mac, the work one picked
// and at 5% of its session, the Gmail one at 100%. Settings read usage for the
// picked login only, so nothing on the page said which account had room, and
// the Gmail row still carried a five-day-old "organization has turned Claude
// Code off" that its own usage reading would have disproved.
//
// The fix: Settings asks for every account's reading. Each runs under its own
// folder, a fresh one is reused rather than read again, and every reading that
// lands is handed on so a stale mark can be dropped.
import { describe, it, expect } from 'vitest';
import { AccountUsage } from '../main/account-usage.mjs';
import { STALE_MS } from '../main/claude-usage.mjs';

const answers = {
  default: JSON.stringify({ rate_limits_available: true, rate_limits: { five_hour: { utilization: 100 } } }),
  '/h/.claude-2': JSON.stringify({ rate_limits_available: true, rate_limits: { five_hour: { utilization: 5 }, seven_day: { utilization: 9 } } }),
};

function make({ answer = (env) => answers[env.CLAUDE_CONFIG_DIR ?? 'default'] ?? '', clock = { t: 1_000 } } = {}) {
  const calls = [];
  const heard = [];
  const usage = new AccountUsage({
    bin: () => '/somewhere/claude',
    env: () => ({ PATH: '/bin', CLAUDE_CONFIG_DIR: '/inherited' }),
    run: (_b, _a, opts, cb) => { calls.push(opts.env.CLAUDE_CONFIG_DIR ?? 'default'); cb(null, answer(opts.env)); },
    now: () => clock.t,
    onReading: (profile, reading) => heard.push([profile, reading.limits[0].percent]),
  });
  return { usage, calls, heard, clock };
}

describe('every account', () => {
  it('her case: each login is read under its own folder, and says its own number', async () => {
    const { usage, calls } = make();
    const out = await usage.readAll(['default', '/h/.claude-2']);
    expect(calls.sort()).toEqual(['/h/.claude-2', 'default']);
    expect(out.map((r) => [r.profile, r.limits[0].percent])).toEqual([['default', 100], ['/h/.claude-2', 5]]);
  });

  it('every reading is handed on, so a stale mark can be dropped', async () => {
    const { usage, heard } = make();
    await usage.readAll(['default', '/h/.claude-2']);
    expect(heard.sort()).toEqual([['/h/.claude-2', 5], ['default', 100]]);
  });

  it('a reading younger than five minutes is reused, not read again', async () => {
    const { usage, calls, clock } = make();
    await usage.readAll(['default']);
    clock.t += STALE_MS - 1;
    await usage.readAll(['default']);
    expect(calls).toHaveLength(1);
  });

  it('one five minutes old is read again, and Refresh reads at once', async () => {
    const { usage, calls, clock } = make();
    await usage.readAll(['default']);
    await usage.readAll(['default'], { refresh: true });
    expect(calls).toHaveLength(2);
    clock.t += STALE_MS;
    await usage.readAll(['default']);
    expect(calls).toHaveLength(3);
  });

  it('must NOT invent a number: an account that prints none says why and keeps its last reading', async () => {
    let blocked = false;
    const { usage, heard, clock } = make({ answer: (env) => (blocked ? '' : answers[env.CLAUDE_CONFIG_DIR ?? 'default']) });
    await usage.readAll(['default']);
    blocked = true;
    clock.t += STALE_MS;
    const [r] = await usage.readAll(['default']);
    expect(r.error).toMatch(/didn't report usage/);
    expect(r.limits[0].percent).toBe(100);
    expect(heard).toHaveLength(1);
  });
});
