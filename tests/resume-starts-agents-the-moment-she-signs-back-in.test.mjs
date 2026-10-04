// RESUME STARTS HER AGENTS THE MOMENT SHE SIGNS BACK IN, NOT HALF AN HOUR LATER.
//
// What broke, 2026-10-04: Claude Code signed itself out. Every agent died on
// arrival, and the one login on the Mac was parked for thirty minutes as
// "signed-out". She signed back in, selected every row, chose Resume, then
// typed "continue" on a row, and nothing moved: every row sat "queued".
// Measured off ~/Zero/.zero-supervisor.json: the default login's trouble was
// written at 11:30:29, its cooldown ran to 12:00:29, and the first worker
// process started at 12:01:21. Nothing she did in between could lift it,
// because `liftBrakeForHer` skipped any login whose cause needs a person, on
// the theory that retrying cannot help. Once she HAS been the person, it can,
// and her Resume is how she says so.
//
// The rule now: her own hand lifts a login that needs a person when no other
// login on the same engine could run. Where another one is working, the dead
// one stays out, exactly as before, because the work is moving and handing it
// to a login that may still be signed out costs her a row for nothing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const NO_HOME = '/nonexistent-home-with-no-second-account';
const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const ORG_BLOCKED = 'Your organization has disabled Claude Code';
const AT_LIMIT = "You've hit your session limit";

let root;
const made = [];

const supervisor = (authProfiles = ['default'], extra = {}) => {
  const s = new Supervisor(
    { home: NO_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles, ...extra },
    { listItems: () => [], listProducts: () => [] },
    '/nonexistent-app',
  );
  made.push(s);
  return s;
};

const deadOnArrival = (words, profile = 'default', engine) => ({
  itemId: 'w-test', product: 'agentbox', profile, engine,
  startedAt: Date.now() - 2_000,
  tail: [`stderr: ${words}`, 'session exited (1)'],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 4, 11, 30, 29));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-signed-back-in-'));
});

afterEach(() => {
  for (const s of made.splice(0)) { try { s.stop?.(); } catch {} }
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('her one login signed out, and she has signed back in', () => {
  it('the case she reported: Resume lifts the login at once', () => {
    const sup = supervisor();
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    // Inside the five-minute bench a signed-out login now earns on its own.
    vi.setSystemTime(new Date(2026, 9, 4, 11, 33));
    expect(sup._hasSlotFor('claude')).toBe(false);

    sup.liftBrakeForHer();
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._spawnBraked()).toBe(false);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  it('Resume on the rows she selected spawns them now instead of queuing them', () => {
    const sup = supervisor();
    const rows = ['w-a', 'w-b'].map((id) => ({ id, product: 'agentbox', status: 'open', answer: 'continue' }));
    sup.store = { listItems: () => rows, listProducts: () => [], answerItem: () => {} };
    const spawned = [];
    sup.spawnWorker = (i) => spawned.push(i.id);
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    // Inside the five-minute bench a signed-out login now earns on its own.
    vi.setSystemTime(new Date(2026, 9, 4, 11, 33));

    const out = sup.resumeItems(['w-a', 'w-b']);
    expect(out).toMatchObject({ resumed: 2, queued: 0 });
    expect(spawned).toEqual(['w-a', 'w-b']);
  });

  it('an organization that switched Claude Code off and back on is the same', () => {
    const sup = supervisor();
    sup.noteExitForBackoff(deadOnArrival(ORG_BLOCKED));
    sup.liftBrakeForHer();
    expect(sup._profileResting('default')).toBe(false);
  });

  it('every login signed out at once: all of them are tried again', () => {
    const sup = supervisor(['default', '/second']);
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, 'default'));
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, '/second'));
    sup.liftBrakeForHer();
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._profileResting('/second')).toBe(false);
  });

  it('a working Codex login does not keep a signed-out Claude login out: they are different engines', () => {
    const sup = supervisor(['default']);
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, 'default'));
    expect(sup.engineTrouble('codex')).toBeNull();
    sup.liftBrakeForHer();
    expect(sup._profileResting('default')).toBe(false);
  });

  it('still signed out after all: the next death parks it again on the spot', () => {
    const sup = supervisor();
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    sup.liftBrakeForHer();
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    expect(sup._profileResting('default')).toBe(true);
  });
});

describe('where another login is working, the signed-out one stays out', () => {
  it('a healthy second login keeps the work moving on its own', () => {
    const sup = supervisor(['default', '/second']);
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, '/second'));
    sup.liftBrakeForHer();
    expect(sup._profileResting('/second')).toBe(true);
    expect(sup._profileResting('default')).toBe(false);
  });

  it('a second login merely at its limit counts as working, because her hand lifts that too', () => {
    const sup = supervisor(['default', '/second']);
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, '/second'));
    for (let i = 0; i < 3; i++) sup.noteExitForBackoff(deadOnArrival(AT_LIMIT, 'default'));
    sup.liftBrakeForHer();
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._profileResting('/second')).toBe(true);
  });

  it('nothing she did: a signed-out login stays parked', () => {
    const sup = supervisor();
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    // Inside the five-minute bench a signed-out login now earns on its own.
    vi.setSystemTime(new Date(2026, 9, 4, 11, 33));
    sup.wake();
    expect(sup._profileResting('default')).toBe(true);
  });
});

describe('the same rule for a Codex login', () => {
  it('her only Codex login, signed out, is lifted by her hand', () => {
    const sup = supervisor();
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, 'default', 'codex'));
    expect(sup._profileResting('codex:default')).toBe(true);
    sup.liftBrakeForHer();
    expect(sup._profileResting('codex:default')).toBe(false);
  });

  it('a second working Codex login keeps the signed-out one out', () => {
    const sup = supervisor(['default'], { codexProfiles: ['default', '/codex-2'] });
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, 'default', 'codex'));
    sup.liftBrakeForHer();
    expect(sup._profileResting('codex:default')).toBe(true);
  });
});
