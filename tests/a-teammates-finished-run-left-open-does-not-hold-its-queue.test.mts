// A teammate runs one thing at a time, and the rest queue behind whatever is
// running (shared/teammates.mts `isActiveRun`). A run its agent finished and
// closed quietly, with `clean`, on a row the store kept open (the person's own
// ask from the team chat, which only they may close) still counted as running.
// Measured on the store, 2026-11-22: one such run (w-6f4acda096b7, finished
// 2026-11-15) held the self-improve lead's queue for seven days, and 13 runs
// waited behind it, four scheduled rounds and nine bugs the person had filed,
// the oldest for four days. None said a word.
import { describe, it, expect } from 'vitest';
import { planWakes, isActiveRun, waitingOnYou, statusOf, teammateLabel, DEFAULT_LIMIT } from '../shared/teammates.mts';

const NOW = new Date(2026, 10, 22, 12, 0).getTime();
const HOUR = 60 * 60 * 1000;
const lead = { id: 't-cccccc', name: 'Cleo', letter: 'C', status: 'active', paused: false, served: '2026-11-22', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const run = (over = {}) => ({ id: 'w-111111', product: 'kestrel', title: 'x', status: 'open', labels: ['founder', teammateLabel(lead.id)], createdAt: NOW - 100 * HOUR, wrote: {}, ...over });
const finishedQuietly = run({
  id: 'w-f1n15h',
  title: 'Fix the stuck starts',
  labels: ['founder', teammateLabel(lead.id), 'from-chat', 'clean'],
  wrote: { body: { ts: NOW - 100 * HOUR, source: 'founder' }, result: { ts: NOW - 98 * HOUR, source: 'agent' } },
});
const queued = run({ id: 'w-q00001', start: 'later', createdAt: NOW - 90 * HOUR });
const plan = (items) => planWakes({ teammates: [lead], chat: { messages: [], seen: new Set() }, items, now: NOW });

describe("a teammate's finished run left open does not hold its queue", () => {
  it('an open run its agent answered and labelled clean is not running, and the oldest queued run is released', () => {
    expect(isActiveRun(finishedQuietly)).toBe(false);
    expect(plan([finishedQuietly, queued])).toContainEqual({ type: 'release', teammate: lead.id, item: 'w-q00001', product: 'kestrel' });
  });

  it('it stays out of Needs you, as a quiet close should', () => {
    expect(waitingOnYou(finishedQuietly)).toBe(false);
  });

  it('the panel beside the teammate does not name it as what it is on now', () => {
    expect(statusOf(lead, [finishedQuietly, queued], NOW).now).not.toBe(finishedQuietly.title);
  });

  it('once you reply on it, it is about to run again, and the queue waits behind it', () => {
    const replied = { ...finishedQuietly, wrote: { ...finishedQuietly.wrote, answer: { ts: NOW - HOUR, source: 'founder' } } };
    expect(isActiveRun(replied)).toBe(true);
    expect(plan([replied, queued]).find((a) => a.type === 'release')).toBeUndefined();
  });

  it('a clean run a session is on right now still holds the queue', () => {
    const onIt = { ...finishedQuietly, status: 'claimed' };
    expect(isActiveRun(onIt)).toBe(true);
    expect(plan([onIt, queued]).find((a) => a.type === 'release')).toBeUndefined();
  });

  it('a clean run with no answer from its agent yet still holds the queue', () => {
    const notYet = { ...finishedQuietly, wrote: { body: finishedQuietly.wrote.body } };
    expect(isActiveRun(notYet)).toBe(true);
  });
});
