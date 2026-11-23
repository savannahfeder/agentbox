// A REVIEW THAT COMES BACK KEEPS THE QUESTION IT ANSWERS IN VIEW (w-f702d60afe, 2026-11-21).
//
// A bug hunt on Sam's stage copy: after Theo's review came back, Sam's thread
// led with Theo's message alone and folded the agent's question under "Show 2
// earlier messages", while the agent's choices for that question still sat
// under it. The page now starts at the agent's message the teammate answered.
import { describe, it, expect } from 'vitest';
import { helperAnswered, standsAt } from '../renderer/src/one-thing-at-a-time.ts';
import type { AgentEvent } from '../renderer/src/types.ts';

const ev = (o: Partial<AgentEvent> & { at: number }) => ({ who: 'agent', text: 'x', ...o }) as AgentEvent;

describe('where the page starts under a teammate\'s answer', () => {
  const events = [ev({ at: 1, who: 'you', text: 'Fix it' }), ev({ at: 2, text: 'Done. Drop it now or keep it?' }), ev({ at: 3, text: 'Looks good', fromId: 'theo' })];
  it('starts at the agent message the teammate answered', () => {
    expect(helperAnswered(events, { at: 3, fromId: 'theo' })).toBe(1);
  });
  it('does nothing when the newest answer is the agent\'s own', () => {
    expect(helperAnswered(events, { at: 2 })).toBe(-1);
  });
  it('skips the person\'s own words and steps with no text', () => {
    const e = [ev({ at: 1, text: 'Question?' }), ev({ at: 2, who: 'you', text: 'hm' }), ev({ at: 3, text: '' }), ev({ at: 4, text: 'Reviewed', fromId: 'theo' })];
    expect(helperAnswered(e, { at: 4, fromId: 'theo' })).toBe(0);
  });
  it('is -1 when nothing came before the teammate', () => {
    expect(helperAnswered([ev({ at: 4, text: 'Reviewed', fromId: 'theo' })], { at: 4, fromId: 'theo' })).toBe(-1);
  });
  it('is where the thread page stands when nobody answered since', () => {
    expect(standsAt(events, { at: 3, fromId: 'theo' })).toBe(1);
    expect(standsAt(events, { at: 2 })).toBe(-1);
  });
});
