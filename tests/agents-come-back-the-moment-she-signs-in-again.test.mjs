// AGENTS COME BACK THE MOMENT SHE SIGNS IN AGAIN, NOT HALF AN HOUR LATER.
//
// 2026-10-04. Her Claude Code login expired at 11:34 and every agent stopped,
// which is fair. What was not: she typed /login, pressed "Resume all agents",
// and replied "continue" on a row, and every row stayed "Queued". Measured off
// her supervisor state at 12:07: `default` carried trouble `signed-out` from
// 33 minutes earlier and its bench had run out 3.4 minutes earlier, which is
// exactly when her agents started moving. Nothing she did had any effect; the
// timer did it all. Four separate holes, each tested below:
//
//   1. Nothing watched for the login coming back. A signed-out account sat out
//      a fixed 30 minutes and was only ever cleared by a session surviving on
//      it, which no session could do while it sat out.
//   2. Her own hand (Resume, a reply) skipped a signed-out account on purpose,
//      on the belief that "retrying it cannot help". It is the only thing that
//      helps, once she has signed in.
//   3. A reply sent while signed out started a run that died in two seconds,
//      and that death was charged to the reply as one of its three attempts.
//      Three of them and the app stopped trying to deliver what she wrote.
//   4. The row said "Queued. An agent starts on it as soon as one is free",
//      which was not true. (The line above the list still waits its twenty
//      minutes on purpose; see a-dead-account-is-not-a-dead-app. The row is
//      where she looks, and it now says "Signed out" and how to fix it.)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { signInFiles, signInStamp } from '../main/sign-in-files.mjs';
import { liveLine, shortWord } from '../renderer/src/live-line.ts';

const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const ORG_BLOCKED = 'Your organization has disabled Claude subscription access for Claude Code';
const T0 = new Date(2026, 9, 4, 11, 34, 0).getTime();
const MIN = 60_000;

let root;
let home;
let sup;

const start = (profiles = ['default']) => new Supervisor(
  { home, storeRoot: root, maxConcurrentSessions: 3, authProfiles: profiles },
  { listItems: () => [], listProducts: () => [] },
  '/nonexistent-app',
);

const deadOnArrival = (words, profile = 'default', extra = {}) => ({
  itemId: 'w-test', product: 'agentbox', profile,
  startedAt: Date.now() - 2_000,
  tail: [`stderr: ${words}`, 'session exited (1)'],
  ...extra,
});

// What /login does, as far as this app may look: the login file's time moves.
const signIn = (file = path.join(home, '.claude.json'), at = Date.now()) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}');
  fs.utimesSync(file, at / 1000, at / 1000);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-sign-in-'));
  home = path.join(root, 'home');
  fs.mkdirSync(home);
  // A login that existed before it expired, written well before the death.
  signIn(path.join(home, '.claude.json'), T0 - 60 * MIN);
  sup = start();
});

