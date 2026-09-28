// What a repeating task's row and its run log SAY.
//
// A rule is not a work item, which is what keeps it out of the inbox and out of
// In Progress with no predicate anywhere. What it does get is one row and one
// log, and both have to be honest: the row about when it next runs and how the
// last one went, the log about what it cannot know.

import { describe, it, expect } from 'vitest';
import { repeatRow } from '../renderer/src/components/List';
import { runLog } from '../renderer/src/components/RepeatFocus';

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const NOW = at(2026, 8, 12, 10);

const rule = (over = {}) => ({
  id: 'r-abc1234567', product: 'agentbox', productName: 'Harbour',
  title: 'Every day at 9am, run onboarding QA',
  every: 'day', at: '09:00', createdAt: at(2026, 8, 1, 9),
  served: '2026-08-12', misses: 0, alerted: 0,
  lastOccurrence: 'r-abc1234567-20260812', ...over,
});

const run = (key, over = {}) => {
  const [y, m, d] = key.split('-').map(Number);
  return {
    id: `r-abc1234567-${key.replace(/-/g, '')}`,
    labels: ['founder', 'repeat:r-abc1234567'],
    status: 'done',
    createdAt: at(y, m, d, 9, 3),
    updatedAt: at(y, m, d, 9, 14),
    ...over,
  };
};
const cleanRun = (key, over = {}) => run(key, { labels: ['founder', 'repeat:r-abc1234567', 'clean'], ...over });

describe('the repeating row', () => {
  it('says when it runs next', () => {
    expect(repeatRow(rule(), null, NOW).when).toMatch(/9:00/);
    expect(repeatRow(rule(), null, NOW).when).toMatch(/tomorrow/);
    expect(repeatRow(rule(), null, at(2026, 8, 12, 8)).when).toMatch(/today/);
  });

  it('says how the last run went', () => {
    expect(repeatRow(rule(), cleanRun('2026-08-12'), NOW).last).toMatch(/clean/);
    const news = run('2026-08-12', { result: 'email verification took 41 seconds' });
    expect(repeatRow(rule(), news, NOW).last).toMatch(/41 seconds/);
    expect(repeatRow(rule(), news, NOW).last).not.toMatch(/clean/);
  });

  it('says a run is going rather than reporting it as finished', () => {
    expect(repeatRow(rule(), run('2026-08-12', { status: 'claimed' }), NOW).last).toMatch(/running/);
  });

  it('says so plainly when it has never run', () => {
    expect(repeatRow(rule({ served: '', lastOccurrence: undefined }), null, NOW).last).toMatch(/not run yet/);
  });

  // A finished run that said nothing at all is not a clean run. It is a run
  // that finished without saying anything, and the row must not flatter it.
  it('does not call an unmarked silent run clean', () => {
    expect(repeatRow(rule(), run('2026-08-12'), NOW).last).not.toMatch(/clean/);
  });
});

describe('the run log', () => {
  const items = [
    cleanRun('2026-08-10'),
    run('2026-08-11', { result: 'email verification took 41 seconds' }),
    cleanRun('2026-08-12'),
    { id: 'w-unrelated', labels: ['founder'], status: 'done', createdAt: at(2026, 8, 12, 8), updatedAt: 1 },
  ];

  it('lists only this rule\'s runs, newest first', () => {
    const log = runLog(rule(), items, NOW);
    expect(log.map((r) => r.id)).toEqual([
      'r-abc1234567-20260812', 'r-abc1234567-20260811', 'r-abc1234567-20260810',
    ]);
  });

  it('marks the run that had news, and only that one', () => {
    const log = runLog(rule(), items, NOW);
    expect(log.map((r) => r.news)).toEqual([false, true, false]);
    expect(log[1].what).toMatch(/41 seconds/);
  });

  it('is empty rather than wrong when nothing has run', () => {
    expect(runLog(rule(), [], NOW)).toEqual([]);
  });

  // It cannot know the laptop was shut. Late can equally mean paused, at
  // capacity, or a failed append, so it states the delay and stops there.
  it('says a run was late without inventing why', () => {
    const late = [cleanRun('2026-08-12', { createdAt: at(2026, 8, 12, 14, 41) })];
    const [row] = runLog(rule(), late, NOW);
    expect(row.late).toMatch(/late/);
    expect(row.late).not.toMatch(/laptop|asleep|shut|paused/i);
  });

  it('does not call an on-time run late', () => {
    const [row] = runLog(rule(), [cleanRun('2026-08-12')], NOW);
    expect(row.late).toBeNull();
  });
});
