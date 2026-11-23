// A merge you asked to end with a close closes the thread.
//
// What broke: in the overnight Cloud test (2026-11-16, round four) testers
// replied "merge it into main and close the thread" on cloud threads, four
// times. The cloud agent handed the merge back, the app merged the branch on
// the Mac and wrote "Merged into main" as the answer with no status, and the
// close was dropped: each thread sat in Needs you until closed by hand.
// Measured from the testers' row histories (merge result, status untouched).
//
// The rule: when the reply the merge carried asks for the close, the merge's
// answer closes the thread. A reply that does not, or that came after the
// run began (a run still carries that one), leaves it open.
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { Supervisor } from '../main/supervisor.mts';
import { asksToClose } from '../shared/asks-to-close.mts';

const startedAt = 1_794_837_000_000;

function merged(answer: string, answeredAt = startedAt - 5_000) {
  const row = { id: 'w-a', product: 'p', status: 'open', answer, wrote: { answer: { ts: answeredAt, source: 'founder' } } };
  const written: Array<{ result: string; status: string | null }> = [];
  const store = {
    listItems: () => [row], listProducts: () => [], isDue: () => true,
    readItem: () => row,
    recordSessionResult: (_p: string, _id: string, r: { result: string; status: string | null }) => { written.push(r); },
    settleAnswer: () => {},
    noteItem: () => {},
  };
  const sup = new Supervisor({ storeRoot: os.tmpdir(), home: os.tmpdir(), maxConcurrentSessions: 1 }, store as never, os.tmpdir());
  sup._answeredByMerge(row as never, { ok: true, commits: 1 } as never, startedAt);
  return written[0];
}

describe('the merge the app makes for a cloud thread', () => {
  it('closes the thread when the reply asked for the close', () => {
    expect(merged('after merging, verify main still has both fixes. then close the thread.')).toMatchObject({ status: 'done', result: expect.stringMatching(/^\*\*Merged into main\.\*\*/) });
    expect(merged('Merge it into main and close this thread')).toMatchObject({ status: 'done' });
  });

  it('leaves it open when the reply did not ask', () => {
    expect(merged('Option 1: Ship it')).toMatchObject({ status: null });
    expect(merged("merge it but don't close this thread yet")).toMatchObject({ status: null });
  });

  it('leaves it open when the ask came after the run began', () => {
    expect(merged('merge it and close this thread', startedAt + 12_000)).toMatchObject({ status: null });
  });
});

describe('a close asked for', () => {
  it('is read the same way the inbox reads it', () => {
    expect(asksToClose('thanks. Close this thread please, I will be back.')).toBe(true);
    expect(asksToClose('Why did you close this thread?')).toBe(false);
  });
});
