// THREADS HELD ON A USAGE LIMIT STAYED HELD AFTER A MOVE TO A PLAN WITH ROOM.
//
// Reported 2026-10-20 (w-79511c83bc): every Claude login hit its limit, so the
// person upgraded a plan, switched to it, and had usage again. The threads
// they had already resumed still read "Claude Code is at its usage limit, so
// this starts on its own when it resets at 4:30pm".
//
// Measured on a supervisor with two capped logins: a limit benches its login,
// and with no login left the whole fleet, until the reset it printed. A
// resume before the upgrade died on the old plan and benched it again. After
// that nothing could lift it early: "Switch to this account" saved the choice
// and lifted nothing, the plan Claude Code writes to the login's
// `.claude.json` was never compared, and the chosen login kept its old limit
// mark, so a reply whose chat lived on the other capped login stayed there.
// `_waitingOnLimit` held every row until the printed reset.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { setWorkspaceSetting } from '../main/settings.mjs';
import { forgetDiscovery } from '../main/account-discovery.mjs';

// The line Claude Code prints, with a reset three hours from now on this
// machine's clock, so the bench is real wherever the suite runs.
const later = new Date(Date.now() + 3 * 3_600_000);
const LIMIT = `You've hit your session limit · resets ${later.getHours() % 12 || 12}:${String(later.getMinutes()).padStart(2, '0')}${later.getHours() < 12 ? 'am' : 'pm'}`;

// The fields Claude Code 2.1.305 writes under `oauthAccount`, read off its own
// login and profile code. The rest of the file is rewritten all day.
const account = (over = {}) => ({
  accountUuid: 'uuid-first',
  emailAddress: 'first@example.com',
  organizationUuid: 'org-first',
  organizationType: 'claude_max',
  organizationRateLimitTier: 'default_claude_max_5x',
  billingType: 'stripe_subscription',
  hasExtraUsageEnabled: false,
  ...over,
});

// Each write gets its own modification time: two inside one clock tick would
// share one and the cached read would not see the second.
let stamped = Date.now();
const writeLogin = (file, oauthAccount, rest = {}) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ numStartups: 1, ...rest, oauthAccount }));
  const t = new Date(stamped += 2_000);
  fs.utimesSync(file, t, t);
};

let home;
let SECOND;
const defaultFile = () => path.join(home, '.claude.json');
const secondFile = () => path.join(SECOND, '.claude.json');

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'upgraded-plan-'));
  SECOND = path.join(home, '.claude-second');
  writeLogin(defaultFile(), account());
  writeLogin(secondFile(), account({ accountUuid: 'uuid-second', emailAddress: 'second@example.com', organizationUuid: 'org-second' }));
  forgetDiscovery();
});

const supervisor = (authProfiles = ['default', SECOND]) => {
  const s = Object.create(Supervisor.prototype);
  s.config = { home, appDir: home, authProfiles, codexProfiles: ['default'], maxConcurrentSessions: 3 };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._fruitless = {};
  s.sessions = new Map();
  s._saveState = () => {};
  s._engineFor = () => 'claude';
  s.wake = vi.fn();
  return s;
};

// A signed-in `.claude-*` folder joins the rotation on its own, so a Mac with
// one login has no second folder at all.
const oneLogin = () => {
  fs.rmSync(SECOND, { recursive: true, force: true });
  forgetDiscovery();
  return supervisor(['default']);
};

const hitTheLimit = (s, profile = 'default') => s.noteExitForBackoff({
  engine: 'claude', profile, startedAt: Date.now() - 300_000,
  result: LIMIT, resultIsError: true, tail: [],
});

const ROW = { id: 'w-1', product: 'p', status: 'open' };
const held = (s) => s._waitingOnLimit([ROW])[ROW.id] ?? null;
const switchTo = (s, profile) => setWorkspaceSetting(
  { config: s.config, supervisor: s, store: null },
  { key: 'activeAccount', value: { engine: 'claude', profile } },
);

describe('the shape that was reported', () => {
  it('every capped login holds the thread, and the fleet, until the printed reset', () => {
    const s = supervisor();
    hitTheLimit(s);
    hitTheLimit(s, SECOND);
    expect(held(s)).toMatchObject({ tool: 'Claude Code' });
    expect(s._spawnCooldownUntil).toBeGreaterThan(Date.now());
  });
});

