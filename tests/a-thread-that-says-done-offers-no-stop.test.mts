// A THREAD THAT SAYS DONE OFFERS NO STOP.
//
// A synthetic tester: "The Mobile thread said Done at the top, showed the Codex
// limit twice in the body, and offered Stop, so I couldn't tell if anything was
// running." Measured on the two rules the page draws: its header word comes from
// `threadState`, which says done for a done row whatever else is true, and the
// Stop from `stoppable`, which said yes to any row with a session still going,
// done or not. Done wins: a row marked done offers no Stop.
import { describe, it, expect } from 'vitest';
import { stoppable } from '../renderer/src/list-rules.ts';
import { threadState } from '../shared/thread-cards.mts';

const NOW = Date.parse('2026-11-11T15:00:00Z');
const row = (o: Record<string, unknown> = {}) => ({ id: 'w-mobile', product: 'p', title: 'Mobile', kind: 'task', status: 'open', labels: ['founder'], createdAt: NOW - 60_000, ...o });

describe('Stop on a thread', () => {
  it('is not offered on a done row, even with a session still on it', () => {
    const done = row({ status: 'done' });
    expect(threadState(done as never, NOW)).toBe('done');
    expect(stoppable(done as never, { now: NOW, live: true })).toBe(false);
  });

  it('is still offered on an open row an agent is on, and one waiting its turn', () => {
    expect(stoppable(row() as never, { now: NOW, live: true })).toBe(true);
    expect(stoppable(row() as never, { now: NOW })).toBe(true);
  });
});
