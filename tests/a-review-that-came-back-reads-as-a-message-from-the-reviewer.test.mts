// A REVIEW THAT CAME BACK READS AS A MESSAGE FROM THE REVIEWER (2026-11-20).
//
// Lena's "Mock up the pricing page" went to Priya to review and came back with
// one note. The thread said so in a grey strip above its title, "Priya sent it
// back with 1 note: “Love it. Calm a…”", cut off, where nobody looks, and the
// comment itself read "Comment · Goes to the agent with the next reply / Sent
// back: Love it…". Now the reviewer's message, under their face and name in
// the conversation, says what they did and their whole note, and the strip is
// left to other waits. Measured on the thread's own history.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { itemThread } from '../renderer/src/item-thread.ts';
import { reviewBack, verdictMessage } from '../shared/review-sent-back.mts';

const said = (text: string) => {
  const lines = [
    { id: 'w-1', ts: 1, source: 'founder', patch: { body: 'Mock up the pricing page' } },
    { id: 'w-1', ts: 2, source: 'agent', patch: { result: 'Two plans or three?' } },
    { id: 'w-1', ts: 3, source: 'teammate', by: 'u-priya', patch: { comment: { text } } },
  ];
  return itemThread(lines as never, [], null, { whole: true }).events.find((e: { at: number }) => e.at === 3) as { text?: string; says?: string } | undefined;
};

describe('a review that came back', () => {
  it('says what the reviewer did and the whole note, with no Comment tag: the reported case', () => {
    const e = said('Sent back with 1 note: Love it. Calm and clear. Make the Team price say per seat.');
    expect(e?.text).toBe('Sent it back with 1 note: Love it. Calm and clear. Make the Team price say per seat.');
    expect(e?.says).toBeUndefined();
  });
  it('says an approval, and one with no note', () => {
    expect(verdictMessage('Approved')).toBe('Approved it.');
    expect(verdictMessage('Approved: Ship it')).toBe('Approved it: Ship it');
    expect(verdictMessage('Sent back')).toBe('Sent it back.');
  });
  it('leaves a plain comment a comment', () => {
    expect(verdictMessage('Looks good to me')).toBeNull();
    expect(said('Looks good to me')?.says).toBe('comment');
  });
  it('finds the newest verdict among the comments', () => {
    expect(reviewBack([{ by: 'p', ts: 1, text: 'Sent back' }, { by: 'p', ts: 2, text: 'Approved' }])?.verdict).toBe('approved');
    expect(reviewBack([{ by: 'p', ts: 1, text: 'hello' }])).toBeNull();
  });
});

describe('the thread page', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  it('leaves the strip at the top to waits that are not a review', () => {
    expect(focus).toContain('{!waitNow && waitEndedWords && !reviewBack(item.waitingComments) && (');
  });
});
