// A THREAD DRAGGED IN THE LIST KEEPS ITS PLACE, AND THE FLEET RUNS IT THERE.
//
// Asked for 2026-10-07 (w-6e5b532a95), over a picture of the threads list:
// "sometimes there are tasks that are higher priority than other projects and
// it's hard to articulate. I'd rather be able to drag things around here ...
// and have that priority remembered and that's how the app processes it."
//
// Until now the only order was the project's place, worth 100, plus the
// thread's own level, worth 2 to 9, so a Low thread in a lower project could
// never sit above anything in a higher one, however much it mattered that
// day. Measured before the fix: there was no way to give one thread a place of
// its own at all, so `sorted` and `Supervisor#_score` had nothing to read.
//
// A drag now writes the thread a PLACE: a number on the same scale as that
// score, between its new neighbours'. The list sorts by it, the fleet spawns by
// it, and it is kept in the supervisor's state beside the project order.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dropPlaces } from '../shared/rank.mjs';
import { sorted, rankScore, sortedEntries, entryScore, placesForDrop, overlayPlaces, PLACE_WAIT } from '../renderer/src/threads/page-rules.ts';
import { Supervisor } from '../main/supervisor.mjs';
import { chipHome, edgeScroll, grabWithin, shiftFor, slotOffset, stays } from '../renderer/src/threads/row-drag.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const MIN = 60_000;
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const ORDER = ['personal', 'team-app'];
const row = (id, product, priority, agoMin, place) => ({ id, product, priority, title: id, status: 'open', updatedAt: NOW - agoMin * MIN, ...(place !== undefined ? { place } : {}) });
const ids = (list) => list.map((r) => r.id);
// The rows as the list draws them, with the score each one sorts by.
const scored = (rows) => sorted(rows, byPriority, undefined, ORDER).map((r) => ({ id: r.id, score: rankScore(r, ORDER) }));
// Apply a drop the way the app does: write the places, sort again.
const drop = (rows, id, beforeId) => {
  const shown = scored(rows);
  const from = shown.findIndex((r) => r.id === id);
  const to = beforeId ? shown.findIndex((r) => r.id === beforeId) : shown.length;
  const places = dropPlaces(shown, from, to);
  const next = rows.map((r) => (places && r.id in places ? { ...r, place: places[r.id] } : r));
  return { places, order: ids(sorted(next, byPriority, undefined, ORDER)) };
};

describe('dragging a thread in the list', () => {
  // Personal sits above the team product, as in the picture.
  const rows = [
    row('p-high', 'personal', 7, 10),
    row('p-low', 'personal', 2, 20),
    row('t-urgent', 'team-app', 9, 30),
    row('t-medium', 'team-app', 5, 40),
    row('t-low', 'team-app', 2, 50),
  ];

  it('starts in project order, then level', () => {
    expect(ids(sorted(rows, byPriority, undefined, ORDER))).toEqual(['p-high', 'p-low', 't-urgent', 't-medium', 't-low']);
  });

  it('lifts a lower project\'s thread above a higher project\'s, which a level never could', () => {
    expect(drop(rows, 't-medium', 'p-high').order).toEqual(['t-medium', 'p-high', 'p-low', 't-urgent', 't-low']);
  });

  it('puts it between two threads of different projects', () => {
    expect(drop(rows, 't-low', 'p-low').order).toEqual(['p-high', 't-low', 'p-low', 't-urgent', 't-medium']);
  });

  it('drops one to the very end', () => {
    expect(drop(rows, 'p-high', null).order).toEqual(['p-low', 't-urgent', 't-medium', 't-low', 'p-high']);
  });

  it('writes only the dragged thread when its neighbours already differ', () => {
    expect(Object.keys(drop(rows, 't-low', 'p-low').places)).toEqual(['t-low']);
  });

  it('writes nothing when a thread is let go where it was', () => {
    expect(dropPlaces(scored(rows), 2, 2)).toBeNull();
    expect(dropPlaces(scored(rows), 2, 3)).toBeNull();
  });

  // Two Medium threads in one project tie, and the list breaks the tie by
  // which changed last. A place between them has to hold anyway, so the ones
  // above the drop are given places of their own, in the order they were drawn.
  it('holds a place between two threads that tie, and keeps the ones above in order', () => {
    const tied = [row('a', 'team-app', 5, 1), row('b', 'team-app', 5, 2), row('c', 'team-app', 5, 3), row('d', 'team-app', 5, 4)];
    const out = drop(tied, 'd', 'b');
    expect(out.order).toEqual(['a', 'd', 'b', 'c']);
    expect(Object.keys(out.places).sort()).toEqual(['a', 'd']);
  });

  it('does not move threads it did not touch when one is placed between them', () => {
    const out = drop(rows, 't-low', 'p-low');
    const after = rows.map((r) => (r.id in out.places ? { ...r, place: out.places[r.id] } : r));
    // A new Urgent thread in the team product still lands by its level.
    const fresh = [...after, row('t-new-urgent', 'team-app', 9, 0)];
    expect(ids(sorted(fresh, byPriority, undefined, ORDER))).toEqual(['p-high', 't-low', 'p-low', 't-new-urgent', 't-urgent', 't-medium']);
  });
});

