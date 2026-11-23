// A THREAD WAITING ON A TASK TO APPROVE IS IN NEEDS YOU (w-34443a206b).
//
// Two testers on 2026-11-22 found a thread reading "1 task to approve" in
// Later with no time on it. Its agent had filed a task for their yes and
// parked the thread behind it (blocked, blockedBy the task). A wait sends a
// thread to Later because it resumes by itself when what it waits on
// finishes, but a proposal finishes only once a person says yes, so nothing
// would ever bring that thread back for a day. Measured on the list rules
// both the window and the phone call.
import { describe, expect, it } from 'vitest';
import { belongsInInbox, waitsInLater, waitsThatCanEnd } from '../renderer/src/list-rules.ts';

const NOW = 1_790_000_000_000;
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, status: 'open', kind: 'task', labels: [] as string[], createdAt: NOW - 3_600_000, updatedAt: NOW - 3_600_000, ...over,
});
const parked = { wrote: { status: { ts: NOW - 1000, source: 'agent' } } };
const byIdOf = (...rows: ReturnType<typeof row>[]) => new Map(rows.map((r) => [r.id, r]));

const thread = row('w-thread', { status: 'blocked', labels: ['founder'], blockedBy: ['w-task'], result: 'Filed the fix as a task for your yes.', ...parked });
const proposal = row('w-task', { parent: 'w-thread' });

describe('a thread whose wait is a task waiting for your yes', () => {
  it('is not a wait that ends by itself', () => {
    expect(waitsThatCanEnd(thread, byIdOf(thread, proposal))).toEqual([]);
  });

  it('so the thread is in Needs you, not Later', () => {
    const waitingOn = waitsThatCanEnd(thread, byIdOf(thread, proposal));
    expect(waitsInLater(thread, waitingOn)).toBe(false);
    expect(belongsInInbox(thread, { now: NOW, waitingOn })).toBe(true);
  });

  it('whichever thread filed the task', () => {
    const elsewhere = row('w-task', { parent: 'w-other' });
    expect(waitsThatCanEnd(thread, byIdOf(thread, elsewhere))).toEqual([]);
  });
});

describe('what still waits in Later', () => {
  it('the same task once you approved it, which runs and finishes by itself', () => {
    const approved = row('w-task', { parent: 'w-thread', answer: 'Approved. Run it.', wrote: { answer: { ts: NOW - 500, source: 'founder' } } });
    const waitingOn = waitsThatCanEnd(thread, byIdOf(thread, approved));
    expect(waitingOn).toEqual(['w-task']);
    expect(belongsInInbox(thread, { now: NOW, waitingOn })).toBe(false);
  });

  it('a task you wrote yourself', () => {
    const yours = row('w-task', { parent: 'w-thread', labels: ['founder'] });
    expect(waitsThatCanEnd(thread, byIdOf(thread, yours))).toEqual(['w-task']);
  });

  it('a task an agent is working on', () => {
    expect(waitsThatCanEnd(thread, byIdOf(thread, { ...proposal, status: 'claimed' }))).toEqual(['w-task']);
  });

  it('one wait of two that still ends by itself', () => {
    const running = row('w-running', { status: 'claimed' });
    const both = { ...thread, blockedBy: ['w-task', 'w-running'] };
    expect(waitsThatCanEnd(both, byIdOf(both, proposal, running))).toEqual(['w-running']);
  });
});
