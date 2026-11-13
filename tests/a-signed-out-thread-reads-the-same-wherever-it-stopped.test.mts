// TWO TASKS ON A SIGNED-OUT COMPUTER READ AS TWO DIFFERENT THINGS (F-210).
//
// A tester's home had lost both sign-ins. They filed two tasks a minute apart.
// The first ran, died on the sign-out, and went to Needs you as Stopped. The
// second was never started, so it sat in In progress as Signed out and its
// thread said to open a terminal and type /login, while the banner over the
// inbox offered Sign in to Claude and Sign in to ChatGPT buttons. Same cause,
// two lists, two words and three fixes. Measured on main 157f64dd, shots
// b014-08 and b014-09, Nov 11 2026.
//
// Now a signed-out thread is in Needs you whichever way it got there, its
// status reads Signed out, and while the sign-in bar is up its line points at
// that bar.
import { describe, it, expect } from 'vitest';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules.ts';
import { factsFor, statusCell } from '../renderer/src/status-word.ts';
import { liveLine } from '../renderer/src/live-line.ts';
import { stoppedIds } from '../renderer/src/fleet.ts';
import { planBar } from '../renderer/src/plan-setup.ts';

const NOW = Date.parse('2026-11-11T23:50:00Z');
const MIN = 60_000;

const thread = (over = {}) => ({
  id: 'w-2', product: 'word-wrap', status: 'open', kind: 'task', title: 'Add isPalindrome(str)',
  labels: ['founder'], priority: 3, epoch: 0, claim: null,
  createdAt: NOW - 5 * MIN, updatedAt: NOW - 5 * MIN,
  ...over,
});

// The first task: its run died, and the app wrote its own sentence on it.
const ran = thread({
  id: 'w-1', title: 'Add a wordCount(str) function with a test', epoch: 1,
  result: 'Claude Code could not sign in, so nothing has been done on this task. Sign that account back in and it picks straight up.',
  wrote: { result: { ts: NOW - 4 * MIN, source: 'agent' } },
});
const neverRan = thread();

const fleet = (over = {}) => ({ queued: ['w-2'], runNow: [], stalled: [], signInNeeded: { 'w-1': 'Claude Code', 'w-2': 'Claude Code' }, atLimit: {}, ...over });

describe('which list a signed-out thread is in', () => {
  it('counts every thread waiting on a sign-in as stopped', () => {
    expect([...stoppedIds({ stalled: ['w-9'], signInNeeded: { 'w-2': 'Codex' } })].sort()).toEqual(['w-2', 'w-9']);
  });

  it('puts the one that never ran in Needs you, beside the one that did', () => {
    const stopped = stoppedIds(fleet());
    for (const t of [ran, neverRan]) {
      expect(belongsInInbox(t, { now: NOW, stopped: stopped.has(t.id) })).toBe(true);
      expect(belongsInProgress(t, { now: NOW, stopped: stopped.has(t.id) })).toBe(false);
    }
  });

  // The case that must not match: a queued thread on a signed-in computer.
  it('leaves a thread that is only waiting its turn in In progress', () => {
    const stopped = stoppedIds(fleet({ signInNeeded: {} }));
    expect(belongsInProgress(neverRan, { now: NOW, stopped: stopped.has('w-2') })).toBe(true);
  });
});

describe('what a signed-out thread says', () => {
  it('gives both the same word', () => {
    const f = fleet();
    expect(statusCell(ran, { ...factsFor(f, 'w-1'), now: NOW }).word).toBe('Signed out');
    expect(statusCell(neverRan, { ...factsFor(f, 'w-2'), now: NOW }).word).toBe('Signed out');
  });

  it('points at the sign-in bar while it is up, on both, out of In progress', () => {
    const f = fleet({ signInBar: true });
    for (const t of [ran, neverRan]) {
      expect(liveLine(t, { ...factsFor(f, t.id), inProgress: false, now: NOW })?.line)
        .toBe('Claude Code is signed out. Sign in to Claude at the top of your inbox, and this starts on its own.');
    }
    expect(liveLine(neverRan, { ...factsFor(fleet({ signInBar: true, signInNeeded: { 'w-2': 'Codex' } }), 'w-2'), now: NOW })?.line)
      .toBe('Codex is signed out. Sign in to ChatGPT at the top of your inbox, and this starts on its own.');
  });

  // With another agent signed in there is no bar to point at, so the
  // terminal is still the way back.
  it('keeps the terminal sign-in when there is no bar', () => {
    expect(liveLine(neverRan, { ...factsFor(fleet(), 'w-2'), now: NOW })?.line)
      .toBe('Claude Code is signed out. Open a terminal, run claude, and type /login, and this starts on its own.');
  });

  it('says nothing about signing in on a thread that is not waiting on one', () => {
    expect(liveLine(neverRan, { ...factsFor(fleet({ signInNeeded: {} }), 'w-2'), inProgress: false, now: NOW })).toBe(null);
  });
});

describe('the bar says the same thing Settings does', () => {
  it('asks for a sign-in when both agents are here and signed out', () => {
    expect(planBar([
      { engine: 'claude', found: true, signedIn: false, certain: true },
      { engine: 'codex', found: true, signedIn: false, certain: true },
    ])?.say).toBe('Agents cannot start until you sign in to your Claude or ChatGPT plan.');
  });
});
