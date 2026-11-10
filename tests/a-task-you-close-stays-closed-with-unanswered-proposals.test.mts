// 2026-10-07: one thread returned to the inbox after eight recorded closes.
// Its unanswered child proposal was over 24 hours old. The reminder bypassed
// the user's terminal status, so every snapshot put the same Done thread back.
// Closing must settle that reminder without deleting or approving the child.
import { describe, it, expect } from 'vitest';
import { threadsOwedAnAnswer, PROPOSAL_PATIENCE } from '../renderer/src/list-rules.ts';

const now = 1_800_000_000_000;
const parent = (over = {}) => ({
  id: 'w-parent', status: 'done', labels: ['founder'],
  wrote: { status: { source: 'founder', ts: now - 1_000 } }, ...over,
});
const child = (age = PROPOSAL_PATIENCE + 1) => ({
  id: 'w-child', parent: 'w-parent', status: 'open', kind: 'task', labels: [],
  createdAt: now - age,
});
const owed = (p, c = child(), at = now) => threadsOwedAnAnswer([p, c], at);

describe('your closure takes precedence over unanswered proposals', () => {
  it('keeps the reported thread closed even when the proposal is overdue', () => {
    expect(owed(parent()).size).toBe(0);
  });

  it('stays closed across later snapshots and repeated closes', () => {
    for (let close = 0; close < 8; close++) {
      expect(owed(parent({ wrote: { status: { source: 'founder', ts: now + close } } }),
        child(), now + close + PROPOSAL_PATIENCE).size).toBe(0);
    }
  });

  it('does not approve, reject, or delete the proposal when its parent is closed', () => {
    const proposal = child();
    const before = structuredClone(proposal);
    owed(parent(), proposal);
    expect(proposal).toEqual(before);
  });

  it('still reminds you when an agent finished the parent', () => {
    expect(owed(parent({ wrote: { status: { source: 'agent', ts: now - 1_000 } } })).has('w-parent')).toBe(true);
  });

  it('reminds you again after you deliberately reopen the thread', () => {
    expect(owed(parent({ status: 'open', wrote: { status: { source: 'system', ts: now } } })).has('w-parent')).toBe(true);
  });

  it('waits through the 24-hour boundary on an open thread', () => {
    const open = parent({ status: 'open' });
    expect(owed(open, child(PROPOSAL_PATIENCE - 1)).size).toBe(0);
    expect(owed(open, child(PROPOSAL_PATIENCE)).size).toBe(0);
    expect(owed(open, child(PROPOSAL_PATIENCE + 1)).has('w-parent')).toBe(true);
  });
});
