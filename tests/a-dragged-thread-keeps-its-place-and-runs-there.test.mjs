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
import { sorted, rankScore } from '../renderer/src/threads/page-rules.ts';
import { Supervisor } from '../main/supervisor.mjs';
import { shiftFor, stays } from '../renderer/src/threads/row-drag.ts';

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
