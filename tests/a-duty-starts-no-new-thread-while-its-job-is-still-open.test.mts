// A DUTY STARTS NO NEW THREAD WHILE ITS JOB IS STILL OPEN.
//
// A tester teammate's first-job thread was doing its 8am and 4pm loop and sat
// waiting on a question. Every duty slot after that still opened a new thread
// for the same job: three spent a run finding the other thread and closing,
// the fourth ran a 90-minute loop of its own and started four fixers. Measured
// in planWakes: a slot passing with the first-job run open and waiting
// produced a new run. Now a slot that finds the job's thread still open (the
// first-job run, or an earlier run of the same duty still running, queued or
// asking you something) marks itself served and starts nothing.
import { describe, it, expect } from 'vitest';
import { planWakes, teammateLabel, runIdFor, DEFAULT_LIMIT } from '../shared/teammates.mts';

const NOW = new Date(2026, 10, 21, 8, 5).getTime();
const HOUR = 3_600_000;
const t = {
  id: 't-tester', name: 'Collaboration tester', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [],
  duties: [{ id: 'd-loop', what: 'Run the tester loop', every: 'day', at: ['08:00', '16:00'] }], dutyServed: { 'd-loop': '2026-11-20T16:00' },
};
const chat = { messages: [], seen: new Set(), into: new Map() };
const run = (id, over = {}) => ({
  id, product: 'kestrel', title: 'Run', status: 'open', createdAt: NOW - 40 * HOUR,
  labels: ['founder', teammateLabel(t.id), 'hop:0'], ...over,
});
const first = (over = {}) => run(runIdFor(`${t.id}#first`), { title: 'Start on its first job', ...over });
const duty = (id, over = {}) => run(id, { labels: ['founder', teammateLabel(t.id), 'hop:0', 'duty:d-loop'], ...over });
const asking = { status: 'open', result: 'Should I file these as bugs?', wrote: { result: { ts: NOW - 30 * HOUR, source: 'agent' } } };
const plan = (items) => planWakes({ teammates: [t], chat, items, now: NOW });
const runs = (acts) => acts.filter((a) => a.type === 'run');
const served = { type: 'dutyServed', teammate: t.id, duty: 'd-loop', key: '2026-11-21T08:00' };

describe('a duty slot while its job already has a thread open', () => {
  it('starts nothing while the first-job thread waits on your answer, and marks the slot served', () => {
    const acts = plan([first(asking)]);
    expect(runs(acts)).toEqual([]);
    expect(acts).toContainEqual(served);
  });

  it('starts nothing while the first-job thread is still running', () => {
    expect(runs(plan([first({ status: 'claimed' })]))).toEqual([]);
  });

  it('starts nothing while an earlier run of the same duty is running, queued or asking', () => {
    expect(runs(plan([duty('w-a', { status: 'claimed' })]))).toEqual([]);
    expect(runs(plan([duty('w-a', { start: 'later' })]))).toEqual([]);
    expect(runs(plan([duty('w-a', asking)]))).toEqual([]);
    expect(runs(plan([duty('w-a', { status: 'blocked' })]))).toEqual([]);
  });

  it('still fires when the job has no open thread', () => {
    const acts = plan([first({ status: 'done' }), duty('w-a', { status: 'done' })]);
    expect(runs(acts)).toHaveLength(1);
    expect(acts).toContainEqual(served);
  });

  it('still fires past a delivered result that asks nothing', () => {
    const report = { result: 'Ran the loop, all green.', wrote: { result: { ts: NOW - 15 * HOUR, source: 'agent' } } };
    expect(runs(plan([duty('w-a', report)]))).toHaveLength(1);
  });

  it('an open thread of another duty or other work does not hold it, it queues behind', () => {
    const other = run('w-b', { status: 'claimed', labels: ['founder', teammateLabel(t.id), 'hop:0', 'duty:d-other'] });
    const r = runs(plan([other]));
    expect(r).toHaveLength(1);
    expect(r[0].start).toBe('later');
  });
});