describe('switching to an account in Settings gives it a try now', () => {
  it('lets the held threads go when the chosen account was capped too', () => {
    const s = supervisor();
    hitTheLimit(s);
    hitTheLimit(s, SECOND);
    switchTo(s, SECOND);
    expect(held(s)).toBe(null);
    expect(s._profileTrouble[SECOND]).toBeUndefined();
    expect(s._profileResting(SECOND)).toBe(false);
    expect(s._spawnCooldownUntil).toBe(0);
    expect(s.wake).toHaveBeenCalled();
  });

  it('moves a reply whose chat is on the old capped login to the chosen one', () => {
    const s = supervisor();
    hitTheLimit(s);
    hitTheLimit(s, SECOND);
    expect(s._profileCannotHoldAChat('default', 'claude')).toBe(false);
    switchTo(s, SECOND);
    expect(s._profileCannotHoldAChat('default', 'claude')).toBe(true);
  });

  it('wakes a fresh thread that died on the old login', () => {
    const s = supervisor();
    hitTheLimit(s);
    hitTheLimit(s, SECOND);
    s._fruitless['p:w-1'] = { runs: 1, endedAt: Date.now(), founderAt: 0, account: 'default' };
    expect(s.restingUntil(ROW)).toBeGreaterThan(Date.now());
    switchTo(s, SECOND);
    expect(s.restingUntil(ROW)).toBe(0);
  });

  // THE CASE THAT MUST NOT MATCH: the login left behind is still out of
  // usage, and nothing done to it says otherwise.
  it('leaves the limit on the account not chosen', () => {
    const s = supervisor();
    hitTheLimit(s);
    hitTheLimit(s, SECOND);
    switchTo(s, SECOND);
    expect(s._profileTrouble.default?.cause).toBe('at-limit');
    expect(s._profileResting('default')).toBe(true);
  });

  it('touches no other account when the chosen one already had room', () => {
    const s = supervisor();
    hitTheLimit(s);
    switchTo(s, SECOND);
    expect(held(s)).toBe(null);
    expect(s._profileTrouble.default?.cause).toBe('at-limit');
    expect(s._profileResting('default')).toBe(true);
  });

  it('lifts nothing when the choice is cleared', () => {
    const s = supervisor();
    hitTheLimit(s);
    hitTheLimit(s, SECOND);
    switchTo(s, null);
    expect(held(s)).toMatchObject({ tool: 'Claude Code' });
    expect(s._profileResting(SECOND)).toBe(true);
  });
});

describe('a login whose plan changes on disk is let back in', () => {
  it('lets the threads go when the login writes a bigger plan', () => {
    const s = oneLogin();
    hitTheLimit(s);
    expect(held(s)).not.toBe(null);
    writeLogin(defaultFile(), account({ organizationRateLimitTier: 'default_claude_max_20x' }));
    expect(s._forgetLimitsOfAnOldPlan()).toBe(true);
    expect(held(s)).toBe(null);
    expect(s._profileTrouble.default).toBeUndefined();
    expect(s._spawnCooldownUntil).toBe(0);
  });

  it('lets them go when extra usage is switched on', () => {
    const s = oneLogin();
    hitTheLimit(s);
    writeLogin(defaultFile(), account({ hasExtraUsageEnabled: true }));
    expect(s._forgetLimitsOfAnOldPlan()).toBe(true);
    expect(held(s)).toBe(null);
  });

  it('lets them go when the folder is signed in as another account', () => {
    const s = oneLogin();
    hitTheLimit(s);
    writeLogin(defaultFile(), account({ accountUuid: 'uuid-third', emailAddress: 'third@example.com', organizationUuid: 'org-third' }));
    expect(s._forgetLimitsOfAnOldPlan()).toBe(true);
    expect(held(s)).toBe(null);
  });

  // THE CASE THAT MUST NOT MATCH. Claude Code rewrites this file on every
  // start and every profile refresh; none of that is a new plan.
  it('holds them when Claude Code rewrites the file for its own reasons', () => {
    const s = oneLogin();
    hitTheLimit(s);
    writeLogin(defaultFile(), { ...account(), profileFetchedAt: Date.now(), displayName: 'First' }, { numStartups: 40, projects: { '/x': {} } });
    expect(s._forgetLimitsOfAnOldPlan()).toBe(false);
    expect(held(s)).not.toBe(null);
  });

  it('lifts nothing while the file is half written', () => {
    const s = oneLogin();
    hitTheLimit(s);
    fs.writeFileSync(defaultFile(), '{"oauthAccount":{"accountUuid":"uu');
    expect(s._forgetLimitsOfAnOldPlan()).toBe(false);
    expect(held(s)).not.toBe(null);
  });

  it('takes the plan of a limit filed before plans were kept from today, then watches it', () => {
    const s = oneLogin();
    hitTheLimit(s);
    delete s._profileTrouble.default.plan;
    expect(s._forgetLimitsOfAnOldPlan()).toBe(false);
    expect(held(s)).not.toBe(null);
    writeLogin(defaultFile(), account({ organizationRateLimitTier: 'default_claude_max_20x' }));
    expect(s._forgetLimitsOfAnOldPlan()).toBe(true);
  });

  it('holds them again when the new plan is out of usage too', () => {
    const s = oneLogin();
    hitTheLimit(s);
    writeLogin(defaultFile(), account({ organizationRateLimitTier: 'default_claude_max_20x' }));
    s._forgetLimitsOfAnOldPlan();
    hitTheLimit(s);
    expect(s._forgetLimitsOfAnOldPlan()).toBe(false);
    expect(held(s)).not.toBe(null);
  });

  it('leaves a signed-out login to the sign-in watch', () => {
    const s = oneLogin();
    s.noteExitForBackoff({
      engine: 'claude', profile: 'default', startedAt: Date.now() - 1_000,
      result: 'Failed to authenticate: OAuth session expired', resultIsError: true, tail: [],
    });
    writeLogin(defaultFile(), account({ organizationRateLimitTier: 'default_claude_max_20x' }));
    expect(s._forgetLimitsOfAnOldPlan()).toBe(false);
    expect(s._profileTrouble.default?.cause).toBe('signed-out');
  });

  it('is asked on every pass', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/async _tick\(\) \{[\s\S]{0,1500}this\._forgetLimitsOfAnOldPlan\(\)/);
  });
});
