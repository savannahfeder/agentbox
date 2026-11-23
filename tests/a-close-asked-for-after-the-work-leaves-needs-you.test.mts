// A close asked for after the work, with words after it, leaves Needs you.
//
// What broke: in the overnight Cloud test (2026-11-16, round six) two testers
// asked for work and then the close: "Please add a short recommendation for
// consistent company naming to your cleanup note, then close this task as
// done." and "Ship this Python CLI and its test changes to main, then close
// this thread when the merge succeeds." Both agents did the work and closed
// the thread, and both sat in Needs you as DONE, one of them after a reload.
// Read from the copy's store: status done at 222019, the agent's answer at
// 229476. The rule took a close only when nothing followed "close this task"
// in its clause, so "as done" and "when the merge succeeds" kept it as news.
import { describe, it, expect } from 'vitest';
import { belongsInInbox } from '../renderer/src/list-rules';

const NOW = 1_794_843_300_000;

const closedByAgent = (answer: string) => ({
  id: 'w-cleanup', kind: 'task', status: 'done', labels: ['founder'],
  title: 'Lead sheet duplicates and company names', updatedAt: NOW - 10_000,
  answer, answeredThrough: NOW - 40_000,
  result: '**Added the naming recommendation and closed this task as done.**',
  wrote: {
    answer: { ts: NOW - 40_000, source: 'founder' },
    status: { ts: NOW - 12_000, source: 'agent' },
    result: { ts: NOW - 5_000, source: 'agent' },
  },
});

const inNeedsYou = (answer: string) => belongsInInbox(closedByAgent(answer), { now: NOW });

describe('a close asked for after the work', () => {
  it('counts with words after it, as the testers wrote it', () => {
    expect(inNeedsYou("Let's treat fintech-leads.csv as the sheet for now. Thanks for checking it. Please add a short recommendation for consistent company naming to your cleanup note, then close this task as done.")).toBe(false);
    expect(inNeedsYou('Reviewed the Config refactor and seven passing tests. Ship this Python CLI and its test changes to main, then close this thread when the merge succeeds. Leave the independent Claude comparison branch alone. Report merge result before closing.')).toBe(false);
  });

  it('counts with once or after', () => {
    expect(inNeedsYou('Fix the typo and close the thread once it is merged.')).toBe(false);
  });
});

describe('still news', () => {
  it('a close offered as one of two choices', () => {
    expect(inNeedsYou('Should I close this thread or keep it open for the follow-up')).toBe(true);
  });

  it('a reply that says not to close it, or asks why', () => {
    expect(inNeedsYou("Don't close this task until I check the numbers.")).toBe(true);
    expect(inNeedsYou('Why did you close this thread when the merge failed?')).toBe(true);
  });

  it('a close of something else', () => {
    expect(inNeedsYou('Close the modal when the form saves.')).toBe(true);
  });
});
