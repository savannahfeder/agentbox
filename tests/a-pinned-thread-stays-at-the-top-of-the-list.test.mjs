// A PINNED THREAD STAYS AT THE TOP OF THE LIST.
//
// Asked for 2026-10-12 (w-20323283e6): "Quite often I end up with like 50 or
// more Agent threads going and by the end of the day, I might actually only
// have like a few tasks that I need to complete so like then I end up, just
// digging through to find those particular tasks ... the three dot menu and
// then pin thread ... that ends up like at the top ... or you can re-order
// them as you normally would by dragging."
//
// Measured before the fix: a thread had no pin at all. `sorted` ordered every
// open row by project place and level alone, the thread menu offered Run now,
// View code changes, Open terminal and Mark done and nothing else, and the
// supervisor kept no record a pin could live in.
//
// Now a pin is kept on this computer beside the dragged places, pinned threads
// sort above every other open thread in either sort, they are dragged among
// themselves the way any row is, a row dragged across the line between the two
// groups takes the side it was let go on, and closing a thread drops its pin.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sorted, sortedEntries, rankScore, dropWithPins } from '../renderer/src/threads/page-rules.ts';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { Supervisor } from '../main/supervisor.mts';

const NOW = Date.UTC(2026, 9, 12, 12);
const MIN = 60_000;
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const byUpdated = { ...byPriority, sort: 'updated' };
const ORDER = ['personal', 'team-app'];
const row = (id, product, priority, agoMin, extra = {}) => ({ id, product, priority, title: id, status: 'open', updatedAt: NOW - agoMin * MIN, ...extra });
const ids = (list) => list.map((r) => r.id);

const rows = [
  row('p-urgent', 'personal', 9, 50),
  row('p-medium', 'personal', 5, 10),
  row('t-high', 'team-app', 7, 20),
  row('t-low', 'team-app', 2, 5, { pinned: true }),
  row('t-medium', 'team-app', 5, 40, { pinned: true }),
];

describe('the order of the list', () => {
  it('puts pinned threads above everything else, and orders them the usual way among themselves', () => {
    expect(ids(sorted(rows, byPriority, 'inbox', ORDER))).toEqual(['t-medium', 't-low', 'p-urgent', 'p-medium', 't-high']);
  });

  it('keeps them on top under Sort by Updated too', () => {
    expect(ids(sorted(rows, byUpdated, 'inbox', ORDER))).toEqual(['t-low', 't-medium', 'p-medium', 't-high', 'p-urgent']);
  });

  // The case that must not change: with nothing pinned the list is the one it always was.
  it('leaves a list with no pins exactly as it was', () => {
    const plain = rows.map(({ pinned, ...r }) => r);
    expect(ids(sorted(plain, byPriority, 'inbox', ORDER))).toEqual(['p-urgent', 'p-medium', 't-high', 't-medium', 't-low']);
  });

  it('lets a dragged place order the pinned threads among themselves', () => {
    const placed = rows.map((r) => (r.id === 't-low' ? { ...r, place: 1000 } : r));
    expect(ids(sorted(placed, byPriority, 'inbox', ORDER)).slice(0, 2)).toEqual(['t-low', 't-medium']);
  });

  // Done is a history, newest finished first; a pin means nothing there.
  it('does not lift a pinned row on Done', () => {
    const done = [
      row('a', 'personal', 5, 0, { status: 'done', wrote: { status: { ts: NOW - 1 * MIN } } }),
      row('b', 'personal', 5, 0, { status: 'done', pinned: true, wrote: { status: { ts: NOW - 9 * MIN } } }),
    ];
    expect(ids(sorted(done, byPriority, 'done', ORDER))).toEqual(['a', 'b']);
  });

  it('lifts pinned threads in a board column too', () => {
    const entries = rows.map((r) => ({ key: r.id, priority: r.priority, updatedAt: r.updatedAt, projectSlug: r.product, item: r }));
    expect(sortedEntries(entries, byPriority, 'inbox', ORDER).map((e) => e.key).slice(0, 2)).toEqual(['t-medium', 't-low']);
  });
});

