// A QUEUED THREAD PUT OFF STAYS IN PROGRESS UNTIL ITS RUN ENDS, AND IS
// COUNTED IN ONE TAB.
//
// What broke, 2026-11-20 (power test, four testers on one team): with three
// threads queued and "This computer is running all it can, 3 waiting" under
// In progress, a tester put one queued thread off with L, In 4 hours. It
// showed in Later, the waiting count stayed at 3, and the thread was still
// in In progress too. Later only moves when you see a thread, never what an
// agent does (main/store.mts snoozeItem), so the queued run still starts and
// 3 waiting was true. The Later list left out a thread a session or the ship
// queue had, and not one queued for a run, so the same thread was counted in
// two tabs.
//
// The person's own definition (tests/a-waiting-thread-is-in-later-never-in-progress):
// "In progress is either running or queued", "Later is things happening
// later". So a put-off thread with a run on it or coming is In progress, as a
// working one already was, and goes to Later when the run ends.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { belongsInProgress, putOffInLater } from '../renderer/src/list-rules.ts';

const NOW = 1_790_000_000_000;
const LATER = NOW + 4 * 3_600_000;

const putOff = {
  id: 'w-runbook', status: 'open', kind: 'task', labels: ['founder'], title: 'Write the runbook',
  createdAt: NOW - 600_000, updatedAt: NOW - 60_000,
  snoozedUntil: LATER, wrote: { snoozedUntil: { ts: NOW - 60_000, source: 'founder' } },
};

const tabs = (i, run: { live?: boolean; queued?: boolean }) => ({
  progress: belongsInProgress(i, { now: NOW, live: !!run.live }),
  later: putOffInLater(i, { hiddenUntil: i.snoozedUntil ?? 0, now: NOW, waitingOn: [], runOnIt: !!run.live || !!run.queued }),
});

describe('a thread put off with L', () => {
  it('while it waits its turn for a run, it is In progress and not Later', () => {
    expect(tabs(putOff, { queued: true })).toEqual({ progress: true, later: false });
  });

  it('while its agent is working, it is In progress and not Later, as before', () => {
    expect(tabs(putOff, { live: true })).toEqual({ progress: true, later: false });
  });

  it('once its run has answered, it is in Later until the time it was put off to', () => {
    const answered = { ...putOff, result: 'The runbook is in docs/runbook.md.', wrote: { ...putOff.wrote, result: { ts: NOW - 1000, source: 'agent' } } };
    expect(tabs(answered, {})).toEqual({ progress: false, later: true });
  });

  it('after that time it is in neither', () => {
    expect(putOffInLater(putOff, { hiddenUntil: putOff.snoozedUntil, now: LATER + 1, waitingOn: [], runOnIt: false })).toBe(false);
  });
});

describe('a queued thread nobody put off', () => {
  it('is In progress and not Later', () => {
    const queued = { ...putOff, snoozedUntil: 0, wrote: {} };
    expect(tabs(queued, { queued: true })).toEqual({ progress: true, later: false });
  });
});

describe('the window', () => {
  it('counts a queued thread as having a run on it when it fills Later', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const call = app.match(/putOffInLater\(i, \{[^}]*\}\)/)?.[0] ?? '';
    expect(call).toMatch(/runOnIt:[^}]*queuedIds\.has\(i\.id\)/);
  });
});
