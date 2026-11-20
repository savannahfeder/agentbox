// A HELPER'S ANSWER STAYS ON THE THREAD UNDER THEIR NAME (2026-11-20).
//
// Two copies on the stand-in cloud: Theo answered Sam's step with "Add
// persistent storage and keep keys for 24 hours". Sam's ledger had the line
// (system, Theo's name, uid comment-…), the row said "Theo answered this
// step", and the thread showed only the agent's next question, which quoted
// Theo's words as its option 1. The thread folds an agent message that
// another holds whole, and Theo's answer was drawn as an agent message.
// A teammate's words are never folded away, as yours never are. Measured by
// replaying the shape of Sam's ledger through the thread the page draws.
import { describe, it, expect } from 'vitest';
import { itemThread } from '../renderer/src/item-thread';

const lines = [
  { id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Idempotency key for appointments', body: 'Add an idempotency key.' } },
  { id: 'w-1', ts: 2, source: 'agent', patch: { result: '**Should keys stay in memory?**\n\n## Options\n1. Store keys in memory until restart\n2. Add persistent storage and keep keys for 24 hours' } },
  { id: 'w-1', ts: 3, source: 'system', by: 'p-theo', uid: 'comment-c1', patch: { answer: 'Add persistent storage and keep keys for 24 hours', from: { teammate: 'p-theo', name: 'Theo Okafor' }, blockedBy: [], waitEnded: { said: 'Theo answered this step', at: 3 } } },
  { id: 'w-1', ts: 4, source: 'agent', patch: { result: '**Should I add persistent storage and keep keys for 24 hours?**\n\nTheo recommends this approach.\n\n## Options\n1. Add persistent storage and keep keys for 24 hours (recommended)\n2. Store keys in memory until restart' } },
];

describe('the helper\'s answer', () => {
  it('is drawn under their name though the agent\'s next message repeats it', () => {
    const { events } = itemThread(lines, [], null, { whole: true });
    const theirs = events.find((e: { text?: string; from?: string }) => e.text === 'Add persistent storage and keep keys for 24 hours');
    expect(theirs).toMatchObject({ from: 'Theo Okafor' });
  });
  it('an agent repeating itself is still folded', () => {
    const twice = [...lines.slice(0, 2), { ...lines[1], ts: 3 }];
    const { events } = itemThread(twice, [], null, { whole: true });
    expect(events.filter((e: { text?: string }) => (e.text ?? '').includes('Should keys stay in memory'))).toHaveLength(0);
  });
});
