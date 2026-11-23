// A REVIEW THAT ASKS FOR CHANGES TAKES THE RECOMMENDATION AWAY (w-f702d60afe, round seven, 2026-11-20).
//
// The product engineer tester read her thread after Theo's review came back:
// "Immediately below Theo's Needs changes verdict, the agent's old option still
// says Accept the change recommended, alongside Request changes." The options
// stay live after a hand-back (format.ts offerIsLive), so you can still pick,
// but the agent's "recommended" was written before a person said otherwise.
import { describe, it, expect } from 'vitest';
import { itemOptions } from '../renderer/src/format.ts';
import { handedBackWords } from '../shared/thread-asks.mts';

const offer = 'Ready.\n\n## Options\n1. Accept the change (recommended)\n2. Request changes';
const back = (verdict: 'yes' | 'changes' | 'done', kind: 'review' | 'help' = 'review') => ({
  result: offer, status: 'blocked',
  answer: handedBackWords({ kind, name: 'Theo', verdict, words: 'The migration locks writes.' }),
  wrote: { result: { ts: 1 }, answer: { ts: 2, teammate: 'theo' } },
});
const bare = (t: string) => t.replace(/\s*\(recommended\)\s*/i, '');
const recommended = (item: object) => itemOptions(item as never).filter((o) => o.recommended).map((o) => bare(o.text));

describe('the agent\'s options after a review comes back', () => {
  it('recommend nothing when the reviewer asked for changes', () => {
    expect(recommended(back('changes'))).toEqual([]);
    expect(itemOptions(back('changes') as never).map((o) => o.text)).toEqual(['Accept the change', 'Request changes']);
  });
  it('keep the recommendation when it looks good, or after help', () => {
    expect(recommended(back('yes'))).toEqual(['Accept the change']);
    expect(recommended(back('done', 'help'))).toEqual(['Accept the change']);
  });
  it('keep it on a thread nobody reviewed', () => {
    expect(recommended({ result: offer, status: 'blocked', wrote: { result: { ts: 1 } } })).toEqual(['Accept the change']);
  });
});
