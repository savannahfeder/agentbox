// AGENTS START WHEN HER LIMIT RESETS, NOT HALF AN HOUR LATER, AND HER OWN
// "CONTINUE" OR RESUME IS NEVER HELD BEHIND A TIMER.
//
// The shape, as the supervisor state shows it: the default account's cooldown
// runs a fixed thirty minutes past the moment the limit was hit, though the
// CLI had printed an earlier reset time on the very line the app read the
// cause from. And the fleet-wide brake (one minute doubling to thirty)
// returns at the top of every tick, so a reply and both resume commands
// queued behind it with nothing able to lift it early. Two fixes, pinned here:
//
//   1. A limit that names its reset hour holds the fleet until THAT hour (plus
//      a short grace), never a fixed thirty minutes and never the doubling.
//   2. Her own hand (a reply, Resume, reopening a row) lifts the brake and any
//      cooldown that time alone would end. A login that needs a PERSON stays
//      out, because retrying it cannot help.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { limitResetMoment } from '../shared/spawn-trouble.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const HER_LIMIT = "You've hit your session limit · resets 6:50pm (America/Los_Angeles)";
const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';

// Local wall-clock moments on one day, so the tests mean the same thing in any
// timezone the suite runs in.
const at = (h, m = 0, s = 0, day = 22) => new Date(2026, 8, day, h, m, s).getTime();

describe('reading the reset hour as a moment', () => {
  it('her line at 6:33pm resets at 6:50pm the same evening', () => {
    expect(limitResetMoment(HER_LIMIT, at(18, 33))).toBe(at(18, 50));
  });

  it('an hour with no minutes, and the "resets at" wording', () => {
    expect(limitResetMoment('resets 6pm', at(17, 10))).toBe(at(18, 0));
    expect(limitResetMoment('Your weekly limit resets at 4pm', at(9, 0))).toBe(at(16, 0));
  });

  it('an hour already past today means tomorrow, not the past', () => {
    expect(limitResetMoment('resets 6pm', at(18, 33))).toBe(at(18, 0, 0, 23));
  });

  it('the boundary either side of the reset minute', () => {
    expect(limitResetMoment(HER_LIMIT, at(18, 49, 59))).toBe(at(18, 50));
    // Read at the reset minute itself, the reset IS now, not tomorrow.
    expect(limitResetMoment(HER_LIMIT, at(18, 50))).toBe(at(18, 50));
  });

  it('12am is midnight and 12pm is noon', () => {
    expect(limitResetMoment('resets 12am', at(23, 0))).toBe(at(0, 0, 0, 23));
    expect(limitResetMoment('resets 12pm', at(11, 0))).toBe(at(12, 0));
  });

  it('a line with no hour in it gives no moment', () => {
    expect(limitResetMoment("You've hit your session limit", at(18, 33))).toBeNull();
    expect(limitResetMoment(SIGNED_OUT, at(18, 33))).toBeNull();
    expect(limitResetMoment('', at(18, 33))).toBeNull();
    expect(limitResetMoment(null, at(18, 33))).toBeNull();
  });
});

let root;
let sup;

const start = () => new Supervisor(
  { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
  { listItems: () => [], listProducts: () => [] },
  '/nonexistent-app',
);

const deadOnArrival = (words, profile = 'default') => ({
  itemId: 'w-test', product: 'agentbox', profile,
  startedAt: Date.now() - 2_000,
  tail: [`stderr: ${words}`, 'session exited (1)'],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(18, 33, 52));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-limit-reset-'));
  sup = start();
});

