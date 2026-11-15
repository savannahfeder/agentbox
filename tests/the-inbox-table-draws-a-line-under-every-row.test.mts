// THE INBOX TABLE DRAWS A LINE BETWEEN EVERY PAIR OF ROWS, URGENT OR NOT.
//
// Reported on the team build (w-faf2152b47, 2026-10-01): with an urgent thread
// at the top of the inbox there was no hairline between it and the row under
// it, so the spacing looked wrong. The hairline is `.row + .row::after`, drawn
// only between sibling rows. The inbox put an urgent block and the rest in two
// groups (two wrapper divs) for their headings, and the table draws no
// headings, so the first row after the block had no row before it and no line.
// Measured offscreen in Electron with the app's own stylesheets: before, the
// second row of [urgent, medium, high, medium] had no line and every later one
// did; the Team page, which never grouped, had all three.
//
// The table draws no group labels, so it no longer splits rows into groups at
// all. The plain list keeps its groups and its headings.
import { describe, it, expect } from 'vitest';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { List } from '../renderer/src/components/List.tsx';
globalThis.React = React;

const now = Date.now();
const DAY = 86_400_000;
const row = (id, priority, o = {}) => ({
  id, title: `Thread ${id}`, priority, status: 'open', kind: 'directive', labels: ['founder'],
  product: 'p', productName: 'Northwind', updatedAt: now - 60_000, createdAt: now - DAY, ...o,
});
const draw = (items, o = {}) => renderToStaticMarkup(h(List, {
  items, view: 'inbox', selected: -1, seen: new Set(), running: [], multiSel: new Set(),
  onSelect() {}, onOpen() {}, onToggle() {}, onRange() {}, products: [{ slug: 'p', name: 'Northwind' }], ...o,
}));
// A row opening a new wrapper is a row with no row before it, so no hairline.
const groupStarts = (html) => (html.match(/<div><div data-item-id=/g) ?? []).length;
const rowCount = (html) => (html.match(/data-item-id=/g) ?? []).length;

describe('the inbox table keeps its rows together', () => {
  it('an urgent row first: every row after it sits next to a row', () => {
    const html = draw([row('a', 9), row('b', 5), row('c', 6), row('d', 5)], { table: true });
    expect(rowCount(html)).toBe(4);
    expect(groupStarts(html)).toBe(1);
  });
  it('urgent rows in the middle, after rows lifted above them', () => {
    const html = draw([row('a', 5), row('b', 9), row('c', 9), row('d', 5)], { table: true });
    expect(groupStarts(html)).toBe(1);
  });
  it('the last row urgent', () => {
    expect(groupStarts(draw([row('a', 5), row('b', 9)], { table: true }))).toBe(1);
  });
  it('no urgent row at all, as before', () => {
    expect(groupStarts(draw([row('a', 5), row('b', 6)], { table: true }))).toBe(1);
  });
  it('Scheduled rows returning on different days', () => {
    const items = [row('a', 5), row('b', 5)];
    const snoozes = { a: now + DAY, b: now + 3 * DAY };
    expect(groupStarts(draw(items, { table: true, view: 'snoozed', snoozes }))).toBe(1);
  });
  it('draws no heading in the table', () => {
    const html = draw([row('a', 9), row('b', 5)], { table: true });
    expect(html).not.toContain('day-label');
  });
});

describe('the plain list keeps its groups', () => {
  it('still heads the urgent block and the rows after it', () => {
    const html = draw([row('a', 9), row('b', 5)]);
    expect((html.match(/class="day-label"/g) ?? []).length).toBe(2);
  });
});
