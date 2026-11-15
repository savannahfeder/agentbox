// A thread a teammate hands you says who handed it, when, and their note.
//
// What broke: in the outreach film's copy of the app, Maya's thread assigned to
// you was a plain row in the inbox (title, Waiting on you, project, priority)
// and nothing on it named her. Opened, only two small initials in the header
// said she was involved, and her note was a comment at the foot of the thread.
// Measured by drawing the row and the thread in the demo build: no "Maya"
// anywhere on the row, and no line on the page saying she handed it over.
//
// The rule (`handedBy`): a thread in a shared project that a teammate gave to
// you names them, the time it reached you, and their newest note. Not your
// own thread, not one handed to someone else, not a conversation or a given
// task (those already lead with the person), and not an agent's row.

import { describe, it, expect } from 'vitest';
import { handedBy } from '../renderer/src/team/company';

const shared = { slug: 'node-api', name: 'Node API', team: { projectId: 'tp-1', teamId: 't-1', visibility: 'team' } };
const mine = { slug: 'notes', name: 'Notes' };
const direct = { slug: 'dm', name: 'Maya', team: { projectId: 'tp-2', teamId: 't-1', direct: true } };

const T0 = 1_700_000_000_000;
const row = (over = {}) => ({
  id: 'w-1', product: 'node-api', productName: 'Node API', status: 'open', title: 'Debug failing Solana devnet tests',
  assignee: 'me', people: ['maya', 'me'], createdBy: 'maya', createdAt: T0, updatedAt: T0 + 60_000,
  wrote: { assignee: { ts: T0 + 30_000, source: 'founder', by: 'maya' } },
  ...over,
});

describe('a thread a teammate hands you says who and why', () => {
  it('names the teammate, when it reached you, and their newest note', () => {
    const item = row({ waitingComments: [
      { by: 'maya', ts: T0 + 40_000, text: 'Ignore the first try.' },
      { by: 'maya', ts: T0 + 50_000, text: 'Can you take this one? You set up the faucet wallet last time.' },
    ] });
    expect(handedBy(item as never, shared as never, 'me')).toEqual({ from: 'maya', at: T0 + 30_000, note: 'Can you take this one? You set up the faucet wallet last time.' });
  });

  it('has no note when they left none, and dates it from when the thread was made if nobody wrote the hand-over', () => {
    const item = row({ wrote: {} });
    expect(handedBy(item as never, shared as never, 'me')).toEqual({ from: 'maya', at: T0, note: null });
  });

  it('takes no one else’s comment as the note', () => {
    const item = row({ people: ['maya', 'me', 'jordan'], waitingComments: [{ by: 'jordan', ts: T0 + 50_000, text: 'I looked at this too.' }] });
    expect(handedBy(item as never, shared as never, 'me')?.note).toBeNull();
  });

  it('is nothing on a thread that is not yours to hold', () => {
    expect(handedBy(row({ assignee: 'maya' }) as never, shared as never, 'me')).toBeNull();
    expect(handedBy(row({ assignee: 'agent', runner: 'maya' }) as never, shared as never, 'me')).toBeNull();
    expect(handedBy(row({ assignee: undefined }) as never, shared as never, 'me')).toBeNull();
  });

  it('is nothing on a thread you made for yourself, or when nobody is signed in', () => {
    expect(handedBy(row({ people: ['me'], createdBy: 'me' }) as never, shared as never, 'me')).toBeNull();
    expect(handedBy(row() as never, shared as never, null)).toBeNull();
  });

  it('is nothing outside a shared project, and nothing in a conversation, which already leads with the person', () => {
    expect(handedBy(row({ product: 'notes' }) as never, mine as never, 'me')).toBeNull();
    expect(handedBy(row({ product: 'dm' }) as never, direct as never, 'me')).toBeNull();
  });
});
