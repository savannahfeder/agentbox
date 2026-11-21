// A THREAD YOU ASKED TO CLOSE LEAVES NEEDS YOU WHEN ITS AGENT CLOSES IT.
//
// Overnight power test, 2026-11-16: a tester picked "Leave it as a documented
// finding and close this task". That option is not a bare close, so it went to
// the agent as a reply; the agent wrote its last word and marked the thread
// done. An agent's done on a thread you spoke on is news, so it sat at the top
// of Needs you as DONE, offering Reopen, for over two hours (seen 6 times).
// The close was the person's own ask: carried out, it is the archive.
import { describe, it, expect } from 'vitest';
import { belongsInInbox } from '../renderer/src/list-rules';

const NOW = 1_794_830_000_000;

const closedByAgent = (answer: string, extra = {}) => ({
  id: 'w-parser', kind: 'task', status: 'done', labels: ['founder'],
  title: 'Platform request parser JSON robustness', updatedAt: NOW - 10_000,
  answer, answeredThrough: NOW - 60_000,
  result: 'Recorded it as a documented finding and closed this task.',
  wrote: {
    answer: { ts: NOW - 60_000, source: 'founder' },
    result: { ts: NOW - 10_000, source: 'agent' },
    status: { ts: NOW - 10_000, source: 'agent' },
  },
  ...extra,
});

const inNeedsYou = (i: ReturnType<typeof closedByAgent>) => belongsInInbox(i, { now: NOW });

describe('the agent closing a thread you asked it to close', () => {
  it('takes it out of Needs you, as the reported pick', () => {
    expect(inNeedsYou(closedByAgent('Option 2: Leave it as a documented finding and close this task (recommended)'))).toBe(false);
  });
  it('and a typed ask that ends by closing it', () => {
    expect(inNeedsYou(closedByAgent('Add the note to the README, then close the thread.'))).toBe(false);
    expect(inNeedsYou(closedByAgent('Close this task'))).toBe(false);
  });
});

describe('still news', () => {
  it('an agent closing a thread you did not ask it to close', () => {
    expect(inNeedsYou(closedByAgent('Option 1: Fix the parser and add a test'))).toBe(true);
  });
  it('an ask not to close it', () => {
    expect(inNeedsYou(closedByAgent("Fix it but don't close this task"))).toBe(true);
  });
  it('a close that came before your newest words', () => {
    const i = closedByAgent('Leave it and close this task', {
      wrote: {
        answer: { ts: NOW - 5_000, source: 'founder' },
        result: { ts: NOW - 10_000, source: 'agent' },
        status: { ts: NOW - 10_000, source: 'agent' },
      },
    });
    expect(inNeedsYou(i)).toBe(true);
  });
  it('a reply you took back', () => {
    expect(inNeedsYou(closedByAgent('(withdrawn)'))).toBe(true);
  });
});
