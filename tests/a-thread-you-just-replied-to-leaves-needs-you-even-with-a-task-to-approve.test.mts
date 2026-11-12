// A THREAD YOU JUST REPLIED TO LEAVES NEEDS YOU, EVEN WITH A TASK TO APPROVE.
//
// Reported 2026-10-11 with a screenshot: "I responded to this agent, not sure
// why it's still in waiting/needs you." The thread's ledger: a reply at
// 17:24:15, "continue" at 17:25:51 and 17:30:15, and no agent on it until
// 17:31:13. For all seven minutes the open thread read Status: Waiting under a
// NEEDS YOU breadcrumb, so the reply looked swallowed and was sent twice more.
//
// `belongsInProgress` already said In progress (an open row carrying a reply no
// agent has acted on). What overrode it was the reminder for unanswered
// proposals: the thread had filed a step for approval two days earlier, and
// `threadsOwedAnAnswer` pulls such a thread into Needs you with no regard for
// whether the next move is yours. Needs you wins over In progress in the tabs,
// so the reply changed nothing on screen.
//
// The reminder exists to bring a quiet thread back. A thread with a reply on
// its way to an agent, or an agent on it, is not quiet: the reminder waits
// until the agent has answered, and then the thread comes back as before.
import { describe, it, expect } from 'vitest';
import { PROPOSAL_PATIENCE, belongsInProgress, threadsOwedAnAnswer } from '../renderer/src/list-rules.ts';

const now = 1_791_764_700_000;
const HOUR = 3_600_000;
const REPLIED = now - 45_000;

// The thread as the ledger held it at the moment of the reply.
const thread = (over = {}) => ({
  id: 'w-thread', product: 'p', status: 'open', kind: 'directive', labels: ['founder'],
  createdAt: now - 48 * HOUR, updatedAt: REPLIED,
  result: 'An earlier answer.', answer: 'I do not understand this step.',
  answeredThrough: now - 45 * 60_000,
  wrote: {
    title: { ts: now - 48 * HOUR, source: 'founder' },
    result: { ts: now - 38 * 60_000, source: 'agent' },
    answer: { ts: REPLIED, source: 'founder' },
  },
  ...over,
});
// The step it filed for approval, two days old and unanswered.
const step = { id: 'w-step', product: 'p', status: 'open', kind: 'task', labels: [], parent: 'w-thread', createdAt: now - 46 * HOUR, updatedAt: now - 46 * HOUR };

const owed = (t) => threadsOwedAnAnswer([t, step], now).has('w-thread');

describe('a reply on its way to an agent', () => {
  it('keeps the thread out of Needs you, and it is In progress', () => {
    expect(owed(thread())).toBe(false);
    expect(belongsInProgress(thread(), { now })).toBe(true);
  });

  it('and so does an agent working on it', () => {
    expect(owed(thread({ status: 'claimed' }))).toBe(false);
  });
});

describe('the reminder still brings a quiet thread back', () => {
  it('when nobody has replied since the agent last answered', () => {
    expect(owed(thread({ answer: 'I do not understand this step.', answeredThrough: REPLIED,
      wrote: { ...thread().wrote, result: { ts: REPLIED + 60_000, source: 'agent' } } }))).toBe(true);
  });

  it('when the thread carries no reply at all', () => {
    expect(owed(thread({ answer: undefined, wrote: { title: thread().wrote.title } }))).toBe(true);
  });

  it('when the reply was withdrawn', () => {
    expect(owed(thread({ answer: '(withdrawn)' }))).toBe(true);
  });

  it('and only once the step has waited its day', () => {
    const fresh = { ...step, createdAt: now - PROPOSAL_PATIENCE + HOUR };
    expect(threadsOwedAnAnswer([thread({ answer: undefined }), fresh], now).has('w-thread')).toBe(false);
  });
});
