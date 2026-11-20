// A HAND-BACK IS NOT READ AS THE AGENT ASKING (w-f702d60afe, round six, 2026-11-20).
//
// The designer tester opened a thread Dana had handed back: "Below Dana's
// hand-back it says It stopped and asked you, but the agent's latest response
// is revised copy and contains no question." A hand-back is written as the
// helper's words (a system line with `from`) and then holds the thread for you
// with a system `blocked`; that second line drew as the agent stopping.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-11-20T09:00:00Z');
const line = (ts: number, source: string, patch: Record<string, unknown>) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
const born = [
  line(T0, 'system', { title: 'Cancellation copy', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
  line(T0 + 4, 'founder', { title: 'Cancellation copy' }),
  line(T0 + 60_000, 'agent', { result: 'Here is the revised copy.' }),
];
const said = (lines: unknown[]) => threadEvents(lines as never).map((e) => e.said);

describe('a thread handed back to you', () => {
  it('shows the hand-back and not the agent stopping to ask', () => {
    const out = said([...born,
      line(T0 + 120_000, 'system', { answer: 'Dana handed this back.\n\nTightened the copy.', from: { teammate: 'dana', name: 'Dana Whitfield' } }),
      line(T0 + 120_001, 'system', { status: 'blocked' })]);
    expect(out).toContain('Dana Whitfield handed this over');
    expect(out).not.toContain('It stopped and asked you');
  });
  it('still says the agent stopped when it did', () => {
    expect(said([...born, line(T0 + 120_000, 'agent', { status: 'blocked' })])).toContain('It stopped and asked you');
  });
});
