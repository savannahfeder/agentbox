// A DUTY WHOSE RESULTS YOU LEAVE UNREAD STOPS, AND SAYS SO.
//
// On 2026-10-27 the person wrote on a teammate's daily proposal: "It's arrived
// in my inbox, I swear to God, four or five times." A duty kept waking, kept
// spending a run, and kept landing in Needs you whether or not anyone had read
// the last one. Grok Bot pauses a routine nobody reads ("This Bot's routines
// kept running without anyone reading the results, so they were paused to
// avoid wasted spend"). Now a duty whose last three results reached you and
// still sit unanswered after a day does not wake again until you answer or
// close one of them, and the teammate's chat says so.
import { describe, it, expect } from 'vitest';
import { planWakes, teammateLabel, DEFAULT_LIMIT, UNREAD_HOLD } from '../shared/teammates.mjs';

const NOW = new Date(2026, 10, 2, 10, 0).getTime();
const DAY = 86_400_000;
const t = {
  id: 't-growth', name: 'Growth marketer', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [],
  duties: [{ id: 'd-post', what: 'Propose the day\'s post', every: 'day', at: ['09:00'] }], dutyServed: { 'd-post': '2026-11-01T09:00' },
};
const chat = { messages: [], seen: new Set(), into: new Map() };
const sent = (id, ago, over = {}) => ({
  id, product: 'kestrel', title: 'Post', status: 'open', createdAt: NOW - ago * DAY,
  labels: ['founder', teammateLabel(t.id), 'hop:0', 'duty:d-post'],
  result: 'Here is today\'s post.', wrote: { result: { ts: NOW - ago * DAY + 60_000, source: 'agent' } }, ...over,
});
const plan = (items) => planWakes({ teammates: [t], chat, items, now: NOW });
const runs = (acts) => acts.filter((a) => a.type === 'run');

describe('a duty nobody reads', () => {
  it('stops after three results in a row you have not answered, and says so', () => {
    expect(UNREAD_HOLD).toBe(3);
    const acts = plan([sent('w-1', 3), sent('w-2', 2), sent('w-3', 1.5)]);
    expect(runs(acts)).toHaveLength(0);
    expect(acts).toContainEqual({ type: 'unread', teammate: t.id, duty: 'd-post', what: 'Propose the day\'s post' });
  });

  it('two unanswered are not enough to stop it', () => {
    expect(runs(plan([sent('w-2', 2), sent('w-3', 1.5)]))).toHaveLength(1);
  });

  it('a result younger than a day does not count yet', () => {
    expect(runs(plan([sent('w-1', 3), sent('w-2', 2), sent('w-3', 0.5)]))).toHaveLength(1);
  });

  it('starts again once you answer one of them', () => {
    const answered = sent('w-3', 1.5, { answer: 'Not today.', wrote: { result: { ts: NOW - 1.5 * DAY, source: 'agent' }, answer: { ts: NOW - DAY, source: 'founder' } } });
    expect(runs(plan([sent('w-1', 3), sent('w-2', 2), answered]))).toHaveLength(1);
  });

  it('starts again once you close one of them', () => {
    const closed = sent('w-3', 1.5, { status: 'done', wrote: { result: { ts: NOW - 1.5 * DAY, source: 'agent' }, status: { ts: NOW - DAY, source: 'founder' } } });
    expect(runs(plan([sent('w-1', 3), sent('w-2', 2), closed]))).toHaveLength(1);
  });

  it('a quiet run that never reached you breaks nothing and counts for nothing', () => {
    const quiet = sent('w-3', 1.5, { status: 'done', labels: ['founder', teammateLabel(t.id), 'hop:0', 'duty:d-post', 'clean'] });
    expect(runs(plan([sent('w-1', 3), sent('w-2', 2), quiet]))).toHaveLength(1);
  });
});
