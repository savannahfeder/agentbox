// A LIMIT THAT HAS RESET STOPS SAYING "AT ITS LIMIT".
//
// What broke: the Accounts page said "At its limit. It rejoins on its own when
// the limit resets." about a second Claude login two days after that limit had
// reset. The saved supervisor state showed why: the login's trouble read
// "You've hit your weekly limit · resets 12pm", filed at 5:07pm on Oct 7, with
// its cooldown long since over. Trouble was only ever cleared by a session
// SURVIVING on the account, and she had picked the other account to run, so no
// session would ever start there again and the sentence was stuck for good.
//
// The fix: a limit that names when it resets is believed until then and no
// longer. Each pass of the fleet drops a limit whose reset moment has gone by.
// A limit with no reset in it, and anything that needs a person, still waits
// for a session to survive.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const WEEKLY = "You've hit your weekly limit · resets 12pm (America/Los_Angeles)";
const NO_HOUR = "You've hit your session limit";
const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const CODEX_DATED = "You've hit your usage limit. Upgrade to Pro or try again at Oct 12th, 2026 1:05 PM.";

// Local wall-clock moments, so the tests mean the same thing in any timezone.
const at = (day, h, m = 0) => new Date(2026, 9, day, h, m, 0).getTime();

let root;
let sup;

const start = (extra = {}) => new Supervisor(
  { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default', '/second'], ...extra },
  { listItems: () => [], listProducts: () => [] },
  '/nonexistent-app',
);

const deadOnArrival = (words, profile = 'default', engine) => ({
  itemId: 'w-test', product: 'agentbox', profile, engine,
  startedAt: Date.now() - 2_000,
  tail: [`stderr: ${words}`, 'session exited (1)'],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(7, 17, 7));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-limit-stale-'));
  sup = start();
});

afterEach(() => {
  try { sup.stop?.(); } catch {}
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a limit with a reset moment is believed until then and no longer', () => {
  it('her case: the weekly limit read at 5:07pm is gone by 12:01pm the next day', () => {
    sup.noteExitForBackoff(deadOnArrival(WEEKLY));
    expect(sup._profileTrouble.default?.cause).toBe('at-limit');

    vi.setSystemTime(at(8, 12, 1));
    sup._forgetResetLimits();
    expect(sup._profileTrouble.default).toBeUndefined();
    expect(sup._healthyProfiles()).toContain('default');
  });

  it('the minute before the reset it is still at its limit', () => {
    sup.noteExitForBackoff(deadOnArrival(WEEKLY));
    vi.setSystemTime(at(8, 11, 59));
    sup._forgetResetLimits();
    expect(sup._profileTrouble.default?.cause).toBe('at-limit');
  });

  it('even when nothing has run on that account since, because she picked the other one', () => {
    sup.noteExitForBackoff(deadOnArrival(WEEKLY));
    // Her hand lifted the cooldown long before the reset; that alone must not
    // read as the limit having reset.
    sup.liftBrakeForHer();
    vi.setSystemTime(at(7, 20, 0));
    sup._forgetResetLimits();
    expect(sup._profileTrouble.default?.cause).toBe('at-limit');
    vi.setSystemTime(at(9, 20, 1));
    sup._forgetResetLimits();
    expect(sup._profileTrouble.default).toBeUndefined();
  });

  it('a record saved before the reset moment was kept is read from its own words and time', () => {
    fs.writeFileSync(path.join(root, '.zero-supervisor.json'), JSON.stringify({
      profileTrouble: { default: { since: at(5, 22, 9), at: at(7, 17, 7), cause: 'at-limit', raw: WEEKLY } },
      profileCooldown: { default: 0 },
    }));
    const loaded = start();
    expect(loaded._profileTrouble.default?.cause).toBe('at-limit');
    vi.setSystemTime(at(9, 20, 1));
    loaded._forgetResetLimits();
    expect(loaded._profileTrouble.default).toBeUndefined();
    loaded.stop?.();
  });

  it('a Codex limit that names a day is kept until that day', () => {
    sup.noteExitForBackoff(deadOnArrival(CODEX_DATED, 'default', 'codex'));
    expect(sup._profileTrouble['codex:default']?.cause).toBe('at-limit');
    vi.setSystemTime(at(12, 13, 0));
    sup._forgetResetLimits();
    expect(sup._profileTrouble['codex:default']?.cause).toBe('at-limit');
    vi.setSystemTime(at(12, 13, 6));
    sup._forgetResetLimits();
    expect(sup._profileTrouble['codex:default']).toBeUndefined();
  });

  it('the pass the fleet runs does it, so the Accounts page reads the truth', async () => {
    sup.noteExitForBackoff(deadOnArrival(WEEKLY));
    vi.setSystemTime(at(9, 20, 1));
    await sup.tick();
    expect(sup._profileTrouble.default).toBeUndefined();
  });
});

describe('what time cannot mend stays', () => {
  it('a limit with no reset in it waits for a session to survive, as before', () => {
    sup.noteExitForBackoff(deadOnArrival(NO_HOUR));
    vi.setSystemTime(at(12, 9, 0));
    sup._forgetResetLimits();
    expect(sup._profileTrouble.default?.cause).toBe('at-limit');
  });

  it('a signed-out login is never forgotten by the clock', () => {
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, '/second'));
    vi.setSystemTime(at(12, 9, 0));
    sup._forgetResetLimits();
    expect(sup._profileTrouble['/second']?.cause).toBe('signed-out');
  });

  it('a limit hit again after the reset is filed again with the new reset', () => {
    sup.noteExitForBackoff(deadOnArrival(WEEKLY));
    vi.setSystemTime(at(8, 12, 5));
    sup._forgetResetLimits();
    sup.noteExitForBackoff(deadOnArrival(WEEKLY));
    expect(sup._profileTrouble.default?.cause).toBe('at-limit');
    vi.setSystemTime(at(9, 11, 59));
    sup._forgetResetLimits();
    expect(sup._profileTrouble.default?.cause).toBe('at-limit');
  });
});
