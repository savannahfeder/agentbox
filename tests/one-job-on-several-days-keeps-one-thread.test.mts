// A duty can only be daily or weekly, so a job "every two days" is saved as
// four weekly duties with the same words, one per day. Each found its job's
// thread by its own duty id only, so while Monday's run sat queued, Wednesday,
// Thursday and Saturday each made a new run of the same job. Measured on the
// store, 2026-11-22: three such copies of one look back were queued behind the
// first (w-4c224612bca7, w-04fc78c06b6c, w-bd77644fa786), each to reread the
// same days, ahead of nine bugs the person had filed.
import { describe, it, expect } from 'vitest';
import { planWakes, teammateLabel, DEFAULT_LIMIT } from '../shared/teammates.mts';

const NOW = new Date(2026, 10, 18, 7, 5).getTime(); // a Wednesday
const HOUR = 3_600_000;
const JOB = 'Look back over two days of threads and fix the worst';
const t = {
  id: 't-lookback', name: 'Look-back lead', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [],
  duties: [
    { id: 'd-mon', what: JOB, every: 'week', on: 1, at: ['07:00'] },
    { id: 'd-wed', what: JOB, every: 'week', on: 3, at: ['07:00'] },
  ],
  dutyServed: { 'd-mon': '2026-11-16T07:00', 'd-wed': '2026-11-11T07:00' },
};
const chat = { messages: [], seen: new Set(), into: new Map() };
const monday = (over = {}) => ({
  id: 'w-monday', product: 'kestrel', title: JOB, status: 'open', createdAt: NOW - 48 * HOUR,
  labels: ['founder', teammateLabel(t.id), 'hop:0', 'duty:d-mon'], wrote: {}, ...over,
});
const plan = (items, who = t) => planWakes({ teammates: [who], chat, items, now: NOW });
const runs = (acts) => acts.filter((a) => a.type === 'run');
const dues = (acts) => acts.filter((a) => a.type === 'due');
const served = { type: 'dutyServed', teammate: t.id, duty: 'd-wed', key: '2026-11-18T07:00' };

describe('one job saved on several days keeps one thread', () => {
  it("while Monday's run of the job is queued, Wednesday's slot makes no second run", () => {
    const acts = plan([monday({ start: 'later' })]);
    expect(runs(acts)).toEqual([]);
    expect(dues(acts)).toEqual([]);
    expect(acts).toContainEqual(served);
  });

  it("while Monday's run is at work, Wednesday's slot leaves it alone", () => {
    const acts = plan([monday({ status: 'claimed' })]);
    expect(runs(acts)).toEqual([]);
    expect(dues(acts)).toEqual([]);
  });

  it("once Monday's run has finished, Wednesday's slot is brought to that thread", () => {
    const done = monday({ status: 'done', result: 'Fixed two.', wrote: { result: { ts: NOW - 40 * HOUR, source: 'agent' }, status: { ts: NOW - 40 * HOUR, source: 'agent' } } });
    const acts = plan([done]);
    expect(runs(acts)).toEqual([]);
    expect(dues(acts)).toEqual([expect.objectContaining({ item: 'w-monday', duty: 'd-wed' })]);
  });

  it('a duty with other words is another job and still gets a run of its own', () => {
    const other = { ...t, duties: [t.duties[0], { ...t.duties[1], what: 'Read the security scan' }] };
    const acts = plan([monday({ start: 'later' })], other);
    expect(runs(acts)).toEqual([expect.objectContaining({ trigger: expect.objectContaining({ duty: 'd-wed' }) })]);
  });
});
