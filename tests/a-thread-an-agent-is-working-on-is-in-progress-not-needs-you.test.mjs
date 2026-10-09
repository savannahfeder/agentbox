// A thread an agent is working on right now is In progress, never Needs you.
//
// Reported 2026-10-06 with a screenshot: Needs you held a row wearing the
// turning mark, the app's own sign that a session is on it. The row was
// w-ac7f0c0cbb. Its ship had failed, the app woke its agent, and the agent
// wrote `blocked` (ledger ts 1791336268178) while its session was still
// writing its last message; the screenshot was filed 40 seconds later with the
// session still up. `belongsInInbox` answers true for every blocked row, and
// `belongsInProgress` false, so for as long as that session lived the row sat
// in Needs you saying "working". The same window opens whenever a worker sets
// done, or leaves its answer on an open row, before its session exits.
//
// The supervisor's list of running sessions is the fact here, not the status:
// a session that is up IS something working on the thread, so the thread is in
// In progress until it exits, and then the status decides as it always did.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { belongsInInbox, belongsInProgress, belongsOnTheRail } from '../renderer/src/list-rules';

const NOW = 1_791_336_308_000;

// Shaped as the fold hands them over (shared/work-items.mjs).
const blockedByItsAgent = (extra) => ({
  id: 'w-ac7f0c0cbb', status: 'blocked', kind: 'bug', labels: ['bug'],
  title: 'The agent reads questions sent while it works but never answers them',
  updatedAt: NOW, answer: 'Option 1: Ship it (recommended)', answeredThrough: NOW - 600_000,
  wrote: { status: { ts: NOW - 40_000, source: 'agent' } }, ...extra,
});
const herAskDone = (extra) => ({
  id: 'w-1', status: 'done', kind: 'directive', labels: ['founder'], title: 'her ask',
  result: 'the answer', updatedAt: NOW,
  wrote: { status: { ts: NOW - 5_000, source: 'agent' }, result: { ts: NOW - 5_000, source: 'agent' } }, ...extra,
});
const herAskAnsweredOpen = (extra) => ({
  id: 'w-2', status: 'open', kind: 'directive', labels: ['founder'], title: 'her ask',
  result: 'the answer', updatedAt: NOW,
  wrote: { result: { ts: NOW - 5_000, source: 'agent' } }, ...extra,
});

const inbox = (i, live) => belongsInInbox(i, { now: NOW, live });
const progress = (i, live) => belongsInProgress(i, { now: NOW, live });

describe('a thread with a session on it is in progress', () => {
  it('the reported row: blocked by its agent while that agent is still running', () => {
    expect(inbox(blockedByItsAgent(), true)).toBe(false);
    expect(progress(blockedByItsAgent(), true)).toBe(true);
  });

  it('her ask its agent has set done, before the session exits', () => {
    expect(inbox(herAskDone(), true)).toBe(false);
    expect(progress(herAskDone(), true)).toBe(true);
  });

  it('her ask its agent has answered and left open, before the session exits', () => {
    expect(inbox(herAskAnsweredOpen(), true)).toBe(false);
    expect(progress(herAskAnsweredOpen(), true)).toBe(true);
  });

  it('a row an agent parked with a moment, while the session that parked it is up', () => {
    const parked = blockedByItsAgent({ status: 'open', runAt: NOW + 3_600_000, wrote: { runAt: { ts: NOW, source: 'agent' } } });
    expect(inbox(parked, true)).toBe(false);
    expect(progress(parked, true)).toBe(true);
  });

  it('is still on the rail, so the thread mask counts it as somewhere she can see', () => {
    expect(belongsOnTheRail(blockedByItsAgent(), { now: NOW, live: true })).toBe(true);
  });
});

describe('the moment the session exits, the status decides again', () => {
  it('a blocked row with nobody on it is back in Needs you', () => {
    expect(inbox(blockedByItsAgent(), false)).toBe(true);
    expect(progress(blockedByItsAgent(), false)).toBe(false);
  });

  it('as is her finished ask, and her answered open ask', () => {
    expect(inbox(herAskDone(), false)).toBe(true);
    expect(progress(herAskDone(), false)).toBe(false);
    expect(inbox(herAskAnsweredOpen(), false)).toBe(true);
    expect(progress(herAskAnsweredOpen(), false)).toBe(false);
  });

  it('and leaving live out reads as nothing running, which is every caller that has no supervisor', () => {
    expect(belongsInInbox(blockedByItsAgent(), { now: NOW })).toBe(true);
    expect(belongsInProgress(blockedByItsAgent(), { now: NOW })).toBe(false);
  });
});

describe('a session does not pull in what nothing is starting', () => {
  it('a thread added to Later and not started stays in Later', () => {
    const held = herAskAnsweredOpen({ result: undefined, start: 'later' });
    expect(progress(held, true)).toBe(false);
    expect(inbox(held, true)).toBe(false);
  });
});

describe('the window hands the running sessions to both lists', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('Needs you, In progress and the rail all read the same live set', () => {
    // Needs you takes it out ahead of its team branches, which never reach
    // belongsInInbox and so could not honour `live` there.
    // The app's ship queue may sit between them: a row it still owes a ship
    // is out of Needs you for the same reason (w-0c1ba766eb).
    expect(app).toMatch(/const inboxCandidates = [\s\S]{0,600}if \(liveIds\.has\(i\.id\)\) return false;\s*(\/\/[^\n]*\n\s*)*(if \(shippingIds\.has\(i\.id\)\) return false;\s*)?if \(owedAnAnswer/);
    expect(app).toMatch(/belongsInProgress\(i, \{[^}]*live: liveIds\.has\(i\.id\)/);
    expect(app).toMatch(/belongsOnTheRail\(i, \{[^}]*live: liveIds\.has\(i\.id\)/);
  });
});
