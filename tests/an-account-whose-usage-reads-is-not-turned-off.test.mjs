// AN ACCOUNT WHOSE USAGE READS IS NOT TURNED OFF.
//
// What broke (2026-10-16): Settings said the Gmail login was "Signed in, but its
// organization has turned Claude Code off" on a Mac where that login was on Max
// and working. The mark was filed on 2026-10-11 and nothing ever took it back:
// trouble is cleared only by a session surviving on the account, and the person
// had picked the other account, so nothing ever started on this one. Signing in
// again did not move it either; only "signed out" listens for a login.
// Measured the same day: `claude -p /usage` on that login printed "Current
// session: 100% used", which an account that cannot run never prints.
//
// The fix: a usage reading taken after the mark is filed is proof. Limits came
// back, so the account is signed in and allowed to run; a limit mark goes too
// when nothing in the reading is at 100%.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const ORG_BLOCKED = 'Your organization has disabled Claude subscription access for Claude Code';
const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const AT_LIMIT = "You've hit your session limit · resets 5:09pm";
const T0 = new Date(2026, 9, 11, 15, 0, 0).getTime();
const MIN = 60_000;

let root;
let home;
let second;
let sup;

const deadOnArrival = (words, profile = 'default') => ({
  itemId: 'w-test', product: 'agentbox', profile,
  startedAt: Date.now() - 2_000,
  tail: [`stderr: ${words}`, 'session exited (1)'],
});

const reading = (percents, at = Date.now()) => ({
  at,
  limits: percents.map((percent, i) => ({ span: i ? 'week' : 'session', name: i ? 'This week' : 'This session', percent })),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-usage-proof-'));
  home = path.join(root, 'home');
  second = path.join(home, '.claude-2');
  fs.mkdirSync(second, { recursive: true });
  sup = new Supervisor(
    { home, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default', second] },
    { listItems: () => [], listProducts: () => [] },
    '/nonexistent-app',
  );
});

afterEach(() => {
  try { sup.stop?.(); } catch {}
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a usage reading taken after the mark', () => {
  it('her case: turned off five days ago, reads 100% of a session today, the mark goes', () => {
    sup.noteExitForBackoff(deadOnArrival(ORG_BLOCKED));
    expect(sup._profileTrouble.default.cause).toBe('org-blocked');
    vi.setSystemTime(T0 + 5 * 24 * 60 * MIN);
    expect(sup.noteUsageReading('default', reading([100, 15]))).toBe(true);
    expect(sup._profileTrouble.default).toBeUndefined();
    expect(sup._profileResting('default')).toBe(false);
  });

  it('a signed-out mark goes too', () => {
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    vi.setSystemTime(T0 + MIN);
    sup.noteUsageReading('default', reading([10]));
    expect(sup._profileTrouble.default).toBeUndefined();
  });

  it('a limit goes when nothing in the reading is at 100%', () => {
    sup.noteExitForBackoff(deadOnArrival(AT_LIMIT, second));
    vi.setSystemTime(T0 + MIN);
    sup.noteUsageReading(second, reading([99, 40]));
    expect(sup._profileTrouble[second]).toBeUndefined();
  });

  it('the trouble is saved, so a restart does not bring it back', () => {
    sup.noteExitForBackoff(deadOnArrival(ORG_BLOCKED));
    vi.setSystemTime(T0 + MIN);
    sup.noteUsageReading('default', reading([5]));
    const saved = JSON.parse(fs.readFileSync(path.join(root, '.zero-supervisor.json'), 'utf8'));
    expect(saved.profileTrouble.default).toBeUndefined();
  });
});

describe('what must NOT clear it', () => {
  it('a limit that still reads 100% stays', () => {
    sup.noteExitForBackoff(deadOnArrival(AT_LIMIT, second));
    vi.setSystemTime(T0 + MIN);
    expect(sup.noteUsageReading(second, reading([100, 40]))).toBe(false);
    expect(sup._profileTrouble[second].cause).toBe('at-limit');
  });

  it('a reading with no limits in it is no proof: a blocked account prints none', () => {
    sup.noteExitForBackoff(deadOnArrival(ORG_BLOCKED));
    vi.setSystemTime(T0 + MIN);
    expect(sup.noteUsageReading('default', reading([]))).toBe(false);
    expect(sup._profileTrouble.default.cause).toBe('org-blocked');
  });

  it('a reading taken before the mark was filed is older news', () => {
    sup.noteExitForBackoff(deadOnArrival(ORG_BLOCKED));
    expect(sup.noteUsageReading('default', reading([5], T0 - MIN))).toBe(false);
    expect(sup._profileTrouble.default.cause).toBe('org-blocked');
  });

  it("one account's reading never clears another's mark", () => {
    sup.noteExitForBackoff(deadOnArrival(ORG_BLOCKED));
    vi.setSystemTime(T0 + MIN);
    sup.noteUsageReading(second, reading([5]));
    expect(sup._profileTrouble.default.cause).toBe('org-blocked');
  });

  it('trouble that is not the account, like an old Claude Code, stays', () => {
    sup.noteExitForBackoff(deadOnArrival("error: option '--permission-mode <mode>' argument 'auto' is invalid"));
    expect(sup._profileTrouble.default.cause).toBe('too-old');
    vi.setSystemTime(T0 + MIN);
    sup.noteUsageReading('default', reading([5]));
    expect(sup._profileTrouble.default.cause).toBe('too-old');
  });
});
