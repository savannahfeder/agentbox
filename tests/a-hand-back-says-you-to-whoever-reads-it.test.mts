// A HAND-BACK SAYS YOU TO WHOEVER READS IT (w-f702d60afe, 2026-11-21).
//
// A hand-off review on two stage copies: on Sam's own thread a hand-back read
// "Sam had asked: ...", and Theo read "Theo reviewed this" about himself. The
// stored words name both people; each copy now reads them in the second person.
import { describe, it, expect } from 'vitest';
import { handBackReadBy, handedBackWords } from '../shared/thread-asks.mts';
import { shownOnTheirThread } from '../renderer/src/threads/teammate-thread.ts';

const stored = handedBackWords({ kind: 'review', name: 'Theo', verdict: 'yes', words: 'Ship it.', asked: { by: 'Sam', note: 'Is the index safe?' } });

describe('the asker', () => {
  it('reads You asked', () => {
    expect(handBackReadBy(stored, 'asker')).toBe('Theo reviewed this and it looks good.\n\nShip it.\n\nYou asked: “Is the index safe?”');
  });
  it('leaves other words alone', () => {
    expect(handBackReadBy('Sam had asked: no', 'asker')).toBe('Sam had asked: no');
  });
});

describe('the helper, on the owner\'s thread', () => {
  const asSam = handBackReadBy(stored, 'asker');
  const ev = (fromId: string) => ({ at: 1, who: 'agent', text: asSam, fromId }) as never;
  it('reads You reviewed this, and Sam asked', () => {
    const [e] = shownOnTheirThread([ev('theo')], { me: 'theo', helping: false, owner: 'Sam' });
    expect(e.text).toBe('You reviewed this and it looks good.\n\nShip it.\n\nSam asked: “Is the index safe?”');
  });
  it('someone else\'s hand-back keeps their name, and Sam asked', () => {
    const [e] = shownOnTheirThread([ev('lena')], { me: 'theo', helping: false, owner: 'Sam' });
    expect(e.text).toBe('Theo reviewed this and it looks good.\n\nShip it.\n\nSam asked: “Is the index safe?”');
  });
});