afterEach(() => {
  try { sup.stop?.(); } catch {}
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a limit with a reset hour holds the fleet until that hour and no longer', () => {
  it('a 6:33pm limit: the fleet is running again by 6:51pm, not 7:03pm', () => {
    sup.noteExitForBackoff(deadOnArrival(HER_LIMIT));
    expect(sup._spawnBraked()).toBe(true);

    vi.setSystemTime(at(18, 49));
    expect(sup._spawnBraked()).toBe(true);
    expect(sup._profileResting('default')).toBe(true);

    vi.setSystemTime(at(18, 51));
    expect(sup._spawnBraked()).toBe(false);
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  it('a long streak of limit deaths still ends at the reset, not at thirty minutes', () => {
    for (let i = 0; i < 6; i++) sup.noteExitForBackoff(deadOnArrival(HER_LIMIT));
    vi.setSystemTime(at(18, 51));
    expect(sup._spawnBraked()).toBe(false);
    expect(sup._profileResting('default')).toBe(false);
  });

  it('a limit far away does not let the fleet hammer it after one minute', () => {
    sup.noteExitForBackoff(deadOnArrival("You've hit your weekly limit · resets 4pm (America/Los_Angeles)"));
    vi.setSystemTime(at(19, 30));
    expect(sup._spawnBraked()).toBe(true);
    vi.setSystemTime(at(16, 1, 0, 23));
    expect(sup._spawnBraked()).toBe(false);
  });

  it('a death with no hour in it keeps the old one-minute backoff', () => {
    sup.noteExitForBackoff(deadOnArrival("You've hit your session limit"));
    vi.setSystemTime(at(18, 34, 30));
    expect(sup._spawnBraked()).toBe(true);
    vi.setSystemTime(at(18, 35, 0));
    expect(sup._spawnBraked()).toBe(false);
  });
});

describe('her own hand lifts what time alone would lift', () => {
  it('liftBrakeForHer clears the brake and a limited account at once', () => {
    sup.noteExitForBackoff(deadOnArrival(HER_LIMIT));
    for (let i = 0; i < 3; i++) sup.noteExitForBackoff(deadOnArrival("You've hit your session limit"));
    vi.setSystemTime(at(18, 40));
    expect(sup._hasSlotFor('claude')).toBe(false);

    sup.liftBrakeForHer();
    expect(sup._spawnBraked()).toBe(false);
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  // WITH THE OTHER LOGIN AT ITS LIMIT THERE IS NOWHERE FOR THE WORK TO GO, so
  // both get a try. This used to hold the signed-out login back on the grounds
  // that the capped one was working, which w-4338a63da6 showed it is not: her
  // hand lifts a sign-in and never a limit. A login she may just have signed
  // into is the better of two bad tries, and the capped one is only lifted
  // here because nothing else on the Mac can run at all.
  it('a signed-out login gets its try when the only other login is capped', () => {
    const two = new Supervisor(
      { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default', '/second'] },
      { listItems: () => [], listProducts: () => [] },
      '/nonexistent-app',
    );
    two.noteExitForBackoff(deadOnArrival(SIGNED_OUT, '/second'));
    two.noteExitForBackoff(deadOnArrival(HER_LIMIT, 'default'));
    two.liftBrakeForHer();
    expect(two._profileResting('default')).toBe(false);
    expect(two._profileResting('/second')).toBe(false);
    two.stop?.();
  });

  // A SECOND LOGIN NO LONGER HOLDS THE CAPPED ONE DOWN (w-dac993a554). It did
  // while work rotated across a person's subscriptions, because then the other
  // login really was where the next spawn would go. Work runs on one account
  // now: the capped account is still the account, so her hand buys one try on
  // it, and the one try is the guard against a reset hour read wrong.
  it('lifts a capped login for her whether or not a second one is signed in', () => {
    const two = new Supervisor(
      { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default', '/second'] },
      { listItems: () => [], listProducts: () => [] },
      '/nonexistent-app',
    );
    two.noteExitForBackoff(deadOnArrival(HER_LIMIT, 'default'));
    expect(two._profileResting('default')).toBe(true);
    two.liftBrakeForHer();
    expect(two._profileResting('default')).toBe(false);
    expect(two._pickProfile('claude')).toBe('default');
    two.stop?.();
  });

  it('Resume on a named row spawns it now, through the brake', () => {
    const item = { id: 'w-hers', product: 'agentbox', status: 'open', answer: 'continue' };
    sup.store = { listItems: () => [item], listProducts: () => [], answerItem: () => {} };
    const spawned = [];
    sup.spawnWorker = (i) => spawned.push(i.id);
    sup.noteExitForBackoff(deadOnArrival(HER_LIMIT));
    vi.setSystemTime(at(18, 40));

    const out = sup.resumeItems(['w-hers']);
    expect(out.resumed).toBe(1);
    expect(spawned).toEqual(['w-hers']);
  });

  it('Resume stopped agents lifts the brake too', () => {
    sup.store = { listItems: () => [], listProducts: () => [], answerItem: () => {} };
    sup.tick = async () => {};
    sup.noteExitForBackoff(deadOnArrival(HER_LIMIT));
    vi.setSystemTime(at(18, 40));
    sup.resumeStopped();
    expect(sup._spawnBraked()).toBe(false);
  });

  it('nothing she did: the brake stays on until the reset', () => {
    sup.noteExitForBackoff(deadOnArrival(HER_LIMIT));
    vi.setSystemTime(at(18, 40));
    sup.wake();
    expect(sup._spawnBraked()).toBe(true);
  });
});

// Her reply ("continue") is the path she actually used. The IPC handlers need
// Electron to run, so, as elsewhere in this suite, they are read as source:
// each handler she drives must lift the brake before it wakes the fleet.
describe('the handlers she drives lift the brake before they wake the fleet', () => {
  const ipc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'main', 'ipc.mjs'), 'utf8');
  const handler = (name) => {
    const from = ipc.indexOf(`ipcMain.handle('${name}'`);
    return ipc.slice(from, ipc.indexOf('ipcMain.handle(', from + 10));
  };

  for (const name of ['zero:answer', 'zero:reopen', 'zero:redeliver']) {
    it(`${name} lifts it`, () => {
      const body = handler(name);
      expect(body.length).toBeGreaterThan(0);
      const lift = body.indexOf('liftBrakeForHer');
      expect(lift).toBeGreaterThan(-1);
      const go = Math.max(body.indexOf('wake()'), body.indexOf('tick?.()'));
      expect(lift).toBeLessThan(go);
    });
  }

  it('stopping a row does not: a stop is not "run this now"', () => {
    expect(handler('zero:stop-session')).not.toContain('liftBrakeForHer');
  });
});
