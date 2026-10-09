// THE CARD YOU ARE ON JOINS A BOARD PICK, AND WHILE ANYTHING IS PICKED A CARD
// IS EITHER FILLED OR PLAIN.
//
// Tried by hand 2026-10-07 (w-2e3819913c) in a copy with invented threads:
// "the multi-select background color is different from the single-select
// border ... I would assume the middle one is not selected, but it should be".
// Measured before the change: open a card, then Shift-click three others, and
// the pick held the three while the first card wore only the keyboard's
// outline, with no fill. The list's Shift+J takes the row you are on along
// with it (App.tsx), so the board left out the one card the list includes, and
// the outline made it look half picked either way.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clickMarks } from '../renderer/src/threads/board-select.ts';
import { InboxBoard } from '../renderer/src/threads/Pages.tsx';
globalThis.React = React;

const sorted = (s) => [...s].sort();

describe('a Shift- or ⌘-click when nothing is picked yet', () => {
  it('picks the card you were on as well as the one clicked', () => {
    expect(sorted(clickMarks(new Set(), 'b', 'a'))).toEqual(['a', 'b']);
  });

  it('picks just the card when it is the one you were on', () => {
    expect(sorted(clickMarks(new Set(), 'a', 'a'))).toEqual(['a']);
  });

  it('picks just the card when you were on none', () => {
    expect(sorted(clickMarks(new Set(), 'b', null))).toEqual(['b']);
  });
});

describe('a Shift- or ⌘-click once something is picked', () => {
  it('adds the card and does not bring back the one you were on', () => {
    // She took the starting card out on purpose; the next click must not
    // quietly put it back.
    expect(sorted(clickMarks(new Set(['b']), 'c', 'a'))).toEqual(['b', 'c']);
  });

  it('takes a picked card away', () => {
    expect(sorted(clickMarks(new Set(['a', 'b']), 'b', 'a'))).toEqual(['a']);
  });
});

describe('the board while something is picked', () => {
  const NOW = Date.UTC(2026, 9, 7, 17);
  const item = (id) => ({ id, priority: 0, product: 'p', title: id, status: 'open', updatedAt: NOW - 60_000 });
  const items = [item('w1'), item('w2'), item('w3')];
  const draw = (marked, selected) => renderToStaticMarkup(React.createElement(InboxBoard, {
    items, products: [{ slug: 'p', name: 'P' }], display: { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' },
    now: NOW, stateOf: () => 'waiting', onOpenItem: () => {}, marked, onMark: () => {}, selected,
  }));
  const cardFor = (html, id) => html.match(new RegExp(`<button[^>]*data-board-id="${id}"[^>]*>`))?.[0] ?? '';

  it('drops the outline from the card you are on when it is not picked', () => {
    const html = draw(new Set(['w2', 'w3']), items[0]);
    expect(cardFor(html, 'w1')).not.toMatch(/\bselected\b/);
    expect(cardFor(html, 'w1')).not.toMatch(/\bpicked\b/);
  });

  it('fills the card you are on when it is picked, with no outline beside the fill', () => {
    const html = draw(new Set(['w1', 'w2']), items[0]);
    expect(cardFor(html, 'w1')).toMatch(/\bpicked\b/);
    expect(cardFor(html, 'w1')).not.toMatch(/\bselected\b/);
  });

  it('keeps the outline on the card you are on when nothing is picked', () => {
    const html = draw(new Set(), items[0]);
    expect(cardFor(html, 'w1')).toMatch(/\bselected\b/);
  });
});
