// Cmd+Y says something happened.
//
// The chord is answered in the main process, so the card used to vanish on the
// next store push with nothing in between. These pin the stage the exit needs:
// the answered card holds its place while it leaves, and nothing shuffles
// forward underneath it.
import { describe, it, expect } from 'vitest';
import { approvalStage } from '../renderer/src/approval-stage';

const a = { id: 'ap-1', tool: 'Bash' };
const b = { id: 'ap-2', tool: 'Edit' };
const c = { id: 'ap-3', tool: 'Bash' };

describe('nothing to answer', () => {
  it('draws nothing', () => {
    expect(approvalStage([], null, null)).toEqual({ card: null, verdict: null, waiting: 0 });
    expect(approvalStage(null, null, null)).toEqual({ card: null, verdict: null, waiting: 0 });
    expect(approvalStage(undefined, undefined, undefined).card).toBe(null);
  });
});

describe('the ordinary card', () => {
  it('is the oldest, with the rest counted behind it', () => {
    const stage = approvalStage([a, b, c], null, null);
    expect(stage.card).toBe(a);
    expect(stage.verdict).toBe(null);
    expect(stage.waiting).toBe(2);
  });
});

describe('the beat after Cmd+Y', () => {
  it('keeps the answered card on stage while the snapshot still has it', () => {
    const stage = approvalStage([a, b], { id: 'ap-1', allow: true }, a);
    expect(stage.card).toBe(a);
    expect(stage.verdict).toBe('allow');
  });

  it('keeps it on stage after the snapshot has already dropped it', () => {
    // This is the real case: main answers, the spool watcher pushes, and the
    // card is gone from `pending` before the animation has drawn a frame.
    const stage = approvalStage([b], { id: 'ap-1', allow: true }, a);
    expect(stage.card).toBe(a);
    expect(stage.verdict).toBe('allow');
  });

  it('tells allow and deny apart', () => {
    expect(approvalStage([], { id: 'ap-1', allow: false }, a).verdict).toBe('deny');
    expect(approvalStage([], { id: 'ap-1', allow: true }, a).verdict).toBe('allow');
  });

  it('does NOT let the next card jump forward into the leaving one', () => {
    const stage = approvalStage([b, c], { id: 'ap-1', allow: true }, a);
    expect(stage.card).toBe(a);       // not b
    expect(stage.waiting).toBe(2);    // b and c are both still behind
  });

  it('hands the stage to the next card once the animation is over', () => {
    const stage = approvalStage([b, c], null, a);
    expect(stage.card).toBe(b);
    expect(stage.verdict).toBe(null);
    expect(stage.waiting).toBe(1);
  });

  it('empties when the last card was the one answered', () => {
    expect(approvalStage([], null, a)).toEqual({ card: null, verdict: null, waiting: 0 });
  });
});

describe('an answer nobody can place', () => {
  it('falls back to the ordinary card rather than holding an empty stage', () => {
    // A reload mid-animation, or an event for a card this window never drew.
    const stage = approvalStage([b, c], { id: 'ap-gone', allow: true }, null);
    expect(stage.card).toBe(b);
    expect(stage.verdict).toBe(null);
    expect(stage.waiting).toBe(1);
  });

  it('draws nothing when there is nothing left either', () => {
    expect(approvalStage([], { id: 'ap-gone', allow: true }, null).card).toBe(null);
  });
});
