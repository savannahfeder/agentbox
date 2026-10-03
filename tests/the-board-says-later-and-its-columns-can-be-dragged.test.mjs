// THE BOARD'S THIRD COLUMN SAYS LATER, AND YOU CAN DRAG THE COLUMNS INTO
// WHATEVER ORDER YOU LIKE.
//
// Reported 2026-10-02 (w-23fc91bff5): the tab was renamed from Scheduled to
// Later on w-afb66e6661, because half of what it holds was added to Later with
// no time at all, but the board's column still read SCHEDULED
// (`BOARD_COLUMNS` in page-rules.ts). Same thread, two names, one screen apart.
//
// And the board's four columns were fixed. Asked for: "make the columns in the
// board draggable so you can move them around to reorder your board as
// desired". The order is remembered, and J, K and the arrows walk the board in
// the order it is drawn, so the order lives in the same pure rule
// (`boardColumns`) the board draws and the keys walk.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BOARD_COLUMNS, DEFAULT_COLUMN_ORDER, boardColumns, boardWalk, columnTo, moveColumn, readColumnOrder, slotUnder, writeColumnOrder,
} from '../renderer/src/threads/page-rules.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { INBOX_TABS, InboxBoard } from '../renderer/src/threads/Pages.tsx';
globalThis.React = React;

const NOW = Date.UTC(2026, 9, 2, 17);
const products = [{ slug: 'p', name: 'P' }];
const item = (id, state) => ({ id, priority: 0, product: 'p', title: id, status: 'open', updatedAt: NOW - 60_000, _state: state });
const items = [item('w', 'waiting'), item('r', 'running'), item('s', 'scheduled')];
const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const cols = (order) => boardColumns({ items, products, display, now: NOW, stateOf: (i) => i._state, cards: [], me: null, order });
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

describe('the Later column', () => {
  it('is called Later, the same word as the tab', () => {
    const later = BOARD_COLUMNS.find((c) => c.state === 'scheduled');
    expect(later.label).toBe('Later');
    expect(later.label).toBe(INBOX_TABS.find((t) => t.view === 'snoozed').label);
  });

  it('is not called Scheduled anywhere on the board', () => {
    expect(BOARD_COLUMNS.map((c) => c.label)).not.toContain('Scheduled');
    expect(cols().map((c) => c.label)).not.toContain('Scheduled');
  });

  it('leaves the other columns their names', () => {
    expect(BOARD_COLUMNS.map((c) => c.label)).toEqual(['Waiting', 'In progress', 'Later', 'Done today']);
  });
});

describe('moving a column', () => {
  it('drops a column before the one it lands on, moving right', () => {
    expect(moveColumn(DEFAULT_COLUMN_ORDER, 'waiting', 'scheduled')).toEqual(['running', 'scheduled', 'waiting', 'done']);
  });

  it('drops a column before the one it lands on, moving left', () => {
    expect(moveColumn(DEFAULT_COLUMN_ORDER, 'done', 'waiting')).toEqual(['done', 'waiting', 'running', 'scheduled']);
  });

  it('goes to either end', () => {
    expect(moveColumn(DEFAULT_COLUMN_ORDER, 'waiting', 'done')).toEqual(['running', 'scheduled', 'done', 'waiting']);
    expect(moveColumn(DEFAULT_COLUMN_ORDER, 'running', 'waiting')).toEqual(['running', 'waiting', 'scheduled', 'done']);
  });

  it('changes nothing when dropped on itself or on something that is not a column', () => {
    expect(moveColumn(DEFAULT_COLUMN_ORDER, 'running', 'running')).toEqual(DEFAULT_COLUMN_ORDER);
    expect(moveColumn(DEFAULT_COLUMN_ORDER, 'running', 'nowhere')).toEqual(DEFAULT_COLUMN_ORDER);
    expect(moveColumn(DEFAULT_COLUMN_ORDER, 'nowhere', 'running')).toEqual(DEFAULT_COLUMN_ORDER);
  });

  it('does not change the order it was given', () => {
    const before = [...DEFAULT_COLUMN_ORDER];
    moveColumn(DEFAULT_COLUMN_ORDER, 'done', 'waiting');
    expect(DEFAULT_COLUMN_ORDER).toEqual(before);
  });
});

describe('the board in the order you dragged it to', () => {
  it('draws the columns in that order, each keeping its name and its cards', () => {
    const c = cols(['done', 'scheduled', 'waiting', 'running']);
    expect(c.map((x) => x.label)).toEqual(['Done today', 'Later', 'Waiting', 'In progress']);
    expect(c[1].rows.map((e) => e.item.id)).toEqual(['s']);
  });

  it('is walked in that order too', () => {
    expect(boardWalk(cols(['scheduled', 'running', 'waiting', 'done'])).map((i) => i.id)).toEqual(['s', 'r', 'w']);
  });

  it('draws the usual order when none was given', () => {
    expect(cols().map((x) => x.state)).toEqual(['waiting', 'running', 'scheduled', 'done']);
  });
});

