// J AND K WALK ONTO A TEAMMATE'S THREAD WHEN THEIR THREADS ARE ON THE PAGE.
//
// Reported 2026-10-05 (w-fb16bcaeba): "when I hit J here nothing happens.
// Probably because the next task is my teammate's. But if I'm in team view on
// my board then it should show that naturally as I'm navigating through the
// inbox. If I want to not see it then i would remove my team's visibility."
// Measured in the code: the Waiting tab drew four rows, hers first and three
// of her teammates' under it, and J inside her thread walked `list`, which is
// her own rows only (`displayedBox`, or `boardWalk` on the board, which said
// outright "a teammate's card ... J and K pass over it"). Her row was the last
// of hers, so J found nothing and did nothing. The list page skipped the same
// rows, and an open teammate's card had no J, K or Escape of its own at all.
//
// Now the keyboard walks what is drawn (`listStops`, `boardStops`), and a
// teammate's thread is a stop like any other: it opens as their card. With no
// teammate picked there are no cards in the walk, so your own page walks
// exactly as it did.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { boardColumns } from '../renderer/src/threads/page-rules.ts';
import { mergeRows } from '../renderer/src/threads/people-rules.ts';
import { boardStops, listStops, stepStop, stopKey } from '../renderer/src/threads/walk-rules.ts';

const NOW = Date.UTC(2026, 9, 5, 17);
const MIN = 60_000;
const products = [{ slug: 'p', name: 'P' }];
const item = (id, priority, agoMin, state = 'waiting') => ({ id, priority, product: 'p', title: id, status: 'open', updatedAt: NOW - agoMin * MIN, _state: state });
const card = (threadId, personId, priority, agoMin, state = 'waiting') => ({ threadId, personId, visible: true, title: threadId, project: 'P', state, priority, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: NOW - agoMin * MIN });
const name = (s) => (s.item ? s.item.id : `${s.card.personId}:${s.card.threadId}`);

// The screenshot: hers at Low, then Margarette's Urgent and David's two, all
// on the Waiting tab, sorted by priority with hers first by project order.
const mine = [item('concurrency', 2, 120)];
const theirs = [card('capabilities', 'margarette', 9, 720), card('runner', 'david', 5, 4), card('proxy', 'david', 2, 12)];

describe('the list, with a teammate on the page', () => {
  const mixed = [{ item: mine[0] }, ...theirs.map((c) => ({ card: c }))];
  const stops = listStops(mine, mixed);

  it('walks the rows in the order they are drawn, theirs included', () => {
    expect(stops.map(name)).toEqual(['concurrency', 'margarette:capabilities', 'david:runner', 'david:proxy']);
  });

  it('J from your last thread lands on the teammate thread under it (the reported case)', () => {
    expect(name(stepStop(stops, { item: mine[0] }, 1))).toBe('margarette:capabilities');
  });

  it('J and K carry on from inside a teammate thread', () => {
    expect(name(stepStop(stops, { card: theirs[0] }, 1))).toBe('david:runner');
    expect(name(stepStop(stops, { card: theirs[0] }, -1))).toBe('concurrency');
  });

  it('stays put at either end rather than wrapping', () => {
    expect(stepStop(stops, { card: theirs[2] }, 1)).toBeNull();
    expect(stepStop(stops, { item: mine[0] }, -1)).toBeNull();
  });

  it('finds a card by who and which thread, not by being the same object', () => {
    expect(name(stepStop(stops, { card: { ...theirs[1] } }, 1))).toBe('david:proxy');
    expect(stopKey({ card: theirs[1] })).not.toBe(stopKey({ card: { ...theirs[1], personId: 'margarette' } }));
  });

  it('works off the merge the page itself draws', () => {
    const drawn = listStops(mine, mergeRows(mine, theirs, 'priority', { order: ['p'], products }));
    expect(drawn.map(name)).toContain('margarette:capabilities');
    expect(drawn).toHaveLength(4);
  });
});

describe('the list, with only you on the page', () => {
  const two = [item('a', 5, 1), item('b', 5, 2)];

  it('walks your own threads exactly as before, with no teammate in it', () => {
    const stops = listStops(two, null);
    expect(stops.map(name)).toEqual(['a', 'b']);
    expect(stepStop(stops, { item: two[1] }, 1)).toBeNull();
  });

  it('never walks onto a row of yours the page is not drawing', () => {
    // The table draws a merged row only when it is also in your list.
    const stops = listStops([two[0]], [{ item: two[0] }, { item: two[1] }, { card: theirs[0] }]);
    expect(stops.map(name)).toEqual(['a', 'margarette:capabilities']);
  });

  it('starts from the fallback place when the open thread is not on the page', () => {
    const stops = listStops(two, null);
    expect(name(stepStop(stops, { item: item('elsewhere', 5, 9) }, 1, 0))).toBe('b');
    expect(stepStop(stops, null, 1, 1)).toBeNull();
  });
});

describe('the board, with a teammate on the page', () => {
  const stateOf = (i) => i._state;
  const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' };
  const items = [item('w-mine', 5, 3), item('r-mine', 5, 3, 'running')];
  const cols = (picked) => boardColumns({ items, products, display, now: NOW, stateOf, cards: [card('w-theirs', 'm', 9, 1), card('r-theirs', 'm', 2, 1, 'running')], picked, me: 'me' });

  it('walks down each column and on, their cards in place', () => {
    expect(boardStops(cols(['me', 'm'])).map(name)).toEqual(['m:w-theirs', 'w-mine', 'r-mine', 'm:r-theirs']);
  });

  it('carries J from your last waiting card past theirs into the next column', () => {
    const stops = boardStops(cols(['me', 'm']));
    expect(name(stepStop(stops, { item: items[0] }, 1))).toBe('r-mine');
    expect(name(stepStop(stops, { item: items[1] }, 1))).toBe('m:r-theirs');
  });

  it('has none of their cards when they are not picked', () => {
    expect(boardStops(cols(['me'])).map(name)).toEqual(['w-mine', 'r-mine']);
  });
});

describe('the app walks the stops', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

  it('from inside a thread, from a teammate card and from the page', () => {
    // Three walkers: an open thread, an open teammate card, and the page.
    expect(app.match(/stepStop\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('opens a teammate thread the walk lands on as their card', () => {
    expect(app).toMatch(/goToStop/);
  });
});
