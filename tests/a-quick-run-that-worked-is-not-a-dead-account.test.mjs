// A RUN THAT FINISHED IN TWENTY SECONDS AND SAID SO IS NOT A DYING ACCOUNT.
//
// FOUND 2026-09-07 while writing the harness.
// The proof ran one ordinary Claude Code row, watched it finish cleanly with a
// result on the row, and then could not start a second row at all: _hasSlotFor
// answered false with a load of 0 against a capacity of 3, because the FIRST
// run -- a success -- had armed the fleet-wide spawn brake.
//
// THE MECHANISM. noteExitForBackoff treats any exit inside forty-five seconds
// as a spawn that died on arrival, which is the right instinct: a hit usage
// limit, a bad flag or an untrusted workspace all die in about two seconds, and
// respawning them every tick turns one outage into a hammer (nine dead spawns
// in two minutes, measured). It has always had the fact that tells those apart
// from a run that worked -- a result captured off the CLI's own type "result"
// frame with is_error false, which a signed-out or capped spawn never gets far
// enough to emit -- and its own comment says so in general terms: "a captured
// success result is proof of work, not a limit hit". But the test was personal
// && so that proof was only ever believed for the founder's personal threads.
//
// WHAT IT COSTS ON EVERY OTHER ROW, in the order it bites:
//
//   ONE quick success files trouble against the account, which is what the
//   Accounts screen and engineTrouble read -- so a working subscription
//   reports a problem it does not have.
//   ONE quick success on a single-account Mac arms the fleet-wide brake, one
//   minute doubling to thirty, because _healthyProfiles excludes any account
//   carrying trouble and zero healthy accounts is what the brake is for. That
//   is an old failure from CLAUDE.md in a new costume: agents that keep
//   stopping for no apparent reason.
//   THREE quick successes on one account reach _strikeProfile's third strike
//   and quarantine a HEALTHY subscription for half an hour.
//
// Slash commands are the shape that hits this every day -- they are small by
// design, they are not personal, and _load already treats them as not being
// workers at all.
//
// THE FIX IS TO BELIEVE THE RESULT FRAME FOR EVERY SESSION, which is what the
// comment already claimed. Nothing else about the fast-exit rule moves: a run
// with no result, a run whose result is an error, and a run that took longer
// than the window are all judged exactly as before.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

// A MAC WITH ONE CLAUDE LOGIN, for the reason
// tests/a-dead-account-is-not-a-dead-app.test.mjs gives: a developer running
// the suite with a second subscription signed in would otherwise get twice the
// capacity these tests are about, and the brake would never arm on any machine
// but a one-account one.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';

let root;
let sup;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-quick-run-'));
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: [] },
    { listItems: () => [], listProducts: () => [] },
    '/nonexistent-app',
  );
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

// A session as the exit handler has it: the CLI announced itself, said its
// piece, and exited under its own power well inside the window.
const quickSuccess = (over = {}) => ({
  itemId: 'w-quick',
  product: 'agentbox',
  profile: 'default',
  startedAt: Date.now() - 20_000,
  sessionId: 'a-real-session',
  result: 'filed the review',
  resultIsError: false,
  tail: ['done: filed the review', 'session exited (0)'],
  ...over,
});

describe('a product worker that finished quickly and well', () => {
  it('leaves the account it ran on alone', () => {
    sup.noteExitForBackoff(quickSuccess(), { personal: false });
    expect(sup._profileTrouble?.default).toBeUndefined();
    expect(sup._profileStrikes?.default ?? 0).toBe(0);
  });

  it('does not brake the fleet, so the next row can start', () => {
    sup.noteExitForBackoff(quickSuccess(), { personal: false });
    expect(sup._spawnCooldownUntil ?? 0).toBe(0);
    expect(sup._fastExits ?? 0).toBe(0);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  // The third strike is what takes an account out of the rotation for half an
  // hour, so three quick good runs is the shape that hurts most.
  it('does not quarantine a healthy subscription after three of them', () => {
    for (let i = 0; i < 3; i += 1) sup.noteExitForBackoff(quickSuccess(), { personal: false });
    expect(sup._profileCooldown?.default ?? 0).toBe(0);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  // A command she typed is the commonest quick run there is, and it is not
  // personal.
  it('is the same answer for a slash command on a product row', () => {
    sup.noteExitForBackoff(quickSuccess({ command: true }), { personal: false });
    expect(sup._spawnCooldownUntil ?? 0).toBe(0);
    expect(sup._profileTrouble?.default).toBeUndefined();
  });
});

// THE BOUNDARY EITHER SIDE OF IT. Everything the fast-exit rule was built for
// still lands, because a dying spawn never emits a clean result frame.
describe('and a quick run that did NOT work is still a fast exit', () => {
  it('when the CLI never emitted a result at all', () => {
    sup.noteExitForBackoff(
      quickSuccess({ result: null, resultIsError: undefined, sessionId: null, tail: ['stderr: usage limit reached'] }),
      { personal: false },
    );
    expect(sup._fastExits).toBe(1);
    expect(sup._spawnCooldownUntil).toBeGreaterThan(Date.now());
    expect(sup._lastFastExit?.cause).toBe('at-limit');
  });

  it('when the result it emitted was an error', () => {
    sup.noteExitForBackoff(
      quickSuccess({
        result: 'Failed to authenticate',
        resultIsError: true,
        tail: ['stderr: Failed to authenticate: OAuth session expired and could not be refreshed'],
      }),
      { personal: false },
    );
    expect(sup._fastExits).toBe(1);
    expect(sup._profileTrouble?.default).toBeDefined();
  });

  // AND A KILL OF OURS IS STILL NOT EVIDENCE IN EITHER DIRECTION, which is a
  // separate rule one line above this one and must not be swallowed by it.
  it('and a kill of ours is still counted as nothing', () => {
    sup._fastExits = 3;
    sup._spawnCooldownUntil = Date.now() + 600_000;
    const before = sup._spawnCooldownUntil;
    sup.noteExitForBackoff(quickSuccess({ stoppedByUs: true, result: null }), { personal: false });
    expect(sup._fastExits).toBe(3);
    expect(sup._spawnCooldownUntil).toBe(before);
  });
});

// The behaviour that was already right, kept honest: a personal thread that
// finishes in seconds was the one case this fact was believed for, and it still
// is. A long run is not a fast exit whatever it produced.
describe('what did not change', () => {
  it('a personal thread that finishes in seconds is still fine', () => {
    sup.noteExitForBackoff(quickSuccess(), { personal: true });
    expect(sup._spawnCooldownUntil ?? 0).toBe(0);
    expect(sup._profileTrouble?.default).toBeUndefined();
  });

  it('a long run that produced nothing is still not a fast exit', () => {
    sup.noteExitForBackoff(quickSuccess({ startedAt: Date.now() - 10 * 60_000, result: null }), { personal: false });
    expect(sup._fastExits ?? 0).toBe(0);
    expect(sup._spawnCooldownUntil ?? 0).toBe(0);
  });
});
