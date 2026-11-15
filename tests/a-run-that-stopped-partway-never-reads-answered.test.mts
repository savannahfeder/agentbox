// A power tester sent an investor update to the cloud and came back from a
// call to a Needs you row reading ANSWERED (2026-11-09). Inside: "Claude Code
// stopped partway through and did not finish this task", with a retry booked.
// The app's own note on a dead run fell through to "Waiting", which the Needs
// you tab draws as Answered, so the row said the work was ready when none was.
import { describe, it, expect } from 'vitest';
import { statusCell } from '../renderer/src/status-word.ts';
import { cellUnderTab } from '../renderer/src/threads/page-rules.ts';
import { deadRunSentence } from '../shared/spawn-trouble.mts';

const now = Date.parse('2026-11-09T18:40:00Z');
const row = (result: string, source = 'agent') => ({ id: 'w-1', product: 'p', title: 'Investor update', status: 'open', result, wrote: { result: { ts: now, source } } }) as never;
const shown = (result: string, source?: string) => cellUnderTab(statusCell(row(result, source), { queued: [] }).word, 'inbox', { fromPeople: false });

describe('a thread whose run died, in Needs you', () => {
  it('reads Stopped, not Answered, when it stopped partway with a retry booked', () => {
    expect(shown(deadRunSentence({ engineWord: 'Claude Code', partway: true, retryAt: now + 600_000, now }))).toBe('Stopped');
  });

  it('reads Stopped when it never started, or its account was at its limit', () => {
    expect(shown(deadRunSentence({ engineWord: 'Claude Code', now }))).toBe('Stopped');
    expect(shown(deadRunSentence({ engineWord: 'Codex', cause: 'at-limit', now }))).toBe('Stopped');
  });

  it('a real answer still reads Answered', () => {
    expect(shown('Here is the investor update, ready for you to send.')).toBe('Answered');
  });

  it('the same words written by the person are not the app\'s note', () => {
    expect(shown(deadRunSentence({ engineWord: 'Claude Code', partway: true, now }), 'founder')).toBe('Answered');
  });
});
