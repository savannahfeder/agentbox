// THE HIGHLIGHT IS DRAWN ON THE THREAD THE CURSOR FOLLOWED, NOT ON THE PLACE
// IT USED TO SIT.
//
// Found by a tester on the Linux box, 2026-10-23 (F-29): "Select a row, then
// have a new thread appear above it. Press J. Expected: the selection follows
// the same thread, and J moves down. Actual: the highlight stays on the old
// index, now a different thread."
//
// `cursor-follows` has worked out the right answer since 2026-10-05, and the
// board has drawn it: it is handed `current`, the thread at the followed place.
// The LIST was handed `selected`, the raw state, which is the place BEFORE the
// follow. So every time the list changed under a cursor nobody moved, the list
// drew the highlight one row off its thread until the layout effect wrote the
// followed place back into state and React drew again. One frame on this
// machine; on the box it was reported from, where a repaint took seconds
// (F-33), it is the highlight sitting on the wrong thread long enough to press
// a key at it.
//
// So the drawn index and the walked thread come from the same place. Measured
// by reading the wiring, because the fault is which of two numbers reaches the
// component, and by the rule below, which already said what the number is.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cursorIndex, cursorMark } from '../renderer/src/cursor-follows.ts';

const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const row = (id, product = 'p') => ({ id, product });
const rows = (...ids) => ids.map((id) => row(id));

describe('what the list is handed to draw the highlight on', () => {
  it('is the followed place, not the raw state', () => {
    expect(app).toMatch(/\n\s*selected=\{cursor\}\n/);
    expect(app).not.toMatch(/\n\s*selected=\{selected\}\n/);
  });

  it('still hands the board the thread itself, which already followed', () => {
    expect(app).toMatch(/selected=\{current\} selectedCard=/);
  });

  it('anchors a shift-click range on the row you can see highlighted', () => {
    // The anchor is the other half of the same fault: a range drawn from the
    // raw state starts one row off the highlight it appears to start on.
    expect(app).toMatch(/const \[lo, hi\] = \[Math\.min\(cursor, i\), Math\.max\(cursor, i\)\];/);
  });

  it('works the place out before the draw, in the render, not in an effect', () => {
    // An effect runs after the paint, which is the frame this is about.
    expect(app).toMatch(/const cursor = cursorIndex\(\{ list, selected, last: cardSel \? null : drawnAt\.current \}\);/);
  });
});

describe('the place the list is drawn at, when a thread arrives above the cursor', () => {
  it('is the row the cursor was on, one further down (the reported case)', () => {
    const last = cursorMark(rows('a', 'b', 'c'), 1); // on b
    const after = rows('new', 'a', 'b', 'c');
    const at = cursorIndex({ list: after, selected: 1, last });
    expect(at).toBe(2);
    expect(after[at].id).toBe('b');
  });

  it('is the row the cursor was on when two arrive above it', () => {
    const last = cursorMark(rows('a', 'b', 'c'), 2); // on c
    const after = rows('n1', 'n2', 'a', 'b', 'c');
    expect(after[cursorIndex({ list: after, selected: 2, last })].id).toBe('c');
  });

  it('is unmoved when the thread arrives BELOW the cursor', () => {
    const last = cursorMark(rows('a', 'b', 'c'), 1); // on b
    const after = rows('a', 'b', 'new', 'c');
    expect(after[cursorIndex({ list: after, selected: 1, last })].id).toBe('b');
  });
});

describe('the cases that must NOT match', () => {
  it('a move you just made wins over the follow', () => {
    // You pressed J in the same beat a thread arrived: your press is the answer.
    const last = cursorMark(rows('a', 'b', 'c'), 1);
    expect(cursorIndex({ list: rows('new', 'a', 'b', 'c'), selected: 2, last })).toBe(2);
  });

  it('a cursor on a teammate\'s card follows nothing: none of your rows is drawn selected', () => {
    // `last` is null while `cardSel` is set, which is the `cardSel ? null`
    // above, and then the raw place is all there is.
    expect(cursorIndex({ list: rows('new', 'a', 'b'), selected: 1, last: null })).toBe(1);
  });
});
