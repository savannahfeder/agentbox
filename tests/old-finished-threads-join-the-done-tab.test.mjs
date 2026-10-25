// THE OLD FINISHED THREADS ARRIVE ON DONE AS YOU SCROLL.
//
// Reported 2026-10-07 (w-fda2165ec6): "done" and "all" did not contain most of
// her tasks. Done was missing 155 that the 8 MB ledger read cut off
// (tests/old-finished-threads-load-a-page-at-a-time.test.mjs). The page of old
// finished threads the foot of the list asks for is merged into the rows here:
// a thread missing from the snapshot is added, a half-cut one is replaced by
// its whole copy, and one the snapshot already has whole is left alone,
// because the snapshot is the live copy.
//
// This file was the-all-tab-holds-finished-threads-too until the All tab went
// on 2026-10-14 (the-threads-page-has-no-all-tab.test.mjs). What it said about
// All went with it; what it said about Done stays.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { teammateRows } from '../renderer/src/threads/people-rules.ts';
import { withOlder } from '../renderer/src/older-threads.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

const NOW = Date.UTC(2026, 9, 7, 17);
const HOUR = 3_600_000;
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' };
const ids = (list) => list.map((r) => r.id ?? r.threadId ?? r.item?.id ?? r.card?.threadId);

describe("a teammate's threads on Done", () => {
  const card = (threadId, state, ago, priority = 5) => ({ personId: 'them', threadId, state, visible: true, title: threadId, project: 'P', priority, updatedAt: NOW - ago });
  const cards = [card('their-open', 'waiting', HOUR), card('their-done', 'done', 2 * HOUR)];

  it('are only the finished ones', () => {
    expect(ids(teammateRows(cards, { tab: 'done', picked: ['me', 'them'], me: 'me', display: byPriority, products: [], now: NOW }))).toEqual(['their-done']);
  });
});

describe('a page of old finished threads, merged into the rows', () => {
  const live = [
    { id: 'w-1', product: 'a', title: 'Live', createdAt: 10, updatedAt: 50, status: 'done' },
    { id: 'w-2', product: 'a', title: '', createdAt: 40, updatedAt: 45, status: 'done' },
  ];

  it('adds a thread the snapshot does not have', () => {
    const out = withOlder(live, [{ id: 'w-0', product: 'a', title: 'Old', createdAt: 1, updatedAt: 2, status: 'done' }]);
    expect(out.map((i) => i.id)).toEqual(['w-1', 'w-2', 'w-0']);
  });

  it('replaces a half-cut one with its whole copy', () => {
    const out = withOlder(live, [{ id: 'w-2', product: 'a', title: 'Started long ago', createdAt: 5, updatedAt: 45, status: 'done' }]);
    expect(out.find((i) => i.id === 'w-2').title).toBe('Started long ago');
  });

  it('keeps the live copy when the snapshot already has it whole', () => {
    const out = withOlder(live, [{ id: 'w-1', product: 'a', title: 'Stale', createdAt: 10, updatedAt: 20, status: 'done' }]);
    expect(out.find((i) => i.id === 'w-1').title).toBe('Live');
  });

  it('keeps the live copy when it moved on since the page was read', () => {
    const out = withOlder(live, [{ id: 'w-2', product: 'a', title: 'Started long ago', createdAt: 5, updatedAt: 30, status: 'done' }]);
    expect(out.find((i) => i.id === 'w-2').title).toBe('');
  });

  it('does not confuse the same id in two projects', () => {
    const out = withOlder(live, [{ id: 'w-1', product: 'b', title: 'Other project', createdAt: 1, updatedAt: 2, status: 'done' }]);
    expect(out).toHaveLength(3);
  });

  it('hands the snapshot back untouched when there is nothing older', () => {
    expect(withOlder(live, [])).toBe(live);
  });
});

describe('the app', () => {
  const app = src('App.tsx');
  it('asks for the next page at the foot of Done, and only there', () => {
    expect(app).toMatch(/onEnd=\{[^}]*view === 'done' \? loadOlder/);
    expect(src('components', 'List.tsx')).toContain('IntersectionObserver');
  });
  it('merges what arrives into the rows every tab reads', () => {
    expect(app).toMatch(/withOlder\(snap\?\.items \?\? \[\], older\)/);
    expect(app).toMatch(/walkRows\(itemsWithOlder, run\)/);
  });
});
