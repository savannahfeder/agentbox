// A conversation she has just imported, and where it goes.
//
// WHY IT WAS NEAR THE BOTTOM, measured on her own store on 2026-09-19 rather
// than argued: the inbox sorts on the score in shared/rank.mjs, where a step in
// her running order over her projects is worth a hundred points and the row's
// own priority breaks ties. An import lands in the project whose folder the
// conversation ran in and comes in at the default priority of 5. The row in her
// screenshot belongs to `zero`, 28th of her 33 projects, so it scored 605
// against the app's 3305 and sorted 19th of her 21 open rows.
//
// The two halves below are one rule on purpose: `justImported` decides both
// where the row sits and whether it says so, so the lift and the words cannot
// drift apart.

import { describe, expect, it } from 'vitest';
import { justImported, JUST_IMPORTED_WORD } from '../renderer/src/import-row.ts';
import { productRankScore, itemPriority } from '../shared/rank.mjs';
import { byRunningOrder } from '../renderer/src/list-rules.ts';

const imported = (over = {}) => ({
  id: 'w-imported', status: 'open', priority: 5, updatedAt: 3,
  labels: ['codex', 'codex:01a0ad63-c62b-73c1-a5ff-fd6bac244f84'],
  product: 'zero', title: 'Animate agentbox launch storyboard',
  ...over,
});

const none = new Set();

describe('what counts as just imported', () => {
  it('is a conversation she brought in and has not opened', () => {
    expect(justImported(imported(), none)).toBe(true);
  });

  it('stops the moment she opens it', () => {
    expect(justImported(imported(), new Set(['w-imported']))).toBe(false);
  });

  it('is not the row that ASKS whether to import, which has its own Y and N', () => {
    const asking = imported({ labels: ['codex-import', 'codex:01a0ad63'] });
    expect(justImported(asking, none)).toBe(false);
  });

  it('is not one she closed', () => {
    expect(justImported(imported({ status: 'done' }), none)).toBe(false);
  });

  it('is not an ordinary row of hers, however new', () => {
    expect(justImported({ id: 'w-1', status: 'open', labels: [], updatedAt: 9 }, none)).toBe(false);
    expect(justImported(null, none)).toBe(false);
  });

  it('has a word for the row that is hers, not ours', () => {
    expect(JUST_IMPORTED_WORD).toBe('just imported');
  });
});

describe('where it lands in the inbox', () => {
  // Her real running order on 2026-09-19, the two ends of it that matter here.
  const order = ['agentbox', 'harbour-new', 'meadow-3', 'cascade', 'test-proj', 'zero'];
  const score = (i) => productRankScore(order, i.product) + itemPriority(i);

  const powerupRow = { id: 'w-agentbox', status: 'open', product: 'agentbox', priority: 5, updatedAt: 2, labels: [] };
  const otherRow = { id: 'w-other', status: 'open', product: 'cascade', priority: 5, updatedAt: 1, labels: [] };

  it('the score alone buries it, which is the bug she reported', () => {
    const rows = [powerupRow, otherRow, imported()].sort(byRunningOrder(score));
    expect(rows.map((r) => r.id)).toEqual(['w-agentbox', 'w-other', 'w-imported']);
  });

  it('lifted out of the scored block, it is first', () => {
    const rows = [powerupRow, otherRow, imported()].sort(byRunningOrder(score));
    const fresh = rows.filter((i) => justImported(i, none));
    const rest = rows.filter((i) => !justImported(i, none));
    expect([...fresh, ...rest].map((r) => r.id)).toEqual(['w-imported', 'w-agentbox', 'w-other']);
  });

  it('and once she has opened it, it is back where the score puts it', () => {
    const seen = new Set(['w-imported']);
    const rows = [powerupRow, otherRow, imported()].sort(byRunningOrder(score));
    const fresh = rows.filter((i) => justImported(i, seen));
    const rest = rows.filter((i) => !justImported(i, seen));
    expect(fresh).toEqual([]);
    expect([...fresh, ...rest].map((r) => r.id)).toEqual(['w-agentbox', 'w-other', 'w-imported']);
  });

  it('two of them read newest first, the way the sort already left them', () => {
    const older = imported({ id: 'w-older', updatedAt: 1 });
    const newer = imported({ id: 'w-newer', updatedAt: 9 });
    const rows = [older, newer, powerupRow].sort(byRunningOrder(score));
    const fresh = rows.filter((i) => justImported(i, none));
    expect(fresh.map((r) => r.id)).toEqual(['w-newer', 'w-older']);
  });
});
