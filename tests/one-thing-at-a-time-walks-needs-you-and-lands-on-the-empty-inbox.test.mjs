// ONE THING AT A TIME WALKS NEEDS YOU AND LANDS ON THE EMPTY INBOX (w-65bcefb857).
//
// Asked: "Needs you becomes a queue you move through", one thread per page,
// and "once you're done it should just go back to your empty inbox". Read in
// renderer/src/advance.ts: a reply on the LAST thread waiting kept you on it
// (`replyMovesOn` is false when inboxSize is 1), so the queue had no end. Now
// every answer on Needs you moves on, the last one included, and with nothing
// left the advance opens nothing and the list is what is on the screen.
//
// The page shows the newest answer whole and folds the rest behind "Show N
// earlier messages"; these are the rules that pick the answer and the count,
// measured against real conversation shapes.
import { describe, it, expect } from 'vitest';
import { nextAfterAdvance, replyMovesOn } from '../renderer/src/advance.ts';
import {
  spotIn, stepIn, newestAnswer, earlierCount, splitHeadline,
} from '../renderer/src/one-thing-at-a-time.ts';

const rows = [
  { product: 'a', id: 'w-1' },
  { product: 'a', id: 'w-2' },
  { product: 'b', id: 'w-2' },
];

describe('where you are in the queue', () => {
  it('counts from one, out of every thread waiting', () => {
    expect(spotIn(rows, rows[0])).toEqual({ pos: 1, total: 3, index: 0 });
    expect(spotIn(rows, { product: 'b', id: 'w-2' })).toEqual({ pos: 3, total: 3, index: 2 });
  });
  it('tells two projects apart when ids match', () => {
    expect(spotIn(rows, { product: 'a', id: 'w-2' })?.pos).toBe(2);
  });
  it('is nowhere for a thread that is not waiting, or no thread', () => {
    expect(spotIn(rows, { product: 'a', id: 'w-9' })).toBeNull();
    expect(spotIn(rows, null)).toBeNull();
  });
});

describe('the up and down arrows', () => {
  it('step to the thread above and below', () => {
    expect(stepIn(rows, rows[1], 1)).toBe(rows[2]);
    expect(stepIn(rows, rows[1], -1)).toBe(rows[0]);
  });
  it('stop at either end instead of wrapping', () => {
    expect(stepIn(rows, rows[0], -1)).toBeNull();
    expect(stepIn(rows, rows[2], 1)).toBeNull();
  });
});

describe('after an answer', () => {
  const on = (p) => replyMovesOn({ view: 'inbox', onBoard: false, ...p });
  it('moves on from a thread in the queue, the last one included', () => {
    expect(on({ index: 0 })).toBe(true);
    expect(on({ index: 4 })).toBe(true);
  });
  it('stays on a thread that is not in the queue, or while searching', () => {
    expect(on({ index: -1 })).toBe(false);
    expect(on({ index: 2, searching: true })).toBe(false);
  });
  it('and with the last one answered there is nothing to open, so the empty list shows', () => {
    const last = [{ id: 'w-1' }];
    expect(nextAfterAdvance(last, { index: 0, excludeId: 'w-1' })).toBeNull();
  });
});

const you = (at, text, extra = {}) => ({ at, who: 'you', text, ...extra });
const it_ = (at, text) => ({ at, who: 'it', text });
const work = (at) => ({ kind: 'work', at, verb: 'ran', subject: 'npm test', output: '', lines: 0, failed: false });

describe('the newest answer', () => {
  it('is the answer lifted to the foot when there is one', () => {
    const outcome = { at: 50, text: '**Ship it?**\n\nAll green.', field: 'result' };
    expect(newestAnswer([you(1, 'go'), it_(10, 'Picked it up.')], outcome)).toEqual({ at: 50, text: outcome.text });
  });
  it('otherwise the last thing the agent said, past its steps', () => {
    expect(newestAnswer([you(1, 'go'), it_(10, 'Picked it up.'), work(11), it_(20, '**Done.**')], null)).toEqual({ at: 20, text: '**Done.**' });
  });
  it('is nothing when only you have spoken', () => {
    expect(newestAnswer([you(1, 'go'), work(2)], null)).toBeNull();
  });
});

describe('how many earlier messages the fold holds', () => {
  it('every message but the newest answer', () => {
    expect(earlierCount([you(1, 'a'), it_(2, 'b'), work(3), you(4, 'c'), it_(5, 'd')], null)).toBe(3);
  });
  it('all of them when the answer was lifted out of the stream', () => {
    expect(earlierCount([you(1, 'a'), it_(2, 'b')], { at: 9, text: 'x', field: 'result' })).toBe(2);
  });
  it('and the opening ask counts as one', () => {
    expect(earlierCount([it_(2, 'b')], null, { at: 1, text: 'ask' })).toBe(1);
  });
});

describe('the answer\'s first bold line is its headline', () => {
  it('when the first line is bold and nothing else', () => {
    expect(splitHeadline('**Should I ship it?**\n\nAll 41 tests pass.')).toEqual({ headline: 'Should I ship it?', rest: 'All 41 tests pass.' });
  });
  it('not when the bold is only the start of a sentence', () => {
    expect(splitHeadline('**Done.** It shipped.')).toEqual({ headline: null, rest: '**Done.** It shipped.' });
  });
  it('not when there is no bold line', () => {
    expect(splitHeadline('Plain answer.')).toEqual({ headline: null, rest: 'Plain answer.' });
  });
});