// THE BOARD, SAME IDEA (asked 2026-10-07 on the same thread): a card dragged
// up or down its column keeps that place, by the same rule as the list.
describe('dragging a card in a board column', () => {
  const entry = (id, projectSlug, priority, agoMin, place) => ({
    key: id, ownerId: 'u', state: 'waiting', title: id, project: projectSlug, projectSlug, priority, updatedAt: NOW - agoMin * MIN,
    item: { id, product: projectSlug, priority, updatedAt: NOW - agoMin * MIN, status: 'open', ...(place !== undefined ? { place } : {}) },
  });
  const column = [entry('p-high', 'personal', 7, 10), entry('p-low', 'personal', 2, 20), entry('t-medium', 'team-app', 5, 40)];
  const shown = (entries) => sortedEntries(entries, byPriority, 'waiting', ORDER).map((e) => e.key);

  it('sorts a column by a card\'s place', () => {
    expect(shown(column)).toEqual(['p-high', 'p-low', 't-medium']);
    const rows = sortedEntries(column, byPriority, 'waiting', ORDER).map((e) => ({ id: e.item.id, score: entryScore(e, ORDER) }));
    const places = placesForDrop(rows, 't-medium', 'p-high');
    const moved = column.map((e) => (e.item.id in places ? { ...e, item: { ...e.item, place: places[e.item.id] } } : e));
    expect(shown(moved)).toEqual(['t-medium', 'p-high', 'p-low']);
  });

  it('writes nothing when a card is let go where it was', () => {
    const rows = sortedEntries(column, byPriority, 'waiting', ORDER).map((e) => ({ id: e.item.id, score: entryScore(e, ORDER) }));
    expect(placesForDrop(rows, 'p-low', 't-medium')).toBeNull();
  });

  it('sends a card dropped below the last one to the foot', () => {
    const rows = sortedEntries(column, byPriority, 'waiting', ORDER).map((e) => ({ id: e.item.id, score: entryScore(e, ORDER) }));
    const places = placesForDrop(rows, 'p-high', null);
    const moved = column.map((e) => (e.item.id in places ? { ...e, item: { ...e.item, place: places[e.item.id] } } : e));
    expect(shown(moved)).toEqual(['p-low', 't-medium', 'p-high']);
  });
});

