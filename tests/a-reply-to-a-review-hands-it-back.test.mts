// A REPLY TO A REVIEW HANDS IT BACK, AND SAYS SO AT ONCE (2026-11-22).
//
// Asked by Theo to review his thread, the founder wrote to him in the box at
// the foot and sent it: "pretty sure i sent a replyt but this thread is still in
// inbox and reply is not visible". The box only commented, so the review stayed
// open in Needs you; an earlier change had made the box the review's answer, and
// a merge dropped it (367ec438f). Now, with a review on you, sending from the box
// hands it back with your words, and the words stand on the page until the
// owner's copy has put the hand-back on the thread. Measured by reading the page
// and by the rule that says when the words have arrived.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { stillOnItsWay } from '../renderer/src/threads/teammate-thread';
import type { AgentEvent } from '../renderer/src/types';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

const sent = { at: 10_000_000, text: 'Bigger focus ring, please.' };
const handBack = (at: number, text: string) => ({ at, who: 'you', text } as AgentEvent);

describe('a reply to a review', () => {
  it('hands the review back with your words, rather than only commenting', () => {
    // With the notes you left on its files (notes-on-a-teammates-pictures-go-with-your-reply).
    expect(page).toMatch(/if \(reviewing && said === undefined\) \{[\s\S]{0,200}await handBack\('done', \[text, held\?\.text\]/);
  });

  it('is drawn while the hand-back has not reached the thread', () => {
    expect(stillOnItsWay([], sent)).toBe(true);
    // The same words said ten minutes before are an older message, not this one.
    expect(stillOnItsWay([handBack(10_000_000 - 600_000, 'Bigger focus ring, please.')], sent)).toBe(true);
  });

  it('stops being drawn once the thread has it, as the hand-back reads there', () => {
    expect(stillOnItsWay([handBack(10_002_000, 'You reviewed this.\n\nTheo asked: “Can you check it?”\n\nBigger focus ring, please.')], sent)).toBe(false);
  });

  it('counts it arrived when the owner\'s clock runs a minute behind', () => {
    expect(stillOnItsWay([handBack(10_000_000 - 60_000, 'You reviewed this.\n\nBigger focus ring, please.')], sent)).toBe(false);
  });

  it('is not taken as arrived by other words said after it', () => {
    expect(stillOnItsWay([handBack(10_002_000, 'Something else entirely.')], sent)).toBe(true);
  });

  it('draws nothing when nothing was sent', () => {
    expect(stillOnItsWay([handBack(10_002_000, 'Anything')], null)).toBe(false);
  });

  // The power test: after Dana handed a review back, Lena's ask left the page and Dana's reply stood
  // alone as the thread's headline. The ask stays where it was with the reply under it, and a
  // teammate's words (a hand-back, a helper's message) are never taken as the agent's newest answer.
  it('keeps the ask you answered on the page, with your answer under it', () => {
    expect(page).toContain('const shownAsk = ask ?? answeredAsk;');
    expect(page).toContain("const lastIt = !built.outcome ? [...said].reverse().find((e) => e.who === 'it' && !e.fromId) ?? null : null;");
    expect(page).toContain('const askAt = shownAsk && onHandBack ? shownAsk.createdAt ?? 0 : null;');
  });

  it('is drawn on the page as your words', () => {
    expect(page).toContain('stillOnItsWay(events, sentBack)');
  });
});