describe('remembering the order', () => {
  it('reads back what was written', () => {
    const s = memory();
    writeColumnOrder(['done', 'waiting', 'running', 'scheduled'], s);
    expect(readColumnOrder(s)).toEqual(['done', 'waiting', 'running', 'scheduled']);
  });

  it('starts in the usual order when nothing is saved, or what is saved is broken', () => {
    expect(readColumnOrder(memory())).toEqual(DEFAULT_COLUMN_ORDER);
    const s = memory();
    s.setItem('threads.board.columns', '{not json');
    expect(readColumnOrder(s)).toEqual(DEFAULT_COLUMN_ORDER);
    s.setItem('threads.board.columns', '"waiting"');
    expect(readColumnOrder(s)).toEqual(DEFAULT_COLUMN_ORDER);
    expect(readColumnOrder(null)).toEqual(DEFAULT_COLUMN_ORDER);
  });

  it('drops a column that no longer exists and adds back one that is missing, so no column is ever lost', () => {
    const s = memory();
    s.setItem('threads.board.columns', JSON.stringify(['done', 'gone', 'done', 'running']));
    expect(readColumnOrder(s)).toEqual(['done', 'running', 'waiting', 'scheduled']);
  });
});

// "Just add some indication that it is draggable. For instance, oftentimes
// when you hover over a column and it's draggable, a little drag icon comes up
// subtly." The first round had only a grab cursor over the heading, which you
// see only once you are already on it.
describe('a column says it can be moved', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(InboxBoard, {
    items, products, display, now: NOW, stateOf: (i) => i._state, onOpenItem: () => {}, ...props,
  }));
  it('every heading carries the drag handle when the board can be reordered', () => {
    expect(draw({ onReorderColumns: () => {} }).match(/class="th-col-grip"/g)).toHaveLength(4);
  });
  it('and none when it cannot, so the handle never promises a drag that does nothing', () => {
    expect(draw({})).not.toContain('th-col-grip');
  });
  it('the handle shows only while the pointer is over the column, and faintly', () => {
    const css = readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.th-col-grip\s*\{[^}]*opacity:\s*0[;\s]/);
    expect(css).toMatch(/\.th-col:hover \.th-col-grip\s*\{[^}]*opacity:/);
  });
});

