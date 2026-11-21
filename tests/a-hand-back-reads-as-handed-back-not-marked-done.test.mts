// A HAND-BACK READS AS HANDED BACK, NOT "MARKED IT DONE" (w-f702d60afe, round ten, 2026-11-20).
//
// The designer tester answered Theo's review with Needs changes: "the review now
// says 'you asked for changes' ... but 'Marked it done' is less reassuring than
// an explicit confirmation that Theo received it." Handing back writes the
// verdict and then closes the task (main/team handBack), and the close drew as
// marking it done. Right after a verdict it says the task went back.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-11-20T14:00:00Z');
const line = (ts: number, source: string, patch: Record<string, unknown>) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
const born = [
  line(T0, 'system', { title: 'Review the validation table', status: 'open', kind: 'directive', priority: 5, labels: ['given-task'] }),
  line(T0 + 4, 'founder', { title: 'Review the validation table' }),
];
const said = (lines: unknown[]) => threadEvents(lines as never).map((e) => e.said);

describe('closing a task by handing it back', () => {
  it('says you handed it back, not that you marked it done', () => {
    const out = said([...born,
      line(T0 + 60_000, 'founder', { verdict: 'changes' }),
      line(T0 + 60_001, 'founder', { answer: 'The rate column is off by one.' }),
      line(T0 + 60_002, 'founder', { status: 'done' })]);
    expect(out).toContain('You handed it back');
    expect(out).not.toContain('You marked it done');
  });
  it('still says marked done without a verdict', () => {
    expect(said([...born, line(T0 + 60_000, 'founder', { status: 'done' })])).toContain('You marked it done');
  });
});
