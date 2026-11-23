// A close asked for in the middle of a reply also leaves Needs you.
//
// What broke: in the overnight Cloud test (2026-11-16, round four) a tester
// replied "thanks, do not change a price without the page. Close this thread
// please, I will bring the right website repo later." The agent closed the
// thread, and it sat first in Needs you as DONE. Last night's rule only took
// a reply that ENDED on "close this thread", so a "please" or a sentence after
// it kept the agent's done as news.
//
// The rule: any clause of your newest reply that asks for the close counts,
// and a clause that says not to close, or asks why it was closed, does not.
import { describe, it, expect } from 'vitest';
import { belongsInInbox } from '../renderer/src/list-rules';

const NOW = 1_794_830_000_000;

const closedByAgent = (answer: string) => ({
  id: 'w-teams', kind: 'task', status: 'done', labels: ['founder'],
  title: 'Teams price on pricing page', updatedAt: NOW - 10_000,
  answer, answeredThrough: NOW - 60_000,
  result: '**Closed this thread. No files or prices were changed.**',
  wrote: {
    answer: { ts: NOW - 60_000, source: 'founder' },
    result: { ts: NOW - 10_000, source: 'agent' },
    status: { ts: NOW - 10_000, source: 'agent' },
  },
});

const inNeedsYou = (answer: string) => belongsInInbox(closedByAgent(answer), { now: NOW });

describe('a close you asked for', () => {
  it('counts in the middle of the reply, as the tester wrote it', () => {
    expect(inNeedsYou('thanks, do not change a price without the page. Close this thread please, I will bring the right website repo later.')).toBe(false);
  });

  it('counts with please before or after it', () => {
    expect(inNeedsYou('Please close this thread.')).toBe(false);
    expect(inNeedsYou('Close this task please')).toBe(false);
  });

  it('counts asked as a question', () => {
    expect(inNeedsYou('Could you close this task? Nothing else is needed.')).toBe(false);
  });
});

describe('still news', () => {
  it('a reply that says not to close it', () => {
    expect(inNeedsYou('Do not close this thread, I will be back with the repo.')).toBe(true);
    expect(inNeedsYou("Thanks. Don't close this task yet.")).toBe(true);
  });

  it('a reply that asks why it was closed', () => {
    expect(inNeedsYou('Why did you close this thread?')).toBe(true);
  });

  it('a reply about closing something else', () => {
    expect(inNeedsYou('Close the modal when the form saves.')).toBe(true);
  });
});
