// A LONG REPLY IN A CHAT ENDS AT A WORD, WITH AN ELLIPSIS (2026-11-22).
//
// Found by a power test of the review hand-off. Priya handed her review back
// to Lena, and in her chat with Lena the reply under "Handed it back" ended
// "Could you resend the two bookings picture", mid-word and with nothing to say
// there was more: the record keeps the first 280 characters of a message, and a
// review that carries its notes on pictures runs longer. Measured by building
// the chat's history from a task whose reply was kept that long.
//
// A review of d55a2b861: a reply of exactly 280 characters was whole, but the
// chat took any reply that long as cut and dropped its last word. The record
// now says which replies it cut; measured by folding the task's own lines.
import { describe, it, expect } from 'vitest';
import { pairTimeline, type PairTask } from '../renderer/src/team/pair-timeline.ts';
import { foldWorkItems, TALK_TEXT } from '../shared/work-items.mts';

const LENA = 'lena', PRIYA = 'priya';
const task = (said: string): PairTask => foldWorkItems([
  { id: 't1', ts: 1_000, source: 'founder', by: LENA, uid: 'u-open', patch: { title: 'Mock up an empty state', body: 'Which one would you ship?', status: 'open', kind: 'directive', people: [LENA, PRIYA], assignee: PRIYA, labels: ['given-task'] } },
  { id: 't1', ts: 5_000, source: 'founder', by: PRIYA, uid: 'u-reply', patch: { answer: said } },
]).get('t1') as unknown as PairTask;
const replyText = (t: PairTask) => pairTimeline({ me: PRIYA, other: LENA, rooms: [], messages: [], directItems: [t], talk: [], titleOf: () => null })
  .find((e) => e.kind === 'reply')?.text;

const long = `Both pictures opened for me. ${'For a clinic setting up bookings I would lean toward a clear New booking button and one friendly line. '.repeat(3)}Could you resend the two bookings pictures?`;

describe('a reply the record cut short', () => {
  it('ends at the last whole word, with an ellipsis', () => {
    const text = replyText(task(long))!;
    expect(text.endsWith('…')).toBe(true);
    expect(long.startsWith(text.slice(0, -1))).toBe(true);
    expect(long[text.length - 1]).toMatch(/\s/);
  });

  it('is cut when it is one letter over what the record keeps', () => {
    const over = `${'word '.repeat(TALK_TEXT / 5)}x`;
    expect(over.length).toBe(TALK_TEXT + 1);
    expect(replyText(task(over))!.endsWith('…')).toBe(true);
  });

  it('is left as it is when it was not cut', () => {
    expect(replyText(task('Looks right to me.'))).toBe('Looks right to me.');
  });

  it('is left as it is when it is exactly as long as the record keeps', () => {
    const whole = `${'word '.repeat(TALK_TEXT / 5 - 1)}last.`;
    expect(whole.length).toBe(TALK_TEXT);
    expect(replyText(task(whole))).toBe(whole);
  });

  it('is left as it is when it is one under what the record keeps', () => {
    const whole = 'x'.repeat(TALK_TEXT - 1);
    expect(replyText(task(whole))).toBe(whole);
  });
});
