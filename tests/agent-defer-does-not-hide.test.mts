// An agent's deferral brakes workers. It never hides a row from her.
//
// She was right, and the ledger names the writer of each one. Two were agents:
//
// Both agents said in their own notes why. Lantern's: "four sessions ran inside
// 27 minutes, and this one spawned 42 seconds after the previous one finished
// set runAt to stop the respawn loop." A row with no answer and nothing new to
// do respawns a worker every tick forever, and runAt was the only brake in
// reach.
//
// The brake was fine. What it also did was not: `runAt` decided BOTH whether a
// worker starts AND whether the row is her business yet, so an agent could take
// its own question off her screen. The row below is that failure exactly.

import { describe, it, expect } from 'vitest';
import { belongsInInbox, belongsInProgress, parkedByAgent } from '../renderer/src/list-rules';

const NOW = 1_786_480_000_000;   // Tue 2026-08-11, late morning
const HOUR = 3_600_000;
const LATER = NOW + 12 * HOUR;

// Shaped as the fold hands them over (shared/work-items.mjs), including the
// `wrote` map, which is where "who set this field" has always been recorded.
const by = (source, ts = NOW - HOUR) => ({ runAt: { ts, source } });

// The depth-signal row: agent-filed, agent-deferred, and the only thing left on
// it is a decision of hers.
const depthSignal = {
  id: 'w-955909a5b3', status: 'open', kind: 'directive', labels: ['gtm'],
  title: 'Your depth signal is built. And the sign up count was wrong.',
  runAt: LATER, wrote: by('agent'), updatedAt: NOW - HOUR,
};
// Lantern: hers, agent-deferred, waiting 33 days on a decision she has to make.
const lantern = {
  id: 'w-802e11d911', status: 'open', kind: 'directive', labels: ['founder'],
  title: "What's the status of this project?",
  runAt: LATER, wrote: by('agent'), updatedAt: NOW - HOUR,
};
// The one she really did schedule, Monday 5:23pm, for Wednesday 8am.
const fourPages = {
  id: 'w-3b8329d630', status: 'open', kind: 'review', labels: ['gtm'],
  title: 'The four pages are built.',
  runAt: LATER, wrote: by('founder'), updatedAt: NOW - HOUR,
};

const inInbox = (i, hiddenUntil = 0) => belongsInInbox(i, { hiddenUntil, now: NOW });

describe("an agent's deferral", () => {
  it('is recognised as an agent parking the row', () => {
    expect(parkedByAgent(depthSignal, NOW)).toBe(true);
    expect(parkedByAgent(lantern, NOW)).toBe(true);
  });

  it('puts the row in her inbox instead of taking it away', () => {
    // Both of these were in Scheduled and neither should have been.
    expect(inInbox(depthSignal)).toBe(true);
    expect(inInbox(lantern)).toBe(true);
  });

  it('shows a row the old rules would have filed, because an agent downing tools is news', () => {
    // Lantern is her own directive with no answer: without a deferral it lives
    // in In progress, not the inbox. An agent parking it means nothing is going
    // to touch it, so the honest place is in front of her.
    const live = { ...lantern, runAt: 0, wrote: {} };
    expect(inInbox(live)).toBe(false);
    expect(belongsInProgress(live, { deferredUntil: 0, now: NOW })).toBe(true);
    expect(inInbox(lantern)).toBe(true);
  });

  it('still keeps the row out of In progress, because nothing is running on it', () => {
    // The brake is intact: this is what the supervisor gates on, and it is why
    // the agents reached for the field in the first place.
    expect(belongsInProgress(lantern, { deferredUntil: LATER, now: NOW })).toBe(false);
    expect(belongsInProgress(depthSignal, { deferredUntil: LATER, now: NOW })).toBe(false);
  });
});

describe('her own deferral', () => {
  it('hides the row, because that is what she meant by it', () => {
    expect(parkedByAgent(fourPages, NOW)).toBe(false);
    expect(inInbox(fourPages, LATER)).toBe(false);
  });

  it('outranks an agent that wrote the field first', () => {
    // The fold already makes the founder win a field over any agent (`beats`),
    // so a row she scheduled reads as hers however many agents touched it.
    const bothTouched = { ...fourPages, wrote: by('founder', NOW - 60_000) };
    expect(parkedByAgent(bothTouched, NOW)).toBe(false);
  });

  it('comes back on its own once the moment passes', () => {
    const due = { ...fourPages, runAt: NOW - HOUR };
    expect(inInbox(due, NOW - HOUR)).toBe(true);
  });
});

describe('a moment that has already passed', () => {
  it('is not a parked row at all, whoever wrote it', () => {
    expect(parkedByAgent({ ...lantern, runAt: NOW - 1 }, NOW)).toBe(false);
  });

  it('never drags an archived row back out of Done', () => {
    // An agent writing runAt alongside a `done` must not resurrect the row.
    expect(parkedByAgent({ ...lantern, status: 'done' }, NOW)).toBe(false);
  });
});
