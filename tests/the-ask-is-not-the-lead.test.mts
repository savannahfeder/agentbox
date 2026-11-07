// The pane leads with what happened, not with what she asked for.
//
// The bug this pins: opening any row still in flight printed the founder's
// original message in full, above everything, every time.). The rule already
// existed for rows an agent had closed with a result; it stopped there.

// Where the ask GOES is no longer here. It used to be a second toggle under the
// title assembled from the four folded fields; the ways to look back were cut
// to one, so it is the thread history behind the time, and
// what it holds is pinned in tests/the-time-is-the-door.test.mjs.

import { describe, it, expect } from 'vitest';
import { leadField } from '../renderer/src/recap.ts';

const T = 1_700_000_000_000;
const min = 60_000;

function item(fields = {}) {
  return {
    id: 'w-1',
    product: 'personal',
    productName: 'Personal',
    status: 'open',
    title: 'The task:',
    kind: 'directive',
    labels: [],
    priority: 5,
    epoch: 1,
    claim: null,
    createdAt: T,
    updatedAt: T,
    ...fields,
  };
}

// The case that showed it: a directive the user wrote, replied to, with a
// checkpoint on it.
const herRow = item({
  body: 'Newsletter Relaunch Plan CONTEXT (read this first)…',
  note: 'Moved the mailing list to the new tool and updated the footer.',
  answer: "Don't send anything to the full list yet",
  status: 'blocked',
  wrote: {
    note: { ts: T + 30 * min, source: 'agent' },
    answer: { ts: T + 90 * min, source: 'founder' },
  },
});

describe('what leads the pane', () => {
  it('is the agent\'s finished word when there is one', () => {
    expect(leadField(item({ body: 'ask', result: 'done, here it is', note: 'halfway' }))).toBe('result');
  });

  it('is the latest checkpoint while the work is still running', () => {
    expect(leadField(herRow)).toBe('note');
  });

  it('is nothing at all on a row where only she has spoken', () => {
    expect(leadField(item({ body: 'ask' }))).toBe(null);
  });

  it('ignores a withdrawn send, which is a tombstone and not words', () => {
    expect(leadField(item({ body: 'ask', result: '(withdrawn)' }))).toBe(null);
  });
});
