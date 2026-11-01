// TWO ACCOUNTS THAT REPORT THE SAME USAGE ARE NOT SHOWN.
//
// What broke (2026-10-30): Settings › Claude Code drew the account in use at
// 46% session and 59% week, resetting 4pm and Sun 1pm, and a second account
// at 45% and 59%, resetting 4pm and Sun 1pm. The second was really at 39% and
// 6%, resetting Thu Nov 5 (asked directly, and the cloud's own look agreed).
// Two different subscriptions do not share a five hour window and a week to
// the minute; one login had been read for both (see
// tests/a-usage-check-reads-only-the-login-of-the-folder-it-names).
//
// Whatever the cause next time, a page that cannot tell which of two equal
// readings is real shows neither, says so, and reads both again next time.
import { describe, it, expect } from 'vitest';
import { AccountUsage } from '../main/account-usage.mjs';

const T = Date.parse('2026-10-30T21:42:00Z');
const at = (iso) => `2026-${iso}:00.5+00:00`;
const report = (session, sessionReset, week, weekReset) => JSON.stringify({
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: session, resets_at: sessionReset },
    seven_day: { utilization: week, resets_at: weekReset },
  },
});
const IN_USE = report(46, at('10-30T23:00'), 59, at('11-01T21:00'));
const IN_USE_A_MINUTE_EARLIER = report(45, at('10-30T23:00'), 59, at('11-01T21:00'));
const SECOND = report(39, at('10-30T22:40'), 6, at('11-05T19:00'));
const UNUSED = report(0, null, 0, null);

const ids = { '/h/.claude-9': 'in-use', '/h/.claude-3': 'second', '/h/.claude-2': 'work', '/h/.claude': 'in-use' };

function make(answers) {
  const calls = [];
  const heard = [];
  const usage = new AccountUsage({
    bin: () => '/somewhere/claude',
    env: () => ({ PATH: '/bin' }),
    run: (_b, _a, opts, cb) => { const who = opts.env.CLAUDE_CONFIG_DIR; calls.push(who); cb(null, answers[who] ?? ''); },
    now: () => T,
    identity: (profile) => (ids[profile] ? { accountUuid: ids[profile] } : null),
    onReading: (profile) => heard.push(profile),
  });
  return { usage, calls, heard };
}

const shown = (out) => out.map((r) => [r.profile, r.limits?.map((l) => l.percent) ?? null]);

describe('two subscriptions with the same numbers', () => {
  it('the reported case: neither is shown, and each says why', async () => {
    const { usage } = make({ '/h/.claude-9': IN_USE, '/h/.claude-3': IN_USE_A_MINUTE_EARLIER, '/h/.claude-2': UNUSED });
    const out = await usage.readAll(['/h/.claude-9', '/h/.claude-3', '/h/.claude-2']);
    expect(shown(out)).toEqual([['/h/.claude-9', null], ['/h/.claude-3', null], ['/h/.claude-2', [0, 0]]]);
    expect(out[0].error).toMatch(/matched another account exactly/);
    expect(out[1].unconfirmed).toBe(true);
  });

  it('the readings are not kept, so the next look reads both again, and neither is handed on', async () => {
    const { usage, calls, heard } = make({ '/h/.claude-9': IN_USE, '/h/.claude-3': IN_USE });
    await usage.readAll(['/h/.claude-9', '/h/.claude-3']);
    await usage.readAll(['/h/.claude-9', '/h/.claude-3']);
    expect(calls).toHaveLength(4);
    expect(heard).toEqual([]);
  });

  it('must NOT hide two accounts that really differ', async () => {
    const { usage } = make({ '/h/.claude-9': IN_USE, '/h/.claude-3': SECOND });
    expect(shown(await usage.readAll(['/h/.claude-9', '/h/.claude-3']))).toEqual([['/h/.claude-9', [46, 59]], ['/h/.claude-3', [39, 6]]]);
  });

  it('must NOT hide two accounts with the same percentages and different resets', async () => {
    const { usage } = make({ '/h/.claude-9': IN_USE, '/h/.claude-3': report(46, at('10-30T22:40'), 59, at('11-05T19:00')) });
    expect(shown(await usage.readAll(['/h/.claude-9', '/h/.claude-3']))).toEqual([['/h/.claude-9', [46, 59]], ['/h/.claude-3', [46, 59]]]);
  });

  it('must NOT hide two accounts nobody has used yet: 0% and no reset is what every fresh account says', async () => {
    const { usage } = make({ '/h/.claude-3': UNUSED, '/h/.claude-2': UNUSED });
    expect(shown(await usage.readAll(['/h/.claude-3', '/h/.claude-2']))).toEqual([['/h/.claude-3', [0, 0]], ['/h/.claude-2', [0, 0]]]);
  });

  it('must NOT hide one subscription signed into two folders, which is meant to read the same', async () => {
    const { usage } = make({ '/h/.claude-9': IN_USE, '/h/.claude': IN_USE });
    expect(shown(await usage.readAll(['/h/.claude-9', '/h/.claude']))).toEqual([['/h/.claude-9', [46, 59]], ['/h/.claude', [46, 59]]]);
  });

  it('a percentage two apart is not the same reading', async () => {
    const { usage } = make({ '/h/.claude-9': IN_USE, '/h/.claude-3': report(44, at('10-30T23:00'), 59, at('11-01T21:00')) });
    expect(shown(await usage.readAll(['/h/.claude-9', '/h/.claude-3'])).map(([, l]) => l)).toEqual([[46, 59], [44, 59]]);
  });
});