// ROUND TWO: a review found that a snapshot asked for just before a drop
// lands after it and put the row back for a poll's length. Each snapshot now
// wears the places still on their way, until it carries them itself.
describe('a place on its way to the main process', () => {
  it('is laid over a snapshot that does not carry it yet', () => {
    const unsaved = { a: { place: 300, at: NOW } };
    const out = overlayPlaces([{ id: 'a' }, { id: 'b' }], unsaved, NOW + 1000);
    expect(out[0].place).toBe(300);
    expect(out[1].place).toBeUndefined();
    expect(unsaved.a).toBeDefined();
  });
  it('is forgotten once a snapshot carries it', () => {
    const unsaved = { a: { place: 300, at: NOW } };
    overlayPlaces([{ id: 'a', place: 300 }], unsaved, NOW + 1000);
    expect(unsaved).toEqual({});
  });
  it('is forgotten when the thread has left the snapshot', () => {
    const unsaved = { a: { place: 300, at: NOW } };
    overlayPlaces([{ id: 'b' }], unsaved, NOW + 1000);
    expect(unsaved).toEqual({});
  });
  it('gives up after PLACE_WAIT, so a place the app has since cleared is not forced back', () => {
    const unsaved = { a: { place: 300, at: NOW } };
    const out = overlayPlaces([{ id: 'a' }], unsaved, NOW + PLACE_WAIT + 1);
    expect(out[0].place).toBeUndefined();
    expect(unsaved).toEqual({});
  });
  it('hands back the very same list when nothing is waiting', () => {
    const items = [{ id: 'a' }];
    expect(overlayPlaces(items, {})).toBe(items);
  });
});

describe('a drag near the edge of a long list', () => {
  // A list on screen from y=100 to y=700.
  it('scrolls up near the top and down near the bottom, faster nearer the edge', () => {
    expect(edgeScroll(110, 100, 700)).toBeLessThan(0);
    expect(edgeScroll(690, 100, 700)).toBeGreaterThan(0);
    expect(Math.abs(edgeScroll(101, 100, 700))).toBeGreaterThan(Math.abs(edgeScroll(150, 100, 700)));
  });
  it('does not scroll with the pointer in the middle', () => {
    expect(edgeScroll(400, 100, 700)).toBe(0);
    expect(edgeScroll(100 + 56, 100, 700)).toBe(0);
  });
});

// ROUND FOUR: the row stays in the list as its own empty slot while a preview
// rides the pointer, so the slot has to sit exactly where the row will land.
// ROUND SIX (2026-10-08): "in inbox view, the component I'm dragging jumps
// really far horizontally. In board view, it moves just as much as I would
// expect." The list's chip was placed with its left edge 16px left of the
// pointer the moment it lifted, so a row grabbed by its middle (900px in) had
// its title leap 550px across the screen. The board's card copy keeps the
// spot it was grabbed by, so it never moved more than the hand. Now the chip
// lifts exactly where the row's title is, and only then drifts under the hand.
describe('the chip a list row lifts into', () => {
  it('starts on the row\'s own title, so nothing jumps at the lift', () => {
    // A row at x=300, y=200; its title is 32px in, on a 20px line 19px down.
    const home = chipHome({ left: 300, top: 200 }, 40);
    expect(home.left).toBe(300 + 32 - 16);
    expect(home.top).toBe(200 + 29 - 20);
  });
  it('keeps the spot it was grabbed by when that spot is on the chip', () => {
    expect(grabWithin(120, 400)).toBe(120);
  });
  it('drifts under the hand when the row was grabbed past the chip\'s end', () => {
    // Grabbed 900px in, on a chip 400px wide: it settles with the hand near
    // its right end, never further than the hand has moved.
    expect(grabWithin(900, 400)).toBe(400 - 16);
    expect(grabWithin(-30, 400)).toBe(16);
  });
});

describe('the empty slot a carried row leaves', () => {
  // Board cards of different heights with a 13px gap between them.
  const rows = [{ top: 0, bottom: 100 }, { top: 113, bottom: 160 }, { top: 173, bottom: 293 }, { top: 306, bottom: 353 }];
  it('moves up to the top of the row it goes in front of', () => {
    expect(slotOffset(rows, 2, 0)).toBe(-173);
  });
  it('moves down to just after the last row it passes, which closes up behind it', () => {
    // Card 0 (100 tall) dropped at the end: the others move up 113, so the
    // last ends at 240 and the slot starts 13 later, at 253.
    expect(slotOffset(rows, 0, 4)).toBe(253);
  });
  it('stays put when it is let go where it was', () => {
    expect(slotOffset(rows, 1, 1)).toBe(0);
    expect(slotOffset(rows, 1, 2)).toBe(0);
  });
});

