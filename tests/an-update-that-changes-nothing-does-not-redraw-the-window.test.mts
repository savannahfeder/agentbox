// AN UPDATE THAT CHANGES NOTHING DOES NOT REDRAW THE WINDOW.
//
// "Scrolling is so slow that it's constantly slowing down" (w-47c0223d60,
// 2026-11-22). Measured in the built app's browser copy on a 3,200-thread
// inbox with one agent writing (scripts/measure-speed.mjs --streaming, a
// "something changed" every 400 ms), nobody touching the window: its main
// thread was busy 18-20% of the time. Profiled over 10 s, 946 ms of the
// 1,425 ms of script was the whole app drawn again, its inbox worked out
// afresh over every thread, 25 times. Every one of those answers was empty:
// no thread, no part and no order had changed. The reader still handed back a
// new snapshot with a new list of threads, the window's own step that hides
// file-holder threads filtered into a new list, and the refresh spread a new
// object, so nothing anywhere could tell the answer was the one it already had.
//
// Now an empty answer is the snapshot already held, an answer that changes
// only other parts keeps the list of threads it had, and the refresh draws
// only what is new.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { snapshotSender, snapshotReader } from '../shared/snapshot-delta.mts';
import { shownSnapshots } from '../renderer/src/shown-snapshot.ts';
import { newToDraw, keptSet } from '../renderer/src/shown-snapshot.ts';

const row = (id, extra = {}) => ({ id, product: 'p', title: `Thread ${id}`, status: 'open', labels: [], ...extra });
const whole = (items, rest = {}) => ({ products: [{ slug: 'p' }], supervisor: { running: [] }, ...rest, items });
// Answers cross from the main process as data, so nothing in them is the reader's object.
const wire = (x) => JSON.parse(JSON.stringify(x));

function pair(items, rest) {
  const send = snapshotSender();
  const read = snapshotReader();
  const first = read.take(wire(send.answer(whole(items, rest), read.ask()?.since)));
  const next = (nextItems, nextRest) => read.take(wire(send.answer(whole(nextItems, nextRest), read.ask()?.since)));
  return { first, next, send, read };
}

describe('the reader', () => {
  it('hands back the very snapshot it holds when nothing changed', () => {
    const { first, next } = pair([row('a'), row('b')]);
    const again = next([row('a'), row('b')]);
    expect(again).toBe(first);
    expect(next([row('a'), row('b')])).toBe(first);
  });

  it('keeps its list of threads when only another part changed', () => {
    const { first, next } = pair([row('a'), row('b')], { supervisor: { running: [] } });
    const again = next([row('a'), row('b')], { supervisor: { running: [{ itemId: 'a', saying: 'reading files' }] } });
    expect(again).not.toBe(first);
    expect(again.supervisor.running[0].saying).toBe('reading files');
    expect(again.items).toBe(first.items);
  });

  it('keeps every piece of a changed part that did not change', () => {
    const order = ['p', 'q'];
    const { first, next } = pair([row('a')], { supervisor: { productOrder: order, queued: ['a'], running: [] } });
    const again = next([row('a')], { supervisor: { productOrder: order, queued: ['a'], running: [{ itemId: 'a', helpers: 2 }] } });
    expect(again.supervisor).not.toBe(first.supervisor);
    expect(again.supervisor.running).toEqual([{ itemId: 'a', helpers: 2 }]);
    expect(again.supervisor.productOrder).toBe(first.supervisor.productOrder);
    expect(again.supervisor.queued).toBe(first.supervisor.queued);
  });

  it('makes a new list when a thread changed, keeping every thread that did not', () => {
    const { first, next } = pair([row('a'), row('b')]);
    const again = next([row('a', { status: 'done' }), row('b')]);
    expect(again.items).not.toBe(first.items);
    expect(again.items[0].status).toBe('done');
    expect(again.items[1]).toBe(first.items[1]);
  });

  it('makes a new list when the order moved or a thread went', () => {
    const { first, next } = pair([row('a'), row('b')]);
    expect(next([row('b'), row('a')]).items.map((i) => i.id)).toEqual(['b', 'a']);
    const gone = next([row('a')]);
    expect(gone.items.map((i) => i.id)).toEqual(['a']);
    expect(gone).not.toBe(first);
  });

  it('answers an empty change on an older answer with that older snapshot', () => {
    const send = snapshotSender();
    const read = snapshotReader();
    const first = read.take(wire(send.answer(whole([row('a')]), undefined)));
    const since = read.ask().since;
    read.take(wire(send.answer(whole([row('a', { status: 'done' })]), since)));
    // A second ask that set out before the first came back.
    const late = read.take(wire(send.answer(whole([row('a')]), since)));
    expect(late.items[0].status).toBe(first.items[0].status);
  });
});

