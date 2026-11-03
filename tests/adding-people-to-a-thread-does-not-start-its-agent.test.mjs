// Adding people to a thread started its agent again.
// Sofia pressed Add people > Maya, then Add people > Dev, on a thread whose
// agent had answered; each press made the agent think again and write a
// second full report nobody asked for. Measured in the supervisor: Add people
// writes `visibleTo` as her own write, and `visibleTo` was missing from the
// edits that are not a reply, so `awaitingHer` turned false and the row was
// fresh work. A rename (`label`) did the same.
import { describe, it, expect } from 'vitest';
import { awaitingHer } from '../main/supervisor.mjs';

const answered = (extra = {}) => ({
  id: 'w-add', product: 'lumen', status: 'open', kind: 'directive', labels: ['founder'],
  wrote: { body: { ts: 1_000, source: 'founder' }, result: { ts: 2_000, source: 'agent' }, ...extra },
});

describe('adding people to a thread does not start its agent', () => {
  it('people added after the answer leave it waiting on her', () => {
    expect(awaitingHer(answered({ visibleTo: { ts: 3_000, source: 'founder' } }))).toBe(true);
  });

  it('a rename after the answer leaves it waiting on her', () => {
    expect(awaitingHer(answered({ label: { ts: 3_000, source: 'founder' } }))).toBe(true);
  });

  it('a reply after the people were added still makes it fresh', () => {
    const row = answered({ visibleTo: { ts: 3_000, source: 'founder' }, answer: { ts: 4_000, source: 'founder' } });
    expect(awaitingHer(row)).toBe(false);
  });
});