// ROUND FIVE: "the drag icon is too much and causes too many problems. Let's
// just get rid of it entirely: no drag icon on hover or in general, even when
// you're dragging." Read as text, because the dots were markup in three files
// and a style in a fourth, and any one of them coming back is the regression.
describe('no drag dots anywhere', () => {
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
  it('draws none on a row, a card or the carried chip', () => {
    for (const f of ['renderer/src/components/List.tsx', 'renderer/src/threads/Pages.tsx', 'renderer/src/threads/row-drag.ts', 'renderer/src/threads/pages.css']) {
      expect(read(f)).not.toMatch(/RowGrip|row-grip|drag-chip \.g\b/);
    }
    // The chip is the title and the project, and nothing drawn.
    expect(read('renderer/src/threads/row-drag.ts')).toMatch(/chip\.append\(title, project\)/);
  });
});

describe('the rows a drag passes', () => {
  // Five rows, 56px tall; the third (index 2) is carried.
  it('slide up to fill the gap when it goes down, and only those', () => {
    expect([0, 1, 3, 4].map((i) => shiftFor(i, 2, 4, 56))).toEqual([0, 0, -56, 0]);
  });
  it('slide down to open the slot when it goes up, and only those', () => {
    expect([0, 1, 3, 4].map((i) => shiftFor(i, 2, 0, 56))).toEqual([56, 56, 0, 0]);
  });
  it('do not move, and nothing is written, when it is let go where it was', () => {
    expect([0, 1, 3, 4].map((i) => shiftFor(i, 2, 3, 56))).toEqual([0, 0, 0, 0]);
    expect(stays(2, 2)).toBe(true);
    expect(stays(2, 3)).toBe(true);
    expect(stays(2, 1)).toBe(false);
    expect(stays(2, 4)).toBe(false);
  });
});

describe('the fleet runs by the same place', () => {
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  const make = (root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-place-'))) =>
    new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);

  it('scores a placed thread by its place, above a higher project it was dragged over', () => {
    const sup = make();
    sup.setProductOrder(['personal', 'team-app']);
    const high = { id: 'p-high', product: 'personal', priority: 7 };
    const medium = { id: 't-medium', product: 'team-app', priority: 5 };
    expect(sup._score(high)).toBeGreaterThan(sup._score(medium));
    sup.setThreadPlaces({ 't-medium': sup._score(high) + 1 });
    expect(sup._score(medium)).toBeGreaterThan(sup._score(high));
  });

  it('forgets a place set to null, and the thread falls back to its project and level', () => {
    const sup = make();
    sup.setProductOrder(['personal', 'team-app']);
    const t = { id: 't', product: 'team-app', priority: 5 };
    const natural = sup._score(t);
    sup.setThreadPlaces({ t: 999 });
    sup.setThreadPlaces({ t: null });
    expect(sup._score(t)).toBe(natural);
  });

  it('keeps places across a restart', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-place-'));
    make(root).setThreadPlaces({ t: 412.5 });
    expect(make(root)._score({ id: 't', product: 'x', priority: 5 })).toBe(412.5);
  });

  it('refuses a place that is not a number', () => {
    const sup = make();
    sup.setThreadPlaces({ t: 'high', u: Infinity });
    expect(sup.threadPlaces).toEqual({});
  });

  it('hands the screen each thread with its place on it, and leaves the rest alone', () => {
    const sup = make();
    sup.setThreadPlaces({ a: 250 });
    const b = { id: 'b' };
    const out = sup.withPlaces([{ id: 'a' }, b]);
    expect(out[0].place).toBe(250);
    expect(out[1]).toBe(b);
  });
});