// AND IT HAS TO LOOK CLEAN DOING IT (2026-10-02, second round, with a
// screenshot): "visually it looks pretty weird, especially when I hover and
// when I'm hovering and moving things around." What the picture showed: a
// grey block behind the heading that ran 6px past the cards on both sides, a
// "Drag to move this column" tooltip sitting across the first card's title,
// and, mid-drag, the column drawn twice (the browser's ghost and a 35% copy
// left in place), with the others jumping rather than moving.
describe('a column moves cleanly', () => {
  const css = readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  const rule = (sel) => (css.match(new RegExp(`${sel.replace(/[.[\]"()=:*]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) ?? [])[1] ?? null;
  it('hovering the heading puts no block behind it', () => {
    expect(rule('.th-col-h.movable:hover') ?? '').not.toMatch(/background/);
    expect(rule('.th-col-h.movable') ?? '').not.toMatch(/margin:\s*0 -/);
  });
  it('no tooltip lands on the cards', () => {
    const out = renderToStaticMarkup(React.createElement(InboxBoard, {
      items, products, display, now: NOW, stateOf: (i) => i._state, onOpenItem: () => {}, onReorderColumns: () => {},
    }));
    expect(out).not.toContain('Drag to move this column');
  });
  // Third round, of the empty slot: "this empty block looks very strange
  // visually". Fourth round, of the column that then only slid sideways: "the
  // whole columns don't really move ... if I try to lift the column, it
  // doesn't feel like I've even processed it". So the column is LIFTED: it
  // follows the pointer both ways, raised over the board, its cards on it.
  const pages = readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  const board = pages.slice(pages.indexOf('export function InboxBoard'));
  it('the column being carried rides the pointer, raised, with its cards on it', () => {
    expect(rule('.th-col.lifted')).toMatch(/z-index/);
    expect(rule('.th-col.lifted')).toMatch(/box-shadow/);
    expect(rule('.th-col.lifted > *')).toBeNull();
    // Moved by the pointer in both directions, written straight to the
    // element so a move costs no render.
    expect(board).toContain('el.style.transform = `translate(${x}px, ${y}px) scale(1.02)`');
    // Photographed mid-drag: carried upward, its heading went under the
    // board's top edge. It rises only a few pixels now.
    expect(board).toContain('const y = Math.max(-6, d.y - d.startY);');
  });
  // AND IT FLICKERED (fourth round): "swapping back and forth at about 40
  // frames per second ... it's taking me 10 tries" to swap Waiting and In
  // Progress. The place was read off whichever column the browser said was
  // under the pointer, and a column sliding out of the way was still drawn
  // there for a few frames, so the swap undid itself every frame. The place
  // is now read off the board's fixed slots and the pointer alone.
  it('works out the place from the pointer and fixed slots, never from what is drawn there', () => {
    expect(board).not.toMatch(/onDragOver|onDragStart|draggable=/);
    expect(board).toContain('onPointerDown');
    // FIFTH ROUND: "it only moves one row at a time". The heading held the
    // pointer (setPointerCapture), and the first change of order MOVES the
    // column in the page, which silently lets go of it; after that the moves
    // only arrived while the pointer happened to be over the heading. Measured
    // with a real quick drag, first column to last in 8 moves: 1 change of
    // order, then nothing. The whole window listens for the length of a drag.
    expect(board).not.toContain('setPointerCapture');
    expect(board).toContain("window.addEventListener('pointermove', move)");
    expect(board).toContain("window.addEventListener('pointerup', up)");
    expect(board).toContain('slotUnder(d.slots, d.slots[d.startIndex] + (d.x - d.startX))');
  });
  it('the other columns slide to their new places rather than jump, and the carried one is left to the pointer', () => {
    expect(pages).toContain('useBeforePaint(() => {\n    const before = lastOrder.current;');
    expect(pages).toContain('translateX(');
    expect(pages).toContain('if (state === dragging) return;');
  });
});

describe('the slot under the pointer', () => {
  // Four columns, their centres where a 1440-wide board draws them.
  const centres = [255, 650, 1045, 1440];
  it('is the nearest slot to where the carried column\'s middle is', () => {
    expect(slotUnder(centres, 255)).toBe(0);
    expect(slotUnder(centres, 600)).toBe(1);
    expect(slotUnder(centres, 1300)).toBe(3);
  });
  it('changes exactly halfway between two slots, not before', () => {
    expect(slotUnder(centres, 452)).toBe(0);
    expect(slotUnder(centres, 453)).toBe(1);
  });
  it('holds at either end however far past it the pointer goes', () => {
    expect(slotUnder(centres, -500)).toBe(0);
    expect(slotUnder(centres, 9000)).toBe(3);
  });
  it('is a question of numbers only, so the same pointer always gives the same slot', () => {
    expect([1, 2, 3, 4, 5].map(() => slotUnder(centres, 652))).toEqual([1, 1, 1, 1, 1]);
  });
  it('with no slots there is nowhere to go', () => {
    expect(slotUnder([], 100)).toBe(-1);
  });
});

describe('a column taken to a slot', () => {
  it('lands at that place, the others closing up around it', () => {
    expect(columnTo(DEFAULT_COLUMN_ORDER, 'waiting', 1)).toEqual(['running', 'waiting', 'scheduled', 'done']);
    expect(columnTo(DEFAULT_COLUMN_ORDER, 'done', 0)).toEqual(['done', 'waiting', 'running', 'scheduled']);
    expect(columnTo(DEFAULT_COLUMN_ORDER, 'running', 3)).toEqual(['waiting', 'scheduled', 'done', 'running']);
  });
  it('changes nothing for its own place, or a place that is not on the board', () => {
    expect(columnTo(DEFAULT_COLUMN_ORDER, 'running', 1)).toEqual(DEFAULT_COLUMN_ORDER);
    expect(columnTo(DEFAULT_COLUMN_ORDER, 'running', -1)).toEqual(DEFAULT_COLUMN_ORDER);
    expect(columnTo(DEFAULT_COLUMN_ORDER, 'running', 4)).toEqual(DEFAULT_COLUMN_ORDER);
    expect(columnTo(DEFAULT_COLUMN_ORDER, 'nowhere', 0)).toEqual(DEFAULT_COLUMN_ORDER);
  });
});

describe('the board itself', () => {
  const pages = readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  const board = pages.slice(pages.indexOf('export function InboxBoard'));
  it('draws in the order App.tsx walks, and lets a column be dragged by its heading', () => {
    expect(board).toContain('order: shown');
    expect(board).toContain('onPointerDown');
    expect(board).toContain('columnTo(');
  });
  it('App.tsx hands the same order to the board and to J and K', () => {
    const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('order: columnOrder');
    expect(app).toContain('columnOrder={columnOrder}');
  });
  // Photographed 2026-10-02: the keyboard was on "Look into a cheaper email
  // provider"; Later was dropped first and the highlight jumped to "Clean up
  // the receipts folder", because the keyboard's place is a position in the
  // walk and the walk had changed under it. It stays with the thread now.
  it('keeps the keyboard on the same thread when a column is dropped somewhere else', () => {
    const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('onReorderColumns={reorderColumns}');
    expect(app).toContain('next.findIndex((x) => x.id === keep.id && x.product === keep.product)');
  });
  // SIXTH ROUND, two screenshots: "i dragged a column to the right, and then
  // back to the left ... and then the content scrolled down like this without
  // my prompting". The keyboard's place was put back by an effect one render
  // AFTER the new order landed, so for that one render it pointed at a
  // different card further down the board, the board scrolled to show it,
  // and then scrolled back only as far as the right card, with the headings
  // left above the top. The place is now set in the same update as the order.
  it('sets the keyboard\'s place in the same update as the new order, never a render later', () => {
    const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const reorder = app.slice(app.indexOf('const reorderColumns = useCallback('), app.indexOf('const reorderColumns = useCallback(') + 900);
    expect(reorder).toContain('setColumnOrder(order);');
    expect(reorder).toContain('setSelected(');
    expect(app).not.toContain('keepOnReorder');
  });
});
