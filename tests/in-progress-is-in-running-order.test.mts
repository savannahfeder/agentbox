// IN PROGRESS READS TOP-DOWN AS WHAT RUNS NEXT. IT USED TO READ AS WHAT MOVED LAST.
//
// She was right and the list was the second half of the fault. It sorted by
// `updatedAt` alone, so it read as "most recently touched". For a list of
// things WAITING TO BE TOUCHED that is close to the worst rule available: a
// queued row was last touched at the moment she filed it, so every minute it
// spends waiting pushes it further down. Her Urgent row therefore sank to the
// bottom BECAUSE nothing had started on it, which is the opposite of what she
// needed the list to tell her.
//
// The rows below are her actual In progress list from that screenshot, with
// the real priorities and the real timestamps out of her store.

import { describe, it, expect } from 'vitest';
import { byRunningOrder } from '../renderer/src/list-rules';
import { productRankScore } from '../shared/rank.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

const t = (iso) => Date.parse(iso);

// Her list at 22:55:01 on 2026-08-19. `updatedAt` is when the row last moved;
// for the queued rows that is when she filed or last answered them.
const herList = [
  { id: 'w-bfb07fa15c', priority: 7, updatedAt: t('2026-08-19T22:55:26Z'), title: 'Twelve of your edits are live' },
  { id: 'w-a4d536558d', priority: 9, updatedAt: t('2026-08-19T22:55:28Z'), title: 'Story two is the film' },
  { id: 'w-0c3c1a436d', priority: 7, updatedAt: t('2026-08-19T22:54:43Z'), title: 'Without updates, the first bad build' },
  { id: 'w-a3e5441a1d', priority: 7, updatedAt: t('2026-08-19T22:54:28Z'), title: 'The page is on nobody\'s internet' },
  { id: 'w-dc1bfb443e', priority: 7, updatedAt: t('2026-08-19T22:54:27Z'), title: `${Name} looks for Claude Code in one place` },
  { id: 'w-b30af3ba07', priority: 5, updatedAt: t('2026-08-19T22:55:59Z'), title: 'a rather large bug with our concept' },
  { id: 'w-1e701b3d84', priority: 5, updatedAt: t('2026-08-19T22:52:55Z'), title: 'The priority you pick now sticks' },
  { id: 'w-73c319c398', priority: 5, updatedAt: t('2026-08-19T22:52:32Z'), title: 'remove the games feature for V1' },
  { id: 'w-718d0d794b', priority: 5, updatedAt: t('2026-08-19T22:50:19Z'), title: 'The page promises privacy' },
  { id: 'w-e1b354a528', priority: 5, updatedAt: t('2026-08-19T22:49:55Z'), title: 'There is no app to download' },
  { id: 'w-7e64478ae4', priority: 5, updatedAt: t('2026-08-19T22:49:26Z'), title: 'A stranger who hits a bug' },
  { id: 'w-b4b773b888', priority: 5, updatedAt: t('2026-08-19T22:48:26Z'), title: 'all the screens for the lake theme' },
  { id: 'w-844cc74c14', priority: 5, updatedAt: t('2026-08-19T22:47:36Z'), title: 'The made shelf is still in the app' },
  { id: 'w-b12a4aa321', priority: 6, updatedAt: t('2026-08-19T22:47:16Z'), title: `When ${NAME} breaks on a stranger's Mac` },
  { id: 'w-495999caff', priority: 5, updatedAt: t('2026-08-19T22:44:55Z'), title: `Cut ${NAME} loose from Harbour` },
  // HERS. Urgent, filed at 22:43:58, and nothing had touched it since, which is
  // precisely why the old rule put it last.
  { id: 'w-4434b189ef', priority: 9, updatedAt: t('2026-08-19T22:43:58Z'), title: 'The landing page changes have not turned up' },
];

// One product, so the running order contributes nothing and the item's own
// priority is the whole score. That is her case: every row here is Agentbox.
const score = (i) => productRankScore([], 'agentbox') + (i.priority ?? 5);

const oldRule = (a, b) => b.updatedAt - a.updatedAt;

describe('the list she was looking at', () => {
  it('put her urgent row dead last, which is what she reported', () => {
    const was = [...herList].sort(oldRule);
    expect(was[was.length - 1].id).toBe('w-4434b189ef');
  });

  // NOT first, and that is the honest answer rather than the flattering one.
  // Two rows in her list were Urgent: this one and the film, which a worker
  // was already running and which had been touched twelve minutes more
  // recently. They tie on priority, so recency separates them and the film
  // keeps the top. Hers goes second, above all fourteen rows that had been
  // sitting in front of it on nothing but recency.
  it('now sits in the urgent pair at the top, not underneath fifteen rows', () => {
    const now = [...herList].sort(byRunningOrder(score));
    expect(now[1].id).toBe('w-4434b189ef');
    expect(now.findIndex((i) => i.id === 'w-4434b189ef')).toBeLessThan(2);
  });

  it('keeps both urgent rows above every high one', () => {
    const now = [...herList].sort(byRunningOrder(score));
    expect(now.slice(0, 2).map((i) => i.id).sort())
      .toEqual(['w-a4d536558d', 'w-4434b189ef'].sort());
  });

  it('reads straight down in priority, never back up', () => {
    const now = [...herList].sort(byRunningOrder(score));
    const levels = now.map((i) => i.priority);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
  });

  // The whole complaint in one number: how far she had to read to find it.
  it('moves it from row 16 of 16 to row 2 of 16', () => {
    const before = [...herList].sort(oldRule).findIndex((i) => i.id === 'w-4434b189ef') + 1;
    const after = [...herList].sort(byRunningOrder(score)).findIndex((i) => i.id === 'w-4434b189ef') + 1;
    expect(before).toBe(16);
    expect(after).toBe(2);
  });
});

describe('the rule itself', () => {
  it('breaks a tie on recency, so equal rows still read newest first', () => {
    const rows = [
      { id: 'older', priority: 5, updatedAt: 1000 },
      { id: 'newer', priority: 5, updatedAt: 2000 },
    ];
    expect([...rows].sort(byRunningOrder(score)).map((r) => r.id)).toEqual(['newer', 'older']);
  });

  it('lets a product high in her running order beat a lower product\'s urgent', () => {
    const order = ['agentbox', 'cascade'];
    const ranked = (i) => productRankScore(order, i.product) + (i.priority ?? 5);
    const rows = [
      { id: 'cascade-urgent', product: 'cascade', priority: 9, updatedAt: 2000 },
      { id: 'agentbox-low', product: 'agentbox', priority: 2, updatedAt: 1000 },
    ];
    expect([...rows].sort(byRunningOrder(ranked))[0].id).toBe('agentbox-low');
  });

  it('treats an untagged row as medium rather than as nothing', () => {
    const rows = [
      { id: 'untagged', updatedAt: 1000 },
      { id: 'low', priority: 2, updatedAt: 2000 },
    ];
    expect([...rows].sort(byRunningOrder(score))[0].id).toBe('untagged');
  });
});
