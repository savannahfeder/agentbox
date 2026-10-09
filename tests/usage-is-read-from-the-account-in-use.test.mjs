// USAGE IS READ FROM THE ACCOUNT IN USE.
//
// WHAT WAS WRONG, 2026-10-08: the Claude Code page said "No usage reading yet"
// under two signed-in accounts, the second marked In use. The reader ran
// `claude -p /usage` with no CLAUDE_CONFIG_DIR, so it always asked the DEFAULT
// login, never the one she picked. Measured on her Mac with Claude Code
// 2.1.293: the default login (at its limit) printed no limit lines at all and
// its structured report carried `rate_limits: null`, so the panel stayed empty
// for good. The same command with CLAUDE_CONFIG_DIR set to the account in use
// printed "Current session: 24% used", "Current week (all models): 4% used".
//
// WHAT CAN SILENTLY BREAK, which is what the cases below are:
//
//   1. The reading runs on the wrong login again (no CLAUDE_CONFIG_DIR, or one
//      inherited from the app's own environment).
//   2. She switches account and the old account's numbers stay on screen,
//      under the new account's name, for up to five minutes.
//   3. A failed reading on one account holds off the other for half an hour.
//   4. A Mac where nobody picked an account changes behaviour (it must still
//      read the default login, as it always did).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClaudeUsage, STALE_MS } from '../main/claude-usage.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const OUT = 'Current session: 24% used · resets Oct 8 at 10:40pm\nCurrent week (all models): 4% used · resets Oct 15 at 4pm\n';
const OTHER = 'Current session: 90% used · resets Oct 8 at 10:40pm\n';

function reader({ account, answer = () => OUT, clock = { t: 1_000 } }) {
  const calls = [];
  const usage = new ClaudeUsage({
    bin: () => '/somewhere/claude',
    account,
    run: (_b, _a, opts, cb) => { calls.push(opts); cb(null, answer(opts)); },
    now: () => clock.t,
    where: () => '/tmp/x',
  });
  return { usage, calls, clock };
}

const at = (dir) => ({ profile: dir, env: { PATH: '/bin', CLAUDE_CONFIG_DIR: dir } });
const home = { profile: 'default', env: { PATH: '/bin' } };

describe('the usage reader', () => {
  it('runs Claude Code under the account it is handed', () => {
    const { usage, calls } = reader({ account: () => at('/h/.claude-2') });
    usage.read();
    expect(calls).toHaveLength(1);
    expect(calls[0].env.CLAUDE_CONFIG_DIR).toBe('/h/.claude-2');
    expect(usage.read().limits[0].percent).toBe(24);
  });

  it('runs the default login with no CLAUDE_CONFIG_DIR at all', () => {
    const { usage, calls } = reader({ account: () => home });
    usage.read();
    expect(calls[0].env).toEqual({ PATH: '/bin' });
    expect('CLAUDE_CONFIG_DIR' in calls[0].env).toBe(false);
  });

  it('drops the old reading the moment the account changes, and reads the new one at once', () => {
    let who = home;
    const { usage, calls } = reader({ account: () => who, answer: (o) => (o.env.CLAUDE_CONFIG_DIR ? OUT : OTHER) });
    expect(usage.read().limits[0].percent).toBe(90);
    who = at('/h/.claude-2');
    // Well inside STALE_MS: the old figure is fresh, but it is not this account's.
    const next = usage.read();
    expect(calls).toHaveLength(2);
    expect(calls[1].env.CLAUDE_CONFIG_DIR).toBe('/h/.claude-2');
    expect(next.limits[0].percent).toBe(24);
  });

  it('never shows one account\'s figure while the other\'s is still being read', () => {
    let who = home;
    let pending = null;
    const usage = new ClaudeUsage({
      bin: () => '/somewhere/claude',
      account: () => who,
      run: (_b, _a, opts, cb) => { if (opts.env.CLAUDE_CONFIG_DIR) pending = cb; else cb(null, OTHER); },
      now: () => 1_000,
      where: () => '/tmp/x',
    });
    expect(usage.read().limits[0].percent).toBe(90);
    who = at('/h/.claude-2');
    expect(usage.read()).toBe(null);
    expect(usage.peek()).toBe(null);
    pending(null, OUT);
    expect(usage.read().limits[0].percent).toBe(24);
  });

  it('a failed reading on one account does not hold off the other', () => {
    let who = home;
    const { usage, calls } = reader({ account: () => who, answer: (o) => (o.env.CLAUDE_CONFIG_DIR ? OUT : 'nothing useful') });
    expect(usage.read()).toBe(null);
    who = at('/h/.claude-2');
    expect(usage.read().limits[0].percent).toBe(24);
    expect(calls).toHaveLength(2);
  });

  it('a failed reading still waits before asking the SAME account again', () => {
    const { usage, calls, clock } = reader({ account: () => home, answer: () => 'nothing useful' });
    usage.read();
    clock.t += STALE_MS + 1;
    usage.read();
    expect(calls).toHaveLength(1);
  });

  it('does not read again while the same account\'s figure is fresh', () => {
    const { usage, calls, clock } = reader({ account: () => at('/h/.claude-2') });
    usage.read();
    clock.t += STALE_MS - 1;
    usage.read();
    expect(calls).toHaveLength(1);
    clock.t += 2;
    usage.read();
    expect(calls).toHaveLength(2);
  });
});

describe('which account the supervisor says is in use', () => {
  let tmp, second;
  const login = (dir, uuid) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: uuid, emailAddress: `${uuid}@example.com` } }));
  };
  const make = (extra = {}) => {
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default', second], ...extra }, store, tmp);
    sup._saveState = () => {};
    return sup;
  };
  const saved = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-usage-account-'));
    second = path.join(tmp, '.claude-2');
    login(path.join(tmp, '.claude'), 'own');
    login(second, 'second');
    // The app's own environment must never decide which login is read.
    process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'somewhere-else');
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('is the one she picked', () => {
    const { profile, env } = make({ activeAccount: { claude: second } }).usageAccount();
    expect(profile).toBe(second);
    expect(env.CLAUDE_CONFIG_DIR).toBe(second);
  });

  it('is the default login when she has not picked, with no CLAUDE_CONFIG_DIR', () => {
    const { profile, env } = make().usageAccount();
    expect(profile).toBe('default');
    expect('CLAUDE_CONFIG_DIR' in env).toBe(false);
  });

  it('is the default login when the pick names an account that is gone', () => {
    const { profile, env } = make({ activeAccount: { claude: path.join(tmp, '.claude-gone') } }).usageAccount();
    expect(profile).toBe('default');
    expect('CLAUDE_CONFIG_DIR' in env).toBe(false);
  });

  it('carries no API key into the reading', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    try {
      expect('ANTHROPIC_API_KEY' in make({ activeAccount: { claude: second } }).usageAccount().env).toBe(false);
    } finally { delete process.env.ANTHROPIC_API_KEY; }
  });
});
