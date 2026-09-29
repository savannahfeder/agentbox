// The founder's running order over her companies, and the one score derived
// from it. This is the rule that decides what the fleet works on next AND what
// the inbox shows first, so it gets pinned hard.
//
// The order replaced three buckets (high/normal/low) on 2026-08-06. Buckets
// left every tie inside a bucket unanswered, and "which of these two comes
// first" is the question the fleet actually needs settled.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RANK_STEP, DEFAULT_PRIORITY, itemPriority,
  normalizeOrder, productRankScore, orderFromTiers, moveProduct, landingIndex,
} from '../shared/rank.mjs';
import { Supervisor } from '../main/supervisor.mjs';

describe('the order itself', () => {
  it('drops blanks, non-strings and duplicates', () => {
    expect(normalizeOrder(['a', '', 'b', 'a', null, 7, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('treats anything that is not a list as no order at all', () => {
    expect(normalizeOrder(undefined)).toEqual([]);
    expect(normalizeOrder({ a: 1 })).toEqual([]);
  });

  it('moves a product to a new place without disturbing the rest', () => {
    expect(moveProduct(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveProduct(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('lets a product that was never ranked join by being moved', () => {
    expect(moveProduct(['a', 'b'], 'zzz', 0)).toEqual(['zzz', 'a', 'b']);
  });

  it('clamps a move past either end instead of losing the product', () => {
    expect(moveProduct(['a', 'b'], 'b', 99)).toEqual(['a', 'b']);
    expect(moveProduct(['a', 'b'], 'b', -5)).toEqual(['b', 'a']);
  });
});

// Twenty two chips wrap to four rows in the composer. The first version of the
// drag compared the pointer's X against chip centres and ignored Y entirely,
// which is right for one row and useless for four: every row spans the same X
// range, so dragging a chip up or down moved nothing at all (founder,
// 2026-08-06). These are the rows.
describe('where a dragged chip lands, across wrapped rows', () => {
  // three rows of two, each chip 100 wide and 30 tall
  const rects = [
    { left: 0, width: 100, top: 0, bottom: 30 }, { left: 110, width: 100, top: 0, bottom: 30 },
    { left: 0, width: 100, top: 40, bottom: 70 }, { left: 110, width: 100, top: 40, bottom: 70 },
    { left: 0, width: 100, top: 80, bottom: 110 }, { left: 110, width: 100, top: 80, bottom: 110 },
  ];

  it('lands before the chip whose left half the pointer is over', () => {
    expect(landingIndex(rects, 10, 15)).toBe(0);
    expect(landingIndex(rects, 120, 15)).toBe(1);
  });

  it('lands after a chip once the pointer passes its centre', () => {
    expect(landingIndex(rects, 90, 15)).toBe(1);
    expect(landingIndex(rects, 200, 15)).toBe(2);
  });

  // The regression: same X, different row, must be a different answer.
  it('distinguishes rows at identical X', () => {
    expect(landingIndex(rects, 10, 15)).toBe(0);
    expect(landingIndex(rects, 10, 55)).toBe(2);
    expect(landingIndex(rects, 10, 95)).toBe(4);
  });

  it('reads the gap between two rows as the start of the lower one', () => {
    expect(landingIndex(rects, 500, 35)).toBe(2);
  });

  it('lands at the end when the pointer is past everything', () => {
    expect(landingIndex(rects, 500, 200)).toBe(rects.length);
    expect(landingIndex(rects, 500, 95)).toBe(rects.length);
  });

  it('survives being handed nothing', () => {
    expect(landingIndex([], 5, 5)).toBe(0);
    expect(landingIndex(undefined, 5, 5)).toBe(0);
  });
});

describe('what the order is worth', () => {
  const order = ['first', 'second', 'third'];

  it('ranks earlier above later', () => {
    expect(productRankScore(order, 'first')).toBeGreaterThan(productRankScore(order, 'second'));
    expect(productRankScore(order, 'second')).toBeGreaterThan(productRankScore(order, 'third'));
  });

  it('puts an unplaced product below every placed one, and ties it with the rest', () => {
    expect(productRankScore(order, 'nobody')).toBe(0);
    expect(productRankScore(order, 'nobody')).toBe(productRankScore(order, 'also-nobody'));
    expect(productRankScore(order, 'third')).toBeGreaterThan(productRankScore(order, 'nobody'));
  });

  // The whole point of the model: a place in the order beats any tag.
  it('makes a higher project low beat a lower project urgent', () => {
    const high = productRankScore(order, 'first') + 2;   // Low
    const low = productRankScore(order, 'second') + 9;   // Urgent
    expect(high).toBeGreaterThan(low);
  });

  it('leaves an item priority room to break ties inside one project', () => {
    expect(RANK_STEP).toBeGreaterThan(9);
  });

  // Ranking arrived after the inbox did. With no order set, the score has to
  // reduce to exactly what it was before, or turning the feature on by
  // upgrading would silently reshuffle her inbox.
  it('behaves exactly like the old flat inbox when nothing is ranked', () => {
    expect(productRankScore([], 'anything')).toBe(0);
  });
});

describe('migrating off the three buckets', () => {
  it('keeps the founder\'s intent: highs first, lows last', () => {
    const out = orderFromTiers({ cascade: -1, harbour: 1, kestrel: 0, quarry: 1 });
    expect(out.indexOf('agentbox')).toBeLessThan(out.indexOf('cascade'));
    expect(out.indexOf('quarry')).toBeLessThan(out.indexOf('cascade'));
  });

  it('does not invent an order out of products that were never tagged', () => {
    expect(orderFromTiers({ a: 0, b: 0 })).toEqual([]);
    expect(orderFromTiers(null)).toEqual([]);
  });
});

describe('the supervisor spawns in that order', () => {
  const makeSupervisor = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-rank-'));
    return new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 },
      { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
  };

  it('scores a higher project above a lower one whatever the item says', () => {
    const sup = makeSupervisor();
    sup.setProductOrder(['agentbox', 'kestrel', 'cascade']);
    const score = (product, priority) => sup._score({ product, priority });
    expect(score('agentbox', 2)).toBeGreaterThan(score('kestrel', 9));
    expect(score('kestrel', 2)).toBeGreaterThan(score('cascade', 9));
  });

  it('persists the order across a restart', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-rank-'));
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const first = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
    first.setProductOrder(['b', 'a']);
    const second = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
    expect(second.productOrder).toEqual(['b', 'a']);
  });

  it('reads a pre-order state file and carries the old tiers over', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-rank-'));
    fs.writeFileSync(path.join(root, '.zero-supervisor.json'),
      JSON.stringify({ productTiers: { top: 1, bottom: -1 } }));
    const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 },
      { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
    expect(sup.productOrder).toEqual(['top', 'bottom']);
  });

  it('reports the order in its status, which is what the inbox sorts by', () => {
    const sup = makeSupervisor();
    sup.setProductOrder(['a', 'b']);
    expect(sup.status().productOrder).toEqual(['a', 'b']);
  });
});

describe('hiding a product from the picker', () => {
  const makeSupervisor = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-hide-'));
    return new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 },
      { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
  };

  it('hides and shows, and reports it in the status the picker reads', () => {
    const sup = makeSupervisor();
    sup.setProductHidden('test', true);
    expect(sup.status().hiddenProducts).toEqual(['test']);
    sup.setProductHidden('test', false);
    expect(sup.status().hiddenProducts).toEqual([]);
  });

  it('survives a restart', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-hide-'));
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const first = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
    first.setProductHidden('untitled', true);
    const second = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
    expect([...second.hiddenProducts]).toEqual(['untitled']);
  });

  // Hiding is a filing decision about ONE list. If it ever became an off
  // switch, work would vanish silently, which is the opposite of an inbox.
  it('does not change what the fleet works on', () => {
    const sup = makeSupervisor();
    sup.setProductOrder(['a', 'b']);
    const before = sup._score({ product: 'a', priority: 5 });
    sup.setProductHidden('a', true);
    expect(sup._score({ product: 'a', priority: 5 })).toBe(before);
    expect(sup.productOrder).toEqual(['a', 'b']);
  });
});


// The number on an item is hers alone. Agents used to set it off a rule in
// the worker brief; that rule is gone and so is its effect, including on the
// items already in the store carrying an agent's 8.
describe('whose priority counts', () => {
  const agentTagged = (n) => ({ priority: n, wrote: { priority: { ts: 1, source: 'agent' } } });
  const composed = (n) => ({ priority: n, wrote: { priority: { ts: 1, source: 'system' } } });
  const answeredWith = (n) => ({ priority: n, wrote: { priority: { ts: 1, source: 'founder' } } });

  it("an agent's own number does not move it", () => {
    expect(itemPriority(agentTagged(9))).toBe(DEFAULT_PRIORITY);
    expect(itemPriority(agentTagged(2))).toBe(DEFAULT_PRIORITY);
  });

  // Her compose box stamps the number as 'system' and her reply stamps it as
  // 'founder'. Both are hers and both are taken exactly.
  it('her own tag is taken exactly, whichever way she set it', () => {
    expect(itemPriority(composed(9))).toBe(9);
    expect(itemPriority(composed(2))).toBe(2);
    expect(itemPriority(answeredWith(9))).toBe(9);
    expect(itemPriority(answeredWith(2))).toBe(2);
  });

  it('an untagged item sits in the middle, not at the bottom', () => {
    expect(itemPriority({ priority: 0 })).toBe(DEFAULT_PRIORITY);
    expect(itemPriority(composed(0))).toBe(DEFAULT_PRIORITY);
    expect(itemPriority({})).toBe(DEFAULT_PRIORITY);
    expect(itemPriority(null)).toBe(DEFAULT_PRIORITY);
  });

  it('her urgent still beats her low inside one product', () => {
    const order = ['first', 'second'];
    const hot = productRankScore(order, 'first') + itemPriority(composed(9));
    const cold = productRankScore(order, 'first') + itemPriority(composed(2));
    expect(hot).toBeGreaterThan(cold);
  });

  it("an agent's 9 no longer beats an untagged row in the same product", () => {
    const order = ['first'];
    const loud = productRankScore(order, 'first') + itemPriority(agentTagged(9));
    const quiet = productRankScore(order, 'first') + itemPriority({});
    expect(loud).toBe(quiet);
  });

  it('a whole product she ranks higher still outranks any tag at all', () => {
    const order = ['first', 'second'];
    const low = productRankScore(order, 'first') + itemPriority(composed(2));
    const urgent = productRankScore(order, 'second') + itemPriority(composed(9));
    expect(low).toBeGreaterThan(urgent);
  });
});
