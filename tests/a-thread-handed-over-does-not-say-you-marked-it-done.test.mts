// A THREAD HANDED OVER DOES NOT SAY "YOU MARKED IT DONE" (w-f702d60afe, round six, 2026-11-20).
//
// The PM tester handed unfinished work to Priya and read their own thread:
// "the activity says Marked it done, even though I handed Priya unfinished
// work. It also says Given to Priya". Handing over writes "Given to Priya."
// as your words and then closes your copy of the thread; the close drew its
// own line, which read as finishing the work.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-11-20T09:00:00Z');
const line = (ts: number, source: string, patch: Record<string, unknown>) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
const born = [
  line(T0, 'system', { title: 'Cancel button', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
  line(T0 + 4, 'founder', { title: 'Cancel button' }),
  line(T0 + 60_000, 'agent', { result: 'Scoped it.' }),
];
const said = (lines: unknown[]) => threadEvents(lines as never).map((e) => e.said);

describe('handing a thread over', () => {
  it('says it was given, and not that you marked it done', () => {
    const out = said([...born, line(T0 + 120_000, 'founder', { answer: 'Given to Priya Shah.' }), line(T0 + 120_001, 'founder', { status: 'done' })]);
    expect(out).toContain('You replied');
    expect(out).not.toContain('You marked it done');
  });
  it('still says you marked it done when you did', () => {
    expect(said([...born, line(T0 + 120_000, 'founder', { status: 'done' })])).toContain('You marked it done');
    expect(said([...born, line(T0 + 120_000, 'founder', { answer: 'Looks right, thanks.' }), line(T0 + 120_001, 'founder', { status: 'done' })])).toContain('You marked it done');
  });
});
