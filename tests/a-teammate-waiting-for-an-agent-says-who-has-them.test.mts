// "Chief of staff is waiting for a free agent" stood for 12 minutes with no reason.
// Maya's copy allows 2 agents at once and both were on her other threads, which the
// app knew and did not say. No estimate is given: nothing here knows how long a run will take,
// so it says how long the busy ones have been going instead.
import { describe, expect, it } from 'vitest';
import { whyWaiting } from '../renderer/src/teammates/chat-lines.ts';

const NOW = 1_000_000_000;
const run = (itemId, minutes) => ({ itemId, startedAt: NOW - minutes * 60_000 });
const titles = new Map([['a', 'Group bookings'], ['b', 'Onboarding B'], ['c', 'Launch posts'], ['d', 'Pricing']]);
const titleOf = (id) => titles.get(id) ?? null;

describe('what stands between this run and an agent', () => {
  it('names what the agents are on and how long they have been at it', () => {
    expect(whyWaiting({ item: 'me', running: [run('a', 11), run('b', 3)], queued: ['me'], titleOf, now: NOW }))
      .toBe('2 agents are busy: Group bookings (11m), Onboarding B (3m).');
  });

  it('says how many are ahead of it', () => {
    expect(whyWaiting({ item: 'me', running: [run('a', 11)], queued: ['c', 'd', 'me'], titleOf, now: NOW }))
      .toBe('1 agent is busy: Group bookings (11m). 2 threads are ahead of this one.');
  });

  it('says one ahead in the singular', () => {
    expect(whyWaiting({ item: 'me', running: [run('a', 11)], queued: ['c', 'me'], titleOf, now: NOW }))
      .toBe('1 agent is busy: Group bookings (11m). 1 thread is ahead of this one.');
  });

  it('does not count what is behind it', () => {
    expect(whyWaiting({ item: 'me', running: [run('a', 1)], queued: ['me', 'c', 'd'], titleOf, now: NOW }))
      .toBe('1 agent is busy: Group bookings (1m).');
  });

  it('does not claim a place in a queue it is not in', () => {
    expect(whyWaiting({ item: 'me', running: [run('a', 1)], queued: ['c'], titleOf, now: NOW }))
      .toBe('1 agent is busy: Group bookings (1m).');
  });

  it('names no more than three, and says how many more', () => {
    const running = ['a', 'b', 'c', 'd', 'e'].map((id, i) => run(id, 5 - i));
    expect(whyWaiting({ item: 'me', running, queued: [], titleOf, now: NOW }))
      .toBe('5 agents are busy: Group bookings (5m), Onboarding B (4m), Launch posts (3m), and 2 more.');
  });

  it('calls a run on an unknown thread what it is, and does not print its id', () => {
    expect(whyWaiting({ item: 'me', running: [run('w-secret', 2)], queued: [], titleOf, now: NOW }))
      .toBe('1 agent is busy: another thread (2m).');
  });

  it('says under a minute rather than 0m', () => {
    expect(whyWaiting({ item: 'me', running: [{ itemId: 'a', startedAt: NOW - 5_000 }], queued: [], titleOf, now: NOW }))
      .toBe('1 agent is busy: Group bookings (just started).');
  });

  it('does not count itself as busy', () => {
    expect(whyWaiting({ item: 'a', running: [run('a', 1)], queued: [], titleOf, now: NOW })).toBe('It starts at the next free moment.');
  });

  it('says it is about to start when nothing is running', () => {
    expect(whyWaiting({ item: 'me', running: [], queued: ['me'], titleOf, now: NOW })).toBe('It starts at the next free moment.');
  });
});