describe('dragging across the line between pinned and the rest', () => {
  const drawn = sorted(rows, byPriority, 'inbox', ORDER).map((r) => ({ id: r.id, score: rankScore(r, ORDER), pinned: !!r.pinned }));
  // drawn: t-medium*, t-low*, p-urgent, p-medium, t-high

  it('pins a row let go among the pinned ones, at the spot it was dropped', () => {
    const out = dropWithPins(drawn, 't-high', 't-low');
    expect(out.pin).toBe(true);
    expect(out.places['t-high']).toBeLessThan(rankScore(rows[4], ORDER));
    expect(out.places['t-high']).toBeGreaterThan(rankScore(rows[3], ORDER));
  });

  it('pins a row let go above the first pinned one', () => {
    expect(dropWithPins(drawn, 'p-medium', 't-medium').pin).toBe(true);
  });

  it('unpins a pinned row let go among the rest', () => {
    expect(dropWithPins(drawn, 't-medium', 'p-medium').pin).toBe(false);
    expect(dropWithPins(drawn, 't-medium', null).pin).toBe(false);
  });

  // The boundary itself: the gap between the last pinned row and the first of
  // the rest belongs to whichever side the row came from.
  it('leaves the pin alone when a row is let go right on the line', () => {
    expect(dropWithPins(drawn, 't-medium', 'p-urgent').pin).toBe(null);
    expect(dropWithPins(drawn, 't-high', 'p-urgent').pin).toBe(null);
  });

  it('leaves the pin alone on a move inside one group', () => {
    expect(dropWithPins(drawn, 't-low', 't-medium').pin).toBe(null);
    expect(dropWithPins(drawn, 't-high', 'p-urgent').pin).toBe(null);
  });
});

describe('the thread menu', () => {
  it('offers Pin thread just above Mark done', () => {
    expect(threadMenuRows({ change: true, terminal: 'closed', finish: true, pin: 'unpinned' }).map((r) => r.label))
      .toEqual(['View code changes', 'Open terminal', 'Pin thread', 'Mark done']);
  });

  it('says Unpin thread on a pinned one', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true, pin: 'pinned' }).map((r) => r.label))
      .toEqual(['Unpin thread', 'Mark done']);
  });

  // A thread that cannot be pinned (a teammate's card, a finished one) has no row.
  it('has no pin row where none is offered', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true }).map((r) => r.id)).toEqual(['done']);
  });
});

describe('where a pin is kept', () => {
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  const make = (root) => new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);

  it('marks pinned rows in the snapshot and survives a restart', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-pin-'));
    const sup = make(root);
    sup.setThreadPins({ 'w-a': true });
    sup.setThreadPlaces({ 'w-b': 3 });
    const items = [{ id: 'w-a' }, { id: 'w-b' }, { id: 'w-c' }];
    expect(sup.withPlaces(items)).toEqual([{ id: 'w-a', pinned: true }, { id: 'w-b', place: 3 }, { id: 'w-c' }]);
    expect(make(root).withPlaces(items)[0]).toEqual({ id: 'w-a', pinned: true });
  });

  it('forgets a pin set to null', () => {
    const sup = make(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-pin-')));
    sup.setThreadPins({ 'w-a': true });
    sup.setThreadPins({ 'w-a': null });
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a' }]);
  });
});

describe('the plumbing', () => {
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

  it('has a door from the window to the supervisor', () => {
    expect(read('shared/bridge-map.mts')).toMatch(/setThreadPins: 'zero:set-thread-pins'/);
    expect(read('main/ipc.mts')).toMatch(/'zero:set-thread-pins'/);
  });

  // A stronger hairline under the pinned group was tried and read as a bug
  // ("it looks unintentional right now, like a bug", 2026-10-12). The pin on
  // each row is the only mark; the line between rows stays the ordinary one.
  it('draws no line of its own under the pinned threads', () => {
    expect(read('renderer/src/threads/pages.css')).not.toMatch(/after-pins/);
    expect(read('renderer/src/components/List.tsx')).not.toMatch(/after-pins/);
  });

  // Closing a thread is the end of what it was pinned for.
  it('drops the pin when a thread is closed', () => {
    expect(read('main/ipc.mts')).toMatch(/status === 'done'\) supervisor\.setThreadPins\(\{ \[id\]: null \}\)/);
  });
});