describe('the window\'s own view of a snapshot', () => {
  const view = (items) => items.filter((i) => !i.labels.includes('file-home'));

  it('is the same object for the same snapshot', () => {
    const shown = shownSnapshots(view);
    const snap = whole([row('a'), row('b', { labels: ['file-home'] })]);
    const once = shown(snap);
    expect(once.items.map((i) => i.id)).toEqual(['a']);
    expect(shown(snap)).toBe(once);
  });

  it('keeps its list when a new snapshot carries the same threads', () => {
    const shown = shownSnapshots(view);
    const items = [row('a')];
    const once = shown(whole(items));
    const twice = shown(whole(items, { supervisor: { running: [{ itemId: 'a' }] } }));
    expect(twice).not.toBe(once);
    expect(twice.items).toBe(once.items);
  });

  it('makes a new list for new threads', () => {
    const shown = shownSnapshots(view);
    const once = shown(whole([row('a')]));
    expect(shown(whole([row('a'), row('c')])).items).not.toBe(once.items);
  });
});

describe('the refresh', () => {
  const snap = whole([row('a')]);
  const drawn = { from: snap, items: snap.items, shown: { ...snap } };

  it('draws nothing when the answer and its list are what it drew, and the screen still shows it', () => {
    expect(newToDraw(drawn, snap, snap.items, drawn.shown)).toBe(false);
  });

  it('draws when the answer is new, its list is new, or something else drew since', () => {
    expect(newToDraw(drawn, whole([row('a')]), snap.items, drawn.shown)).toBe(true);
    expect(newToDraw(drawn, snap, [...snap.items], drawn.shown)).toBe(true);
    expect(newToDraw(drawn, snap, snap.items, { ...drawn.shown })).toBe(true);
    expect(newToDraw(null, snap, snap.items, null)).toBe(true);
  });
});

describe('a set of threads worked out on every draw', () => {
  it('is the one it was while it holds the same threads', () => {
    const was = new Set(['a', 'b']);
    expect(keptSet(was, new Set(['b', 'a']))).toBe(was);
  });

  it('is the new one when a thread came or went', () => {
    const was = new Set(['a', 'b']);
    const more = new Set(['a', 'b', 'c']);
    const other = new Set(['a', 'c']);
    expect(keptSet(was, more)).toBe(more);
    expect(keptSet(was, other)).toBe(other);
    expect(keptSet(null, was)).toBe(was);
  });
});

// No jsdom here, so the window's wiring is read from its source.
describe('the window', () => {
  const read = (f) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
  const app = read('App.tsx');
  const body = (from) => app.slice(app.indexOf(from), app.indexOf('\n  }, [', app.indexOf(from)));

  it('views each snapshot through the step that keeps what it had', () => {
    const api = read('api.ts');
    expect(api).toMatch(/const shown = shownSnapshots<[^>]+>\(withoutFileHomes\)/);
    expect(api).not.toMatch(/items: withoutFileHomes\(s\.items\)/);
  });

  it('asks whether there is anything new before it draws a snapshot', () => {
    const refresh = body('const refresh = useCallback(async () => {');
    expect(refresh.indexOf('newToDraw(')).toBeGreaterThan(-1);
    expect(refresh.indexOf('newToDraw(')).toBeLessThan(refresh.indexOf('setSnap('));
  });

  it('still draws the app on every poll, so ages and threads due back keep moving', () => {
    const poll = body('const off = api.onChanged(refresh);');
    expect(poll).toMatch(/setInterval\(tick, pollEvery\(10_000, onPhone\(\)\)\)/);
    expect(poll).toMatch(/drawn\.current === before\) setListNow\(Date\.now\(\)\)/);
  });

  it('tells the dock and the corner tag only when Needs you, the asks or the count of agents changed', () => {
    expect(app).toMatch(/window\.zero\?\.notify\?\.\(arrivals[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*\}, \[!snap, inbox, snap\?\.approvals, runningRows\.length\]\);/);
  });

  it('keeps who is running and who is stopped while they stay the same, as a line printed changes neither', () => {
    expect(app).toMatch(/const liveIds = useKeptSet\(useMemo\(/);
    expect(app).toMatch(/const stalledIds = useKeptSet\(useMemo\(/);
  });

  it('works its lists out by the lists\' clock, which moves when the threads drawn change and on each poll', () => {
    const refresh = body('const refresh = useCallback(async () => {');
    expect(refresh).toMatch(/const newThreads = items !== drawn\.current\?\.items;/);
    expect(refresh).toMatch(/if \(newThreads\) setListNow\(Date\.now\(\)\);\s*setSnap\(shown\)/);
    for (const list of ['const agentRows = useMemo(', 'const inboxCandidates = useMemo(', 'const inboxWithChats = useMemo(', 'const inbox = useMemo(', 'const snoozed = useMemo(', 'const owedAnAnswer = useMemo(']) {
      const at = app.indexOf(list);
      expect(at, list).toBeGreaterThan(-1);
      const memo = app.slice(at, app.indexOf(']);', at) + 3).replace(/\/\/.*$/gm, '');
      expect(memo, list).toMatch(/\blistNow\b/);
      expect(memo, list).not.toMatch(/(?<![\w.])now(?![\w:])/);
    }
  });
});
