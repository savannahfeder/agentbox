// THE BOARD PICKS SEVERAL THREADS AT ONCE, BY CLICK OR BY DRAGGING A BOX, AND
// ⌘K THEN ACTS ON ALL OF THEM.
//
// Asked 2026-10-05 (w-2e3819913c): "highlight multiple threads at once in the
// board view to perform bulk commands, just like you can hold Shift and select
// multiple in the inbox ... Shift-click to select more, and then hit Command-K",
// and "highlight the background, just like in PowerPoint, and have it select
// whatever you've highlighted". Measured before the change: a Shift-click or a
// ⌘-click on a board card opened the thread (InboxBoard's onClick read no
// modifier at all), a drag across the board's empty space selected text, and
// InboxBoard was never handed `multiSel`, so ⌘K on the board could only ever
// offer single-thread commands.
//
// The list keeps its own rule (Shift is a range down the rows). On the board a
// range has no one direction, so Shift and ⌘ both add or take away the one card,
// the way PowerPoint does, and the box is how you pick a run of them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cardClickIntent, marqueeBox, cardsUnder, marqueeMarks, toggleMark } from '../renderer/src/threads/board-select.ts';
import { InboxBoard } from '../renderer/src/threads/Pages.tsx';
globalThis.React = React;

const box = (left, top, right, bottom) => ({ left, top, right, bottom });

describe('a click on a card', () => {
  it('opens it with no key held', () => {
    expect(cardClickIntent({})).toBe('open');
  });

  it('adds or takes away the card with Shift, ⌘ or Control held', () => {
    expect(cardClickIntent({ shift: true })).toBe('toggle');
    expect(cardClickIntent({ meta: true })).toBe('toggle');
    expect(cardClickIntent({ ctrl: true })).toBe('toggle');
  });

  it('does not open with Option alone, which picks nothing either', () => {
    expect(cardClickIntent({ alt: true })).toBe('open');
  });
});

describe('toggling one card', () => {
  it('adds a card that was not picked and keeps the rest', () => {
    expect([...toggleMark(new Set(['a']), 'b')].sort()).toEqual(['a', 'b']);
  });

  it('takes away a card that was picked and keeps the rest', () => {
    expect([...toggleMark(new Set(['a', 'b']), 'b')]).toEqual(['a']);
  });

  it('does not change the set it was given', () => {
    const before = new Set(['a']);
    toggleMark(before, 'b');
    expect([...before]).toEqual(['a']);
  });
});

describe('the box dragged across the board', () => {
  it('is the same box whichever corner the drag started from', () => {
    expect(marqueeBox({ x: 10, y: 20 }, { x: 110, y: 220 })).toEqual(box(10, 20, 110, 220));
    expect(marqueeBox({ x: 110, y: 220 }, { x: 10, y: 20 })).toEqual(box(10, 20, 110, 220));
    expect(marqueeBox({ x: 110, y: 20 }, { x: 10, y: 220 })).toEqual(box(10, 20, 110, 220));
  });

  const cards = [
    { id: 'a', box: box(0, 0, 100, 50) },
    { id: 'b', box: box(0, 60, 100, 110) },
    { id: 'c', box: box(120, 0, 220, 50) },
  ];

  it('picks every card it covers', () => {
    expect(cardsUnder(box(-5, -5, 230, 120), cards)).toEqual(['a', 'b', 'c']);
  });

  it('picks a card it only partly covers, the way a design tool does', () => {
    expect(cardsUnder(box(90, 40, 95, 45), cards)).toEqual(['a']);
    expect(cardsUnder(box(50, 30, 150, 70), cards)).toEqual(['a', 'b', 'c']);
  });

  it('picks nothing in the gap between cards', () => {
    expect(cardsUnder(box(101, 51, 119, 59), cards)).toEqual([]);
  });

  it('does not pick a card it only touches at the edge', () => {
    expect(cardsUnder(box(100, 0, 120, 50), cards)).toEqual([]);
  });
});

describe('what the box leaves picked', () => {
  const before = new Set(['x', 'a']);

  it('replaces what was picked when no key is held', () => {
    expect([...marqueeMarks(before, ['a', 'b'], false)].sort()).toEqual(['a', 'b']);
  });

  it('adds to what was picked with Shift or ⌘ held', () => {
    expect([...marqueeMarks(before, ['a', 'b'], true)].sort()).toEqual(['a', 'b', 'x']);
  });

  it('clears the pick when a plain box catches nothing, as a click on empty space does', () => {
    expect([...marqueeMarks(before, [], false)]).toEqual([]);
  });

  it('keeps the pick when an added-to box catches nothing', () => {
    expect([...marqueeMarks(before, [], true)].sort()).toEqual(['a', 'x']);
  });
});

describe('the board draws what is picked', () => {
  const NOW = Date.UTC(2026, 9, 5, 17);
  const item = (id, state) => ({ id, priority: 0, product: 'p', title: id, status: 'open', updatedAt: NOW - 60_000, _state: state });
  const items = [item('w1', 'waiting'), item('w2', 'waiting'), item('r1', 'running')];
  const draw = (marked) => renderToStaticMarkup(React.createElement(InboxBoard, {
    items, products: [{ slug: 'p', name: 'P' }], display: { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' },
    now: NOW, stateOf: (i) => i._state, onOpenItem: () => {}, marked, onMark: () => {},
  }));
  const cardFor = (html, id) => html.match(new RegExp(`<button[^>]*data-board-id="${id}"[^>]*>`))?.[0] ?? '';

  it('marks each picked card and no other', () => {
    const html = draw(new Set(['w2', 'r1']));
    expect(cardFor(html, 'w2')).toMatch(/\bpicked\b/);
    expect(cardFor(html, 'r1')).toMatch(/\bpicked\b/);
    expect(cardFor(html, 'w1')).not.toMatch(/\bpicked\b/);
  });

  it('says it is picked to a screen reader too', () => {
    const html = draw(new Set(['w1']));
    expect(cardFor(html, 'w1')).toMatch(/aria-pressed="true"/);
    expect(cardFor(html, 'w2')).toMatch(/aria-pressed="false"/);
  });

  it('marks nothing when nothing is picked', () => {
    expect(draw(new Set())).not.toMatch(/th-card[^"]*\bpicked\b/);
  });
});

describe('the app hands the board the same pick the list uses', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const board = app.slice(app.indexOf('<InboxBoard'), app.indexOf('/>', app.indexOf('<InboxBoard')));

  it('passes the selection that ⌘K, E and L already act on', () => {
    expect(board).toMatch(/marked=\{multiSel\}/);
    expect(board).toMatch(/onMark=\{/);
  });
});
