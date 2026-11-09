// Z PUTS THE KEYBOARD ON THE THREAD IT REOPENED.
//
// What broke (power test round 2, #36): Needs you held two threads. J to the
// second, E closed it, Z ("Reopened: Add an idempotency key"), then Enter, R,
// "ship it", ⌘↵. Enter opened the top thread, so "ship it" went to a thread
// the tester had not read yet.
//
// The keyboard's place follows its thread (cursor-follows.ts). When E took the
// second row away, the place settled on the row that slid under it (here the
// only one left, the top row), and when Z put the closed thread back the place
// stayed with that row. Measured on a stand-in copy with seeded threads: J to
// "Draft the launch plan", E, Z past the grace window, Enter opened "Mock up
// the pricing page", the row below it. And through the rule below on the
// tester's two-row list.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cursorIndex, cursorMark, cursorAfterWait, cursorWait, CURSOR_WAIT_MS } from '../renderer/src/cursor-follows.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const row = (id) => ({ id, product: 'p' });
const NOW = 1_791_800_000_000;

// One draw, as App.tsx works the place out: a row Z put back first, then the thread it was on.
const draw = (list, s, now = NOW) => {
  const back = cursorAfterWait({ list, wait: s.wait, moved: !!s.last && s.selected !== s.last.index, now });
  const at = back.index >= 0 ? back.index : cursorIndex({ list, selected: s.selected, last: s.last });
  return { selected: at, last: cursorMark(list, at), wait: back.keep, on: list[at]?.id };
};

describe('closing the row the keyboard is on and taking it back with Z', () => {
  const booking = row('booking');
  const idempotency = row('idempotency');

  it('the reported case: two rows, the second closed and reopened, the keyboard is on the second', () => {
    let s = draw([booking, idempotency], { selected: 1, last: null, wait: null });
    expect(s.on).toBe('idempotency');
    s = draw([booking], s);
    expect(s.on).toBe('booking');
    s = draw([booking, idempotency], { ...s, wait: cursorWait(idempotency, NOW) });
    expect(s.on).toBe('idempotency');
    expect(s.wait).toBe(null);
  });

  it('without the Z naming the row, the place stays on the row that slid under it, which was the fault', () => {
    let s = draw([booking, idempotency], { selected: 1, last: null, wait: null });
    s = draw([booking], s);
    s = draw([booking, idempotency], s);
    expect(s.on).toBe('booking');
  });

  it('a longer list: the reopened row, not the one below it', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(row);
    let s = draw([a, b, c, d], { selected: 1, last: null, wait: null });
    s = draw([a, c, d], s);
    expect(s.on).toBe('c');
    s = draw([a, b, c, d], { ...s, wait: cursorWait(b, NOW) });
    expect(s.on).toBe('b');
  });

  it('waits through the draws before the row is back, then lands on it', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(row);
    let s = draw([a, c], { selected: 1, last: cursorMark([a, c], 1), wait: cursorWait(b, NOW) });
    expect(s.on).toBe('c');
    expect(s.wait).not.toBe(null);
    s = draw([a, b, c], s, NOW + 800);
    expect(s.on).toBe('b');
  });

  it('what must not move it: a key you pressed since, a wait gone stale, another project\'s thread of the same id', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(row);
    const settled = { selected: 1, last: cursorMark([a, c], 1) };
    // J pressed before the row came back: your move wins.
    expect(draw([a, b, c], { ...settled, selected: 0, wait: cursorWait(b, NOW) }).on).toBe('a');
    // The row only came back after the wait ran out.
    expect(draw([a, b, c], { ...settled, wait: cursorWait(b, NOW) }, NOW + CURSOR_WAIT_MS + 1).on).toBe('c');
    expect(draw([a, { id: 'b', product: 'q' }, c], { ...settled, wait: cursorWait(b, NOW) }).on).toBe('c');
  });
});

describe('the wiring in App.tsx', () => {
  const undo = app.slice(app.indexOf('const undo = useCallback('), app.indexOf('/* ------------------------------- keyboard'));

  it('a Z inside the grace window waits for the row it held', () => {
    const grace = undo.slice(0, undo.indexOf('PAST THE GRACE WINDOW'));
    expect(grace).toMatch(/cursorBack\.current = cursorWait\(pending\.item, now\)/);
  });

  it('a Z past it waits for the row it brings back, before the refresh that lists it', () => {
    const past = undo.slice(undo.indexOf('PAST THE GRACE WINDOW'));
    const at = past.indexOf('cursorBack.current = cursorWait(');
    expect(at).toBeGreaterThan(past.indexOf("if (outcome && 'refused' in outcome)"));
    expect(at).toBeLessThan(past.indexOf('await refresh();\n    setMultiSel'));
  });

  it('the place the list draws reads the wait, and the draw hands the wait on', () => {
    expect(app).toMatch(/const putBack = cursorAfterWait\(\{ list, wait: cursorBack\.current/);
    expect(app).toMatch(/cursorBack\.current = putBack\.keep;/);
  });
});
