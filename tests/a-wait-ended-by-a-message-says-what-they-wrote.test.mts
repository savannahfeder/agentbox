// A WAIT ENDED BY A MESSAGE SAYS WHAT THEY WROTE (2026-11-20).
//
// Synthetic team run: Sam's cents-or-decimals thread waited on Theo. Theo
// answered in their chat, the row said "Theo wrote to you", and opening the
// thread showed no word from Theo anywhere: his words were in the chat. The
// line that ends the wait now carries his first words, quoted under his name,
// so the thread itself says what he said. Measured on the rule and on the
// sync step that writes it.
import { describe, it, expect } from 'vitest';
import { endedWaits, personWait } from '../shared/thread-waits.mts';
import { noticeEndedWaits } from '../main/team/waits.mts';

const at = 1_000_000;
const waiting = { id: 'w-1', status: 'open', blockedBy: [personWait('p-theo')], wrote: { blockedBy: { source: 'founder', ts: at } } };
const ctx = { items: [], cards: [], nameOf: () => 'Theo Park', now: at + 100 };

describe('the line that ends the wait', () => {
  it('quotes what they wrote', () => {
    expect(endedWaits([waiting], { ...ctx, lastWordFrom: () => at + 1, lastWordsFrom: () => 'Cents, as integers.' })[0].said).toBe('Theo wrote to you: “Cents, as integers.”');
  });
  it('cuts a long message to its start, on one line', () => {
    const said = endedWaits([waiting], { ...ctx, lastWordFrom: () => at + 1, lastWordsFrom: () => `Cents.\n\n${'x'.repeat(300)}` })[0].said;
    expect(said.length).toBeLessThanOrEqual(120);
    expect(said).not.toContain('\n');
  });
  it('is as before with no words to quote', () => {
    expect(endedWaits([waiting], { ...ctx, lastWordFrom: () => at + 1 })[0].said).toBe('Theo wrote to you');
  });
});

describe('the sync step', () => {
  it('reads the words of their newest message in your chat', () => {
    const chat = { slug: 'dm', dir: '/dm', team: { direct: true, people: ['p-sam', 'p-theo'] } };
    const work = { slug: 'api', dir: '/api', team: { direct: false } };
    const rows: Record<string, unknown[]> = {
      '/dm': [{ id: 'm-1', answer: 'Cents, as integers.', wrote: { answer: { by: 'p-theo', ts: at + 5 } } }],
      '/api': [waiting],
    };
    const wrote: Record<string, unknown>[] = [];
    noticeEndedWaits({
      products: [chat, work] as never, read: (p) => rows[p.dir] as never, write: (_d, _id, patch) => wrote.push(patch),
      cards: [], nameOf: () => 'Theo Park', now: at + 100,
    });
    expect(wrote[0]).toMatchObject({ blockedBy: [], waitEnded: { said: 'Theo wrote to you: “Cents, as integers.”' } });
  });
});
