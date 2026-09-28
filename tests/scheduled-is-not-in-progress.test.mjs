// A snoozed row is scheduled, not in progress.
//
// There should have been, and capacity was never the reason: the cap is three
// per auth profile and one session was up. She had bulk-snoozed those rows
// (5m, then 10m, then an hour) and THEN answered them. The supervisor gates
// both of its spawn passes on isDue, so it correctly left them alone until
// 21:18; the In progress list did not gate on anything, so it showed them as
// work under way. They were counted in Scheduled at the same moment: one row,
// two tabs, and the tab she trusted was the one that was lying.
//
// Answering does not cancel the schedule, deliberately (approve Friday, run
// Monday at 6am). What it changes is where the row waits.

import { describe, it, expect } from 'vitest';
import { belongsInProgress } from '../renderer/src/list-rules';

const NOW = 1_786_136_280_000;
const HOUR = 3_600_000;

// Shaped as the fold hands them over (shared/work-items.mjs).
const hers = (extra) => ({
  id: 'w-9b799cd1c0', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'a couple of issues that I am observing', updatedAt: NOW, ...extra,
});
const answeredQuestion = (extra) => ({
  id: 'w-a4ef537fa3', status: 'open', kind: 'question', labels: ['gtm', 'landing'],
  title: "Your ad's picture is the page's own hero", answer: 'I would disagree.',
  updatedAt: NOW, ...extra,
});

const at = (i, deferredUntil = 0) => belongsInProgress(i, { deferredUntil, now: NOW });

describe('what is in progress', () => {
  it('holds her own work, waiting its turn', () => {
    expect(at(hers())).toBe(true);
  });

  it('holds an answered question, whose continuation is about to spawn', () => {
    expect(at(answeredQuestion())).toBe(true);
  });

  it('holds a claimed item, which is a worker actually running', () => {
    expect(at(hers({ status: 'claimed' }))).toBe(true);
  });

  it('leaves agent-filed work alone: a proposal waits in the inbox', () => {
    expect(at({ status: 'open', kind: 'task', labels: ['landing'], title: 'a proposal' })).toBe(false);
  });

  it('leaves an unanswered question alone, however hers the product is', () => {
    expect(at({ ...answeredQuestion(), answer: undefined })).toBe(false);
  });

  it('does not count a withdrawn reply as an answer', () => {
    expect(at(answeredQuestion({ answer: '(withdrawn)' }))).toBe(false);
  });
});

// The bug, in the three shapes it reached her.
describe('a deferred row is scheduled, not in progress', () => {
  it('drops her own task while its moment is still ahead', () => {
    expect(at(hers(), NOW + HOUR)).toBe(false);
  });

  it('drops an ANSWERED row that is still deferred (the row she was watching)', () => {
    expect(at(answeredQuestion(), NOW + 20 * 60_000)).toBe(false);
  });

  it('drops a claimed row whose schedule was pushed forward under it', () => {
    // Scheduling forward stops the session (ipc.mjs), but the claim reads as
    // held until its lease lapses, so this window is real.
    expect(at(hers({ status: 'claimed' }), NOW + HOUR)).toBe(false);
  });

  it('takes it back the moment the schedule passes, with no catch-up needed', () => {
    expect(at(answeredQuestion(), NOW - 1)).toBe(true);
    expect(at(answeredQuestion(), NOW - 300 * HOUR)).toBe(true);
  });

  it('treats a schedule of exactly now as arrived, not pending', () => {
    expect(at(hers(), NOW)).toBe(true);
  });

  it('reads runAt 0 as now, not never', () => {
    expect(at(hers(), 0)).toBe(true);
  });
});
