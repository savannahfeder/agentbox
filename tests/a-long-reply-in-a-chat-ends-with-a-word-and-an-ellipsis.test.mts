// A LONG REPLY IN A CHAT ENDS AT A WORD, WITH AN ELLIPSIS (2026-11-22).
//
// Found by a power test of the review hand-off. Priya handed her review back
// to Lena, and in her chat with Lena the reply under "Handed it back" ended
// "Could you resend the two bookings picture", mid-word and with nothing to say
// there was more: the record keeps the first 280 characters of a message, and a
// review that carries its notes on pictures runs longer. Measured by building
// the chat's history from a task whose reply was kept that long.
import { describe, it, expect } from 'vitest';
import { pairTimeline, type PairTask } from '../renderer/src/team/pair-timeline.ts';
import { TALK_TEXT } from '../shared/work-items.mts';

const LENA = 'lena', PRIYA = 'priya';
const kept = (text: string) => text.slice(0, TALK_TEXT);
const task = (said: string): PairTask => ({
  id: 't1', title: 'Mock up an empty state', body: 'Which one would you ship?', people: [LENA, PRIYA], assignee: PRIYA, createdBy: LENA, createdAt: 1_000, labels: ['given-task'],
  talk: { chat: [{ by: PRIYA, ts: 5_000, text: said }] },
} as unknown as PairTask);
const replyText = (t: PairTask) => pairTimeline({ me: PRIYA, other: LENA, rooms: [], messages: [], directItems: [t], talk: [], titleOf: () => null })
  .find((e) => e.kind === 'reply')?.text;

const long = `Both pictures opened for me. ${'For a clinic setting up bookings I would lean toward a clear New booking button and one friendly line. '.repeat(3)}Could you resend the two bookings pictures?`;

describe('a reply the record cut short', () => {
  it('ends at the last whole word, with an ellipsis', () => {
    const text = replyText(task(kept(long)))!;
    expect(text.endsWith('…')).toBe(true);
    expect(long.startsWith(text.slice(0, -1))).toBe(true);
    expect(long[text.length - 1]).toMatch(/\s/);
  });

  it('is left as it is when it was not cut', () => {
    expect(replyText(task('Looks right to me.'))).toBe('Looks right to me.');
  });

  it('is left as it is when it is exactly as long as the record keeps and was whole', () => {
    // Only a reply the record had to cut reaches the cap, so one under it by a letter is whole.
    const whole = 'x'.repeat(TALK_TEXT - 1);
    expect(replyText(task(whole))).toBe(whole);
  });
});
