// A THREAD HANDED ON IS NOT CALLED FINISHED (2026-11-13).
//
// Two rounds of testers on the Standup: Ana gave a blocked onboarding thread
// to Maya, and Maya's standup said Ana "Finished" it, though Maya had only
// just been asked to find the code. Handing a thread on closes it with "Given
// to …" (main/team handOn), and the card it published read as done. Measured
// by building the cards a person publishes and the day their own screen draws.
import { describe, it, expect } from 'vitest';
import { cardsFor, handedOn } from '../shared/thread-cards.mts';
import { teamToday } from '../renderer/src/team/today.ts';

const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const at = (h: number) => new Date(2026, 10, 12, h, 0).getTime();
const row = (o: Record<string, unknown>) => ({ status: 'done', labels: [], visibility: 'team', createdAt: at(8), updatedAt: at(12), wrote: { status: { ts: at(12) } }, ...o });
const given = row({ id: 'g', title: 'Post-signup primary action', answer: 'Given to Maya Chen.' });
const done = row({ id: 'd', title: 'Refund copy', answer: 'Looks good, ship it.' });

describe('what counts as handed on', () => {
  it('a closed thread whose answer is the hand-on note', () => {
    expect(handedOn(given)).toBe(true);
  });
  it('not a thread still open, even with those words', () => {
    expect(handedOn({ ...given, status: 'open' })).toBe(false);
  });
  it('not an answer that merely starts alike', () => {
    expect(handedOn({ ...done, answer: 'Given the copy, ship it.' })).toBe(false);
    expect(handedOn(done)).toBe(false);
  });
});

describe('a handed-on thread', () => {
  // Its card stays: the person it went to opens the whole conversation through it.
  it('still goes up to the team, saying who it was given to', () => {
    const cards = cardsFor({ products: [{ slug: 'p', name: 'Product' }] as never, readItems: () => [given, done] as never, since: 0, me: 'p-ana', now: NOW });
    expect(cards.map((c) => [c.title, c.solution])).toEqual([['Post-signup primary action', 'Given to Maya Chen.'], ['Refund copy', null]]);
  });
  it('is not something its owner finished, on a teammate\'s screen', () => {
    const [card] = cardsFor({ products: [{ slug: 'p', name: 'Product' }] as never, readItems: () => [given] as never, since: 0, me: 'p-ana', now: NOW });
    const day = teamToday({
      range: 'today', window: { from: at(9), to: NOW }, now: NOW, me: 'p-maya', items: [], products: [], decisions: [], needs: [], mates: [], mateOf: () => null,
      people: [{ id: 'p-ana', name: 'Ana Ruiz' }], cards: [{ ...card, personId: 'p-ana', updatedAt: at(12) }] as never,
    });
    expect(day.people.find((p) => p.key === 'person:p-ana')?.finished ?? []).toEqual([]);
  });
  it('is not something its owner finished, on their own screen', () => {
    const day = teamToday({
      range: 'today', window: { from: at(9), to: NOW }, now: NOW, me: 'p-me', items: [{ ...given, product: 'p' }, { ...done, product: 'p' }] as never,
      products: [{ slug: 'p', name: 'Product' }] as never, cards: [], decisions: [], needs: [], people: [], mates: [], mateOf: () => null,
    });
    expect(day.people.find((p) => p.key === 'me')?.finished.map((l) => l.title)).toEqual(['Refund copy']);
  });
});