afterEach(() => {
  try { sup.stop?.(); } catch {}
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('where a login is written', () => {
  it('names the default login, a second Claude folder, and a Codex home', () => {
    expect(signInFiles({ home: '/h' })).toContain('/h/.claude.json');
    expect(signInFiles({ home: '/h', folder: '/h/.claude-second' })).toContain('/h/.claude-second/.claude.json');
    expect(signInFiles({ engine: 'codex', home: '/h', folder: '/h/.codex' })).toEqual(['/h/.codex/auth.json']);
  });

  it('reads only times, and a missing file is 0 rather than an error', () => {
    expect(signInStamp(['/nowhere/at/all'])).toBe(0);
    expect(signInStamp([path.join(home, '.claude.json')])).toBe(T0 - 60 * MIN);
  });
});

describe('1. a login landing puts the account straight back', () => {
  it('her case: signed out, /login two minutes later, agents can start on the next tick', () => {
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    expect(sup._hasSlotFor('claude')).toBe(false);

    vi.setSystemTime(T0 + 2 * MIN);
    signIn();
    sup._noticeSignIns();
    expect(sup._spawnBraked()).toBe(false);
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  it('must NOT lift when nothing was written: the account stays out', () => {
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    vi.setSystemTime(T0 + 2 * MIN);
    sup._noticeSignIns();
    expect(sup._profileResting('default')).toBe(true);
    expect(sup._hasSlotFor('claude')).toBe(false);
  });

  it('one write buys one try: the same login file does not lift it again after that try fails', () => {
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    vi.setSystemTime(T0 + 2 * MIN);
    signIn();
    sup._noticeSignIns();
    expect(sup._profileResting('default')).toBe(false);
    // The try died too: the write was some other Claude window, not a login.
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    vi.setSystemTime(T0 + 3 * MIN);
    sup._noticeSignIns();
    expect(sup._profileResting('default')).toBe(true);
  });

  it('a second Claude folder is watched in its own folder', () => {
    const second = path.join(home, '.claude-second');
    signIn(path.join(second, '.claude.json'), T0 - 60 * MIN);
    sup = start(['default', second]);
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT, second));
    vi.setSystemTime(T0 + MIN);
    signIn(); // the DEFAULT login moving says nothing about the second one
    sup._noticeSignIns();
    expect(sup._profileResting(second)).toBe(true);
    signIn(path.join(second, '.claude.json'));
    sup._noticeSignIns();
    expect(sup._profileResting(second)).toBe(false);
  });

  it('a Codex login is watched in its CODEX_HOME', () => {
    const codexHome = path.join(home, '.codex');
    signIn(path.join(codexHome, 'auth.json'), T0 - 60 * MIN);
    sup._codexProfileHome = () => codexHome;
    sup._noteProfileTrouble('codex:default', 'Not logged in');
    sup._strikeProfile('codex:default', { hard: true });
    expect(sup._profileResting('codex:default')).toBe(true);
    vi.setSystemTime(T0 + MIN);
    signIn(path.join(codexHome, 'auth.json'));
    sup._noticeSignIns();
    expect(sup._profileResting('codex:default')).toBe(false);
  });

  it('an account an admin switched off is not lifted by a login, which cannot fix it', () => {
    sup.noteExitForBackoff(deadOnArrival(ORG_BLOCKED));
    vi.setSystemTime(T0 + MIN);
    signIn();
    sup._noticeSignIns();
    expect(sup._profileResting('default')).toBe(true);
  });

  it('every tick looks, before the brake can return early', async () => {
    sup.store = { listItems: () => [], listProducts: () => [] };
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    vi.setSystemTime(T0 + 20_000);
    expect(sup._spawnBraked()).toBe(true);
    signIn();
    await sup.tick();
    expect(sup._spawnBraked()).toBe(false);
  });
});

describe('the fallback when no file moves is minutes, not half an hour', () => {
  it('a signed-out account is tried again after five minutes', () => {
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    vi.setSystemTime(T0 + 4 * MIN);
    expect(sup._hasSlotFor('claude')).toBe(false);
    vi.setSystemTime(T0 + 5 * MIN + 1_000);
    expect(sup._spawnBraked()).toBe(false);
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  it('an ambiguous death keeps its old three-strike half hour', () => {
    for (let i = 0; i < 3; i++) sup.noteExitForBackoff(deadOnArrival('something nobody has seen'));
    vi.setSystemTime(T0 + 6 * MIN);
    expect(sup._profileResting('default')).toBe(true);
  });
});

describe('2. her own hand brings a signed-out account back', () => {
  it('Resume or a reply lifts it at once', () => {
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    vi.setSystemTime(T0 + MIN);
    sup.liftBrakeForHer();
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._hasSlotFor('claude')).toBe(true);
  });

  it('but not an account an admin switched off', () => {
    const second = path.join(home, '.claude-second');
    sup = start(['default', second]);
    sup.noteExitForBackoff(deadOnArrival(ORG_BLOCKED, second));
    sup.liftBrakeForHer();
    expect(sup._profileResting(second)).toBe(true);
  });
});

describe('3. a death on a signed-out account is not the reply\'s failure', () => {
  const item = { id: 'w-test', product: 'agentbox', status: 'open', answer: 'continue' };
  const prep = () => {
    sup.store = { listItems: () => [item], listProducts: () => [] };
    sup.spokeOnTheRow = () => false;
    sup.carriedThrough = () => 'continue';
  };

  it('her "continue" is handed back, not spent, however many times it dies that way', () => {
    prep();
    for (let i = 0; i < 5; i++) {
      const s = deadOnArrival(SIGNED_OUT);
      sup.noteExitForBackoff(s);
      expect(sup.settleDelivery(item, 'continue', s, null)).toBe('interrupted');
    }
  });

  it('a usage limit is the account too, so it is handed back as well', () => {
    prep();
    const s = deadOnArrival("You've hit your session limit · resets 6:50pm");
    sup.noteExitForBackoff(s);
    expect(sup.settleDelivery(item, 'continue', s, null)).toBe('interrupted');
  });

  it('must NOT spare an ordinary death: that is still an attempt', () => {
    prep();
    const s = deadOnArrival('something nobody has seen');
    sup.noteExitForBackoff(s);
    expect(sup.settleDelivery(item, 'continue', s, null)).toBe('retrying');
  });

  it('a row rested because its account was out wakes when the account is back', () => {
    const fresh = { id: 'w-fresh', product: 'agentbox', status: 'open', title: 'x' };
    sup.store = { listItems: () => [fresh], listProducts: () => [] };
    const s = deadOnArrival(SIGNED_OUT);
    sup.noteExitForBackoff(s);
    sup.noteFreshRun(fresh, { everRan: true, account: s.accountFault?.account });
    expect(sup.restingUntil(fresh)).toBeGreaterThan(Date.now());
    vi.setSystemTime(T0 + MIN);
    signIn();
    sup._noticeSignIns();
    expect(sup.restingUntil(fresh)).toBe(0);
  });

  it('must NOT wake a row resting for its own reasons', () => {
    const fresh = { id: 'w-fresh', product: 'agentbox', status: 'open', title: 'x' };
    sup.store = { listItems: () => [fresh], listProducts: () => [] };
    sup.noteFreshRun(fresh, { everRan: true });
    expect(sup.restingUntil(fresh)).toBeGreaterThan(Date.now());
  });

  it('a reply is held, not sent, while no account can run it', () => {
    const answered = { id: 'w-test', product: 'agentbox', status: 'open', answer: 'continue' };
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    const given = [];
    sup.redeliverAnswer = (i, a) => given.push(a);
    sup.store = { listItems: () => [answered], listProducts: () => { throw new Error('reached the spawn'); } };
    expect(() => sup.spawnWorker(answered, { continuation: true })).not.toThrow();
    expect(given).toEqual(['continue']);
  });
});

describe('4. the row says it, straight away', () => {
  it('names the rows that are waiting on a sign-in, and which tool', () => {
    sup.noteExitForBackoff(deadOnArrival(SIGNED_OUT));
    const rows = [{ id: 'w-one', product: 'agentbox', status: 'open' }];
    expect(sup._waitingOnSignIn(rows)).toEqual({ 'w-one': 'Claude Code' });
    vi.setSystemTime(T0 + MIN);
    signIn();
    sup._noticeSignIns();
    expect(sup._waitingOnSignIn(rows)).toEqual({});
  });

  it('the row says signed out and how to fix it, instead of "Queued"', () => {
    const row = { id: 'w-one', status: 'open' };
    const live = liveLine(row, { queued: ['w-one'], signInNeeded: { 'w-one': 'Claude Code' }, inProgress: true });
    expect(live.state).toBe('signin');
    expect(shortWord(live.state)).toBe('Signed out');
    expect(live.line).toMatch(/\/login/);
    const codex = liveLine(row, { signInNeeded: { 'w-one': 'Codex' }, inProgress: true });
    expect(codex.line).toMatch(/codex login/);
  });

  it('must NOT touch a row whose tool is signed in: it is still just queued', () => {
    const row = { id: 'w-one', status: 'open' };
    const live = liveLine(row, { queued: ['w-one'], signInNeeded: { 'w-other': 'Claude Code' }, inProgress: true });
    expect(live.state).toBe('queued');
  });
});
