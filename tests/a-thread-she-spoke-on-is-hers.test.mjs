// A thread she has spoken on is hers, whoever filed it.
//
// It was not moved arbitrarily, and the ledger says so exactly. At 16:27 a
// worker finished a real piece of work and closed the row, correctly. At 17:52
// a one-word status question arrived as a reply, which reopens a finished thread.
//
// The close is not the bug and cannot be made one. The ordinary loop is a
// worker enacting her answer and closing in one append, which is the same shape
// (tests/v0-loop.test.mjs pins it), and nothing in the ledger separates the two.
//
// The LOSS is the bug. her-own-asks-come-back gave her back the threads she
// COMPOSED, keyed on the 'founder' label. This row was filed by an agent, so it
// had no label, so a worker's `done` filed it in the archive, taking a whole
// workstream with it under a one-word question. The rule that was always meant:
// her REPLY makes a thread hers, and an agent ending a thread she is in the
// middle of is news she has not received.

import { describe, it, expect } from 'vitest';
import { belongsInInbox } from '../renderer/src/list-rules';

const T = 1_786_000_000_000;

// The real row, as the fold hands it over: agent-filed, no 'founder' label,
// her reply the newest founder word on it, closed by an agent.
const theTripoRow = {
  id: 'w-6ab3cc09b4', product: 'meadow', status: 'done', kind: 'question',
  labels: ['v1', 'pipeline', 'art', 'spend'], priority: 7,
  title: 'The best one is Tripo and it costs twenty cents.',
  answer: 'status?',
  result: 'Nothing is running, and nothing is waiting on me. It all sits with you.',
  createdAt: T, updatedAt: T + 4000,
  wrote: {
    answer: { ts: T + 3000, source: 'founder' },
    status: { ts: T + 4000, source: 'agent' },
  },
};

describe('a thread she replied to, closed by an agent', () => {
  it('comes back to her instead of the archive', () => {
    expect(belongsInInbox(theTripoRow, { deliveredThrough: T })).toBe(true);
  });

  it('leaves for good when she archives it herself', () => {
    const archived = {
      ...theTripoRow,
      wrote: { ...theTripoRow.wrote, status: { ts: T + 5000, source: 'founder' } },
    };
    expect(belongsInInbox(archived, { deliveredThrough: T })).toBe(false);
  });

  it('stays filed if it was closed before the rule started applying', () => {
    // The watermark that kept a year of settled work out of an inbox she keeps
    // at zero. It has to hold for this rule too.
    expect(belongsInInbox(theTripoRow, { deliveredThrough: T + 9999 })).toBe(false);
  });

  it('treats a withdrawn reply as never having spoken', () => {
    const withdrawn = { ...theTripoRow, answer: '(withdrawn)' };
    expect(belongsInInbox(withdrawn, { deliveredThrough: T })).toBe(false);
  });

  it('leaves ordinary agent work filed, exactly as before', () => {
    const neverSpokenOn = { ...theTripoRow, answer: undefined, wrote: { status: { ts: T + 4000, source: 'agent' } } };
    expect(belongsInInbox(neverSpokenOn, { deliveredThrough: T })).toBe(false);
  });

  it('still delivers her own composed asks, label or reply', () => {
    const hers = {
      ...theTripoRow, answer: undefined, labels: ['founder'],
      wrote: { status: { ts: T + 4000, source: 'agent' } },
    };
    expect(belongsInInbox(hers, { deliveredThrough: T })).toBe(true);
  });
});
