// A REPLY TRIES A CAPPED LOGIN ONCE, NOT WITH EVERY WAITING THREAD.
//
// 2026-11-09, the Mac's one Claude login hit its weekly limit (resets Nov 12).
// A reply lifts the login's rest so it gets one try, in case the reset hour
// was read wrong. But the lift opened the login to every queued reply at once:
// the run logs show 15 threads started on the Mac within 5 s at 23:28 UTC and
// 15 more at 23:50, every one died about 35 s later on "You've hit your weekly
// limit", and the Mac was already tight on memory. The fix: the first start on
// a lifted limit rests the login again until that run lives three minutes
// (the login has room) or dies on the limit.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const WEEKLY = "You've hit your weekly limit · resets Nov 12 at 11am (America/Los_Angeles)";

let root;
let sup;

const deadOn = (words, startedAt = Date.now() - 2_000) => ({
  itemId: 'w-dead', product: 'agentbox', profile: 'default', startedAt,
  tail: [`stderr: ${words}`, 'session exited (1)'],
});

const startOn = (itemId) => {
  const session = { itemId, product: 'agentbox', profile: 'default', engine: 'claude', startedAt: Date.now(), tail: [] };
  sup.sessions.set(itemId, session);
  sup._spendLimitTry('claude', 'default', session);
  return session;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T23:28:00Z'));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-limit-try-'));
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 6, authProfiles: ['default'] },
    { listItems: () => [], listProducts: () => [] },
    '/nonexistent-app',
  );
  sup.noteExitForBackoff(deadOn(WEEKLY));
});

afterEach(() => {
  try { sup.stop?.(); } catch {}
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a reply on a login at its weekly limit', () => {
  it('opens the login for one start', () => {
    expect(sup._liveProfilesFor('claude')).toEqual([]);
    sup.liftBrakeForHer();
    expect(sup._liveProfilesFor('claude')).toEqual(['default']);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  it('rests the login again the moment that start is made, so the second waits', () => {
    sup.liftBrakeForHer();
    startOn('w-first');
    expect(sup._liveProfilesFor('claude')).toEqual([]);
    expect(sup._profileResting('default')).toBe(true);
    expect(sup._hasSlotFor('claude')).toBe(false);
  });

  it('a second reply while the try is running does not open a second try', () => {
    sup.liftBrakeForHer();
    startOn('w-first');
    sup.liftBrakeForHer();
    expect(sup._liveProfilesFor('claude')).toEqual([]);
  });

  it('a try that dies on the limit leaves the login resting to its reset', () => {
    sup.liftBrakeForHer();
    const first = startOn('w-first');
    vi.setSystemTime(new Date('2026-11-09T23:28:35Z'));
    sup.sessions.delete('w-first');
    sup.noteExitForBackoff({ ...deadOn(WEEKLY, first.startedAt), itemId: 'w-first' });
    sup._noticeLimitTryLived();
    expect(sup._profileResting('default')).toBe(true);
    vi.setSystemTime(new Date('2026-11-10T03:00:00Z'));
    sup._noticeLimitTryLived();
    expect(sup._liveProfilesFor('claude')).toEqual([]);
  });

  it('a try still running at three minutes opens the login for everyone', () => {
    sup.liftBrakeForHer();
    startOn('w-first');
    vi.setSystemTime(new Date('2026-11-09T23:30:59Z'));
    sup._noticeLimitTryLived();
    expect(sup._liveProfilesFor('claude')).toEqual([]);
    vi.setSystemTime(new Date('2026-11-09T23:31:01Z'));
    sup._noticeLimitTryLived();
    expect(sup._liveProfilesFor('claude')).toEqual(['default']);
    expect(sup._profileTrouble.default).toBeUndefined();
    expect(sup._hasSlotFor('claude')).toBe(true);
  });
});

describe('what the one-try rule leaves alone', () => {
  it('a start on a login with no limit on file does not rest it', () => {
    sup._clearProfileTrouble('default');
    startOn('w-first');
    expect(sup._liveProfilesFor('claude')).toEqual(['default']);
  });

  it('a start while the login is still resting (no lift) changes nothing', () => {
    const before = sup._profileCooldown.default;
    startOn('w-first');
    expect(sup._profileCooldown.default).toBe(before);
    expect(sup._limitTries?.size ?? 0).toBe(0);
  });

  it('choosing the account in Settings still opens it whole', () => {
    sup.accountChosen('claude', 'default');
    startOn('w-first');
    startOn('w-second');
    expect(sup._liveProfilesFor('claude')).toEqual(['default']);
  });
});
