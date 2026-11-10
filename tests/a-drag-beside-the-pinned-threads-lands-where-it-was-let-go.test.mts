// A DRAG BESIDE THE PINNED THREADS LANDS WHERE IT WAS LET GO.
//
// Reported 2026-10-13 (w-844ae75078): "Suddenly I can't seem to drag threads
// in list view or board view." The lift still worked; the landing did not.
// Pins (w-20323283e6, the evening before) draw the pinned threads above the
// rest whatever their scores, so the list as drawn is no longer in score
// order at the line between the two groups. A drop works out its place as a
// number between its two neighbours' scores, and at that line the neighbours
// were a pinned row above and an unpinned one below, in the wrong order.
//
// Measured before the fix, with a Low thread pinned above two Urgent ones:
// - an unpinned thread dragged to the top of the rest got a place BELOW the
//   row it was dropped above, so it landed second, not first;
// - a pinned thread dragged to the foot of the pins got a place ABOVE the pin
//   it was dropped under, so it went straight back to the top.
// Moving a thread to the top is the commonest drag there is, and with any pin
// at all it bounced, which reads as dragging being broken.
//
// The place is now worked out among the group the row lands in only.
import { describe, it, expect } from 'vitest';
import { sorted, sortedEntries, rankScore, entryScore, dropWithPins, placesForDrop } from '../renderer/src/threads/page-rules.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const MIN = 60_000;
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const ORDER = ['personal', 'team-app'];
const row = (id, product, priority, agoMin, extra = {}) => ({ id, product, priority, title: id, status: 'open', updatedAt: NOW - agoMin * MIN, ...extra });
const ids = (list) => list.map((r) => r.id);

// Pinned threads that score LOW, over unpinned ones that score high: the
// shape where the drawn order and the score order disagree at the line.
const rows = [
  row('pin-a', 'team-app', 3, 10, { pinned: true }),
  row('pin-b', 'team-app', 2, 20, { pinned: true }),
  row('urgent', 'personal', 9, 30),
  row('high', 'personal', 7, 40),
  row('low', 'team-app', 2, 50),
];

/** Drop `id` in front of `beforeId` the way the list does, then sort again. */
function land(list, id, beforeId) {
  const drawn = sorted(list, byPriority, 'inbox', ORDER);
  const { places, pin } = dropWithPins(drawn.map((r) => ({ id: r.id, score: rankScore(r, ORDER), pinned: !!r.pinned })), id, beforeId);
  const next = list.map((r) => ({
    ...r,
    ...(places && r.id in places ? { place: places[r.id] } : {}),
    ...(r.id === id && pin !== null ? { pinned: pin } : {}),
  }));
  return { order: ids(sorted(next, byPriority, 'inbox', ORDER)), pin, places };
}

describe('dragging next to the pinned threads', () => {
  it('starts with the pins on top, then the rest by score', () => {
    expect(ids(sorted(rows, byPriority, 'inbox', ORDER))).toEqual(['pin-a', 'pin-b', 'urgent', 'high', 'low']);
  });

  // The reported one: to the top of the rest, just under the pins.
  it('lands an unpinned thread first among the rest when it is let go just under the pins', () => {
    const out = land(rows, 'low', 'urgent');
    expect(out.pin).toBe(null);
    expect(out.order).toEqual(['pin-a', 'pin-b', 'low', 'urgent', 'high']);
  });

  it('lands a pinned thread last among the pins when it is let go at their foot', () => {
    const out = land(rows, 'pin-a', 'urgent');
    expect(out.pin).toBe(null);
    expect(out.order).toEqual(['pin-b', 'pin-a', 'urgent', 'high', 'low']);
  });

  // Either side of the line, one row in.
  it('lands an unpinned thread second among the rest', () => {
    expect(land(rows, 'low', 'high').order).toEqual(['pin-a', 'pin-b', 'urgent', 'low', 'high']);
  });

  it('lands a pinned thread first among the pins', () => {
    expect(land(rows, 'pin-b', 'pin-a').order).toEqual(['pin-b', 'pin-a', 'urgent', 'high', 'low']);
  });

  // Across the line, where it is let go and with its pin changed.
  it('pins a thread let go between two pins, at that spot', () => {
    const out = land(rows, 'urgent', 'pin-b');
    expect(out.pin).toBe(true);
    expect(out.order).toEqual(['pin-a', 'urgent', 'pin-b', 'high', 'low']);
  });

  it('pins a thread let go above every pin, at the very top', () => {
    const out = land(rows, 'high', 'pin-a');
    expect(out.pin).toBe(true);
    expect(out.order).toEqual(['high', 'pin-a', 'pin-b', 'urgent', 'low']);
  });

  it('unpins a pinned thread let go among the rest, at that spot', () => {
    const out = land(rows, 'pin-a', 'high');
    expect(out.pin).toBe(false);
    expect(out.order).toEqual(['pin-b', 'urgent', 'pin-a', 'high', 'low']);
  });

  it('unpins a pinned thread let go at the foot of the list, last', () => {
    const out = land(rows, 'pin-a', null);
    expect(out.pin).toBe(false);
    expect(out.order).toEqual(['pin-b', 'urgent', 'high', 'low', 'pin-a']);
  });

  it('does nothing when a thread is let go where it already was', () => {
    expect(land(rows, 'urgent', 'high')).toMatchObject({ places: null, pin: null });
    expect(land(rows, 'pin-b', 'urgent')).toMatchObject({ places: null, pin: null });
  });

  // The case that must not change: with nothing pinned, a drop writes exactly
  // the places it always did.
  it('writes the same places as before when nothing is pinned', () => {
    const plain = rows.map(({ pinned, ...r }) => r);
    const drawn = sorted(plain, byPriority, 'inbox', ORDER).map((r) => ({ id: r.id, score: rankScore(r, ORDER) }));
    for (const [id, before] of [['low', 'urgent'], ['urgent', null], ['high', 'pin-b'], ['pin-a', 'urgent']]) {
      expect(dropWithPins(drawn, id, before).places).toEqual(placesForDrop(drawn, id, before));
    }
  });
});

describe('the same drag in a board column', () => {
  it('lands a card first among the unpinned ones when it is let go just under the pins', () => {
    const entries = (list) => list.map((r) => ({ key: r.id, priority: r.priority, updatedAt: r.updatedAt, projectSlug: r.product, item: r }));
    const drawn = sortedEntries(entries(rows), byPriority, 'inbox', ORDER);
    const { places } = dropWithPins(drawn.map((e) => ({ id: e.key, score: entryScore(e, ORDER), pinned: !!e.item.pinned })), 'low', 'urgent');
    const next = rows.map((r) => (places && r.id in places ? { ...r, place: places[r.id] } : r));
    expect(sortedEntries(entries(next), byPriority, 'inbox', ORDER).map((e) => e.key)).toEqual(['pin-a', 'pin-b', 'low', 'urgent', 'high']);
  });
});
