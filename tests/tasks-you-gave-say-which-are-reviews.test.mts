// TASKS YOU GAVE SAY WHICH ARE REVIEWS, AND WHAT CAME BACK (w-f702d60afe, round six, 2026-11-20).
//
// The designer tester on a person's page: "All three appear in one list with
// only Replied or Not opened; the review has no visible review label." And an
// ask handed back read "Done", because the status check came before the
// hand-back one, so the verdict was never said.
import { describe, it, expect } from 'vitest';
import { givenStage } from '../renderer/src/team/company.ts';

const task = (o: Record<string, unknown> = {}) => ({ id: 't', product: 'dm', status: 'open', assignee: 'dana', createdAt: 10, ...o }) as never;

describe('a task you gave, in Tasks you gave', () => {
  it('names a review or a help ask before where it stands', () => {
    expect(givenStage(task({ ask: { kind: 'review' } }), 0)).toBe('Review · Not opened');
    expect(givenStage(task({ ask: { kind: 'help' } }), 20)).toBe('Help · Seen');
  });
  it('says the verdict of a review handed back, even though the task is done', () => {
    expect(givenStage(task({ ask: { kind: 'review' }, verdict: 'yes', status: 'done' }), 20)).toBe('Review · Looks good');
    expect(givenStage(task({ ask: { kind: 'review' }, verdict: 'changes', status: 'done' }), 20)).toBe('Review · Needs changes');
    expect(givenStage(task({ ask: { kind: 'help' }, verdict: 'done', status: 'done' }), 20)).toBe('Help · Handed back');
  });
  it('reads as before on a plain task', () => {
    expect(givenStage(task({ status: 'done' }), 20)).toBe('Done');
    expect(givenStage(task({ answer: 'On it', talk: { chat: [{ by: 'dana', ts: 30 }] } }), 20)).toBe('Replied');
    expect(givenStage(task(), 0)).toBe('Not opened');
  });
});
