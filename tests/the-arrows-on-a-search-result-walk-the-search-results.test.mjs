// A thread opened from search counted its place in Needs you. A tester typed
// "postgres", took the second result and read "SEARCH 6 OF 32": 32 was Needs
// you, 6 was the thread's place there. The count has since gone from the bar
// (bdaa47ba), but the arrows beside it still walked Needs you. Measured in the
// built renderer with real keys: on the second of seven results, the Next
// arrow opened the next thread in Needs you while J, which walks what search
// shows, opened the third result. The arrows now count and step through the
// search results while a search is up, and are drawn where they were before.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { arrowRows, spotIn, stepIn } from '../renderer/src/one-thing-at-a-time.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const t = (id) => ({ product: 'p', id });
const needsYou = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'].map(t);
// Search order is match order, not Needs you order.
const hits = ['alpha', 'charlie', 'foxtrot', 'bravo', 'delta', 'echo', 'golf'].map(t);
const walk = (item, searching) => {
  const rows = arrowRows(needsYou, searching ? hits : null, item);
  return { spot: spotIn(rows, item), next: stepIn(rows, item, 1)?.id ?? null, prev: stepIn(rows, item, -1)?.id ?? null };
};

describe('the arrows over a thread opened from search', () => {
  it('count it as the second result and step to the results either side', () => {
    expect(walk(t('charlie'), true)).toEqual({ spot: { pos: 2, total: 7, index: 1 }, next: 'foxtrot', prev: 'alpha' });
  });

  it('stop at the first and the last result', () => {
    expect(walk(t('alpha'), true)).toMatchObject({ spot: { index: 0 }, prev: null, next: 'charlie' });
    expect(walk(t('golf'), true)).toMatchObject({ spot: { pos: 7, total: 7 }, next: null, prev: 'echo' });
  });

  it('walk Needs you when no search is up', () => {
    expect(walk(t('charlie'), false)).toEqual({ spot: { pos: 3, total: 7, index: 2 }, next: 'delta', prev: 'bravo' });
  });

  it('walk Needs you for a thread the results no longer hold', () => {
    const rows = arrowRows(needsYou, hits.filter((h) => h.id !== 'delta'), t('delta'));
    expect(rows).toBe(needsYou);
  });
});

describe('where the app wires it', () => {
  const app = read('renderer/src/App.tsx');
  it('counts in the list J and K walk while searching, for the place and for the step', () => {
    expect(app).toMatch(/const arrowsWalk = arrowRows\(shownInbox, search !== null \? list : null, focused\);/);
    expect(app).toMatch(/const to = focused && stepIn\(arrowsWalk, focused, dir\);/);
    expect(app).toMatch(/queue=\{queueSpot && !inChats \? \{ spot: spotIn\(arrowsWalk, focused\) \?\? queueSpot, onStep: stepQueue \} : null\}/);
  });
  it('and still draws the arrows only on a thread in Needs you', () => {
    expect(app).toMatch(/const queueSpot = spotIn\(shownInbox, focused\);/);
  });
});
