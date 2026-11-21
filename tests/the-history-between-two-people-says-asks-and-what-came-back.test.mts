// THE HISTORY BETWEEN TWO PEOPLE SAYS ASKS, AND WHAT CAME BACK (w-f702d60afe, 2026-11-20).
//
// Photographed on Theo's page from Sam's side after Sam asked Theo for a
// review: the one row read "Handed Theo a thread". It was not handed over; it
// was a review, still Sam's. The history now says help and review asks as
// asks, and the hand-back as its own row by the person who handed it back.
import { describe, it, expect } from 'vitest';
import { pairTimeline, pairLine, type PairTask } from '../renderer/src/team/pair-timeline.ts';

const SAM = 'sam', THEO = 'theo';
const task = (o: Partial<PairTask> & Record<string, unknown>): PairTask => ({
  id: 't1', title: 'Add an idempotency key', body: 'Can you check it?', people: [SAM, THEO], assignee: THEO, createdBy: SAM, createdAt: 1_000, labels: ['given-task'], ...o,
}) as PairTask;
const lines = (t: PairTask, me = SAM) => pairTimeline({ me, other: me === SAM ? THEO : SAM, rooms: [], messages: [], directItems: [t], talk: [], titleOf: () => null })
  .map((e) => pairLine(e, me, (id) => (id === SAM ? 'Sam Ortiz' : 'Theo Okafor')));

describe('an ask in the history', () => {
  it('reads as an ask for a review or for help', () => {
    expect(lines(task({ ask: { kind: 'review', owner: SAM, thread: 'w', product: 'api' } }))).toEqual(['Asked Theo for a review']);
    expect(lines(task({ ask: { kind: 'help', owner: SAM, thread: 'w', product: 'api' } }))).toEqual(['Asked Theo to help']);
    expect(lines(task({ ask: { kind: 'help', owner: SAM, thread: 'w', product: 'api' } }), THEO)).toEqual(['Asked you to help']);
  });
  it('adds what came back, by whoever handed it back, when they did', () => {
    const back = task({ ask: { kind: 'review', owner: SAM, thread: 'w', product: 'api' }, verdict: 'changes', wrote: { verdict: { ts: 5_000, by: THEO } } });
    const tl = pairTimeline({ me: SAM, other: THEO, rooms: [], messages: [], directItems: [back], talk: [], titleOf: () => null });
    expect(tl.map((e) => [e.by, e.at])).toEqual([[SAM, 1_000], [THEO, 5_000]]);
    expect(lines(back)).toEqual(['Asked Theo for a review', 'Asked for changes']);
    expect(lines(task({ ask: { kind: 'review', owner: SAM, thread: 'w', product: 'api' }, verdict: 'yes', wrote: { verdict: { ts: 5_000, by: THEO } } }))[1]).toBe('Said it looks good');
    expect(lines(task({ ask: { kind: 'help', owner: SAM, thread: 'w', product: 'api' }, verdict: 'done', wrote: { verdict: { ts: 5_000, by: THEO } } }))[1]).toBe('Handed it back');
  });
  it('leaves a plain task as a task', () => {
    expect(lines(task({}))).toEqual(['Gave Theo a task']);
  });
});
