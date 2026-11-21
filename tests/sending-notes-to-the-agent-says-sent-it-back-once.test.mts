// SENDING NOTES TO THE AGENT SAYS "YOU SENT IT BACK" ONCE (w-f702d60afe, round six, 2026-11-20).
//
// The designer tester sent a page note to the agent and read the thread: "Two
// identical Sent it back entries appear at 8:48am even though I clicked Send
// back to agent once." Measured in that copy's store: the notes path wrote
// `status: open` twice in the same millisecond around its `sent` mark, and each
// line drew its own entry.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-11-20T08:48:00Z');
const line = (ts: number, source: string, patch: Record<string, unknown>) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
const born = [
  line(T0, 'system', { title: 'Empty states', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
  line(T0 + 4, 'founder', { title: 'Empty states' }),
  line(T0 + 60_000, 'agent', { result: 'Which one?' }),
];
const sentBack = (lines: unknown[]) => threadEvents(lines as never).filter((e) => e.said === 'You sent it back').length;

describe('two reopenings written together', () => {
  it('read as one sending back', () => {
    expect(sentBack([...born, line(T0 + 120_000, 'founder', { status: 'open' }), line(T0 + 120_000, 'founder', { status: 'open' })])).toBe(1);
  });
  it('read as one when a second apart, which is the same press', () => {
    expect(sentBack([...born, line(T0 + 120_000, 'founder', { status: 'open' }), line(T0 + 120_900, 'founder', { status: 'open' })])).toBe(1);
  });
  it('read as two when sent back twice, minutes apart', () => {
    expect(sentBack([...born, line(T0 + 120_000, 'founder', { status: 'open' }), line(T0 + 300_000, 'founder', { status: 'open' })])).toBe(2);
  });
});
