// A COLUMN NOBODY FILLS IS NOT DRAWN, AND NO CARD OR ROW SAYS TASK FOR A PROJECT.
//
// "Extra unnecessary text in random areas... too cluttered", using the team
// version on 2026-11-01. After rows stopped repeating their tab and Medium,
// the photo stage at 1440x900 showed Needs you with four rows: the STATUS
// column held one value and PRIORITY none, yet both headers stood over empty
// space. On the board (In progress) a task's card still read "WITH DEV | bars
// TASK": the Medium bars and the kind where the project goes. A teammate's
// task row put "Task" in the Project column.
//
// Now a list column whose cells are all empty is not drawn, its header and its
// track included, by a rule in pages.css that looks for a filled cell; one
// filled cell brings it back. The markup is read here for which cells are
// filled, and the stylesheet for the rule that acts on it. A card and a
// teammate's task row follow the rows' rules: no kind in the project place,
// no priority mark at Medium.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { List } from '../renderer/src/components/List.tsx';
import { InboxBoard, RowCells } from '../renderer/src/threads/Pages.tsx';
import { cardPlace, teamEntries } from '../renderer/src/threads/page-rules.ts';
import { FleetContext } from '../renderer/src/fleet.ts';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const CSS = readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const NOW = Date.now();
const MIN = 60_000;
const ME = 'p-maya', SOFIA = 'p-sofia', DEV = 'p-dev';
const NAMES = { [ME]: 'Maya Chen', [SOFIA]: 'Sofia Ruiz', [DEV]: 'Dev Patel' };
const team = { state: { signedIn: true, cards: [], since: NOW - 30 * 86_400_000 }, me: ME, byId: new Map(Object.entries(NAMES).map(([id, name]) => [id, { id, name }])), products: new Map() };

const company = { slug: 'company', name: 'Company' };
const withSofia = { slug: 'direct-sofia', name: 'Sofia', team: { projectId: 'd', direct: true, people: [ME, SOFIA] } };
const withDev = { slug: 'direct-dev', name: 'Dev', team: { projectId: 'e', direct: true, people: [ME, DEV] } };

const thread = (id, over = {}) => ({
  id, product: 'company', productName: 'Company', status: 'open', kind: 'question', title: `Thread ${id}`,
  note: 'Two ways to do it.', labels: ['founder'], priority: 5, claim: null, createdAt: NOW - 3 * MIN, updatedAt: NOW - 3 * MIN, createdBy: ME, ...over,
});
const task = (over = {}) => ({
  id: 'w-t', product: withSofia.slug, status: 'open', kind: 'directive', title: 'Review the launch film cut', body: 'Review the launch film cut',
  labels: ['given-task'], assignee: ME, people: [ME, SOFIA], createdBy: SOFIA, priority: 5,
  createdAt: NOW - MIN, updatedAt: NOW - MIN, talk: { chat: [{ by: SOFIA, ts: NOW - MIN, text: 'Review the launch film cut' }] }, wrote: {}, ...over,
});

const list = (items) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: team },
    React.createElement(FleetContext.Provider, { value: { queued: [] } },
      React.createElement(List, {
        items, view: 'inbox', selected: -1, seen: new Set(), running: [], multiSel: new Set(), repeats: [], allItems: items,
        onSelect() {}, onOpen() {}, onToggle() {}, onRange() {}, table: true, products: [company, withSofia],
      }))));

const COL = { state: 'Status', proj: 'Project', prio: 'Priority' };
// The rule in pages.css: a table with a header and no filled cell of the column hides it.
const hides = (col) => new RegExp(String.raw`\.th-table:has\(\.th-head\):not\(:has\(\.th-cell-${col}:not\(:empty\)\)\) (?:\.th-col-${col}|:is\(\.th-col-${col}, \.th-cell-${col}\))\s*\{\s*display:\s*none;?\s*\}`).test(CSS);
const filled = (html, col) => [...html.matchAll(new RegExp(`<div class="th-cell-${col}[^"]*"[^>]*>([\\s\\S]*?)</div>`, 'g'))].some((m) => m[1] !== '');
const headed = (html, col) => new RegExp(`<div class="th-col-${col}">${COL[col]}</div>`).test(html);
// What the person sees: the header is in the markup and the stylesheet leaves it there.
const drawn = (html, col) => headed(html, col) && (filled(html, col) || !hides(col));

describe('a list column with no value in any row', () => {
  it('the reported case: every priority blank draws no Priority header', () => {
    const html = list([thread('w-1'), thread('w-2'), thread('w-3', { priority: null })]);
    expect(filled(html, 'prio')).toBe(false);
    expect(drawn(html, 'prio')).toBe(false);
  });

  it('one row at High brings the column back', () => {
    const html = list([thread('w-1'), thread('w-2', { priority: 7 }), thread('w-3')]);
    expect(drawn(html, 'prio')).toBe(true);
  });

  it('Low or Urgent alone brings it back too', () => {
    expect(drawn(list([thread('w-1', { priority: 2 })]), 'prio')).toBe(true);
    expect(drawn(list([thread('w-1', { priority: 9 })]), 'prio')).toBe(true);
  });

  // Agent rows in Needs you say Answered since 2026-11-02, so their column is drawn.
  it('a Status column of agent rows is drawn, as is a task saying who it is from', () => {
    expect(drawn(list([thread('w-1'), thread('w-2')]), 'state')).toBe(true);
    expect(drawn(list([thread('w-1'), task()]), 'state')).toBe(true);
  });

  it('a Project column with a project in it stays', () => {
    expect(drawn(list([thread('w-1'), task()]), 'proj')).toBe(true);
  });

  it('a Project column of tasks alone is not drawn', () => {
    expect(drawn(list([task()]), 'proj')).toBe(false);
  });
});

describe('the columns that stay still line up', () => {
  it('every row and the header take their tracks from one template whose hidden columns fall away', () => {
    const grid = CSS.match(/\.th-grid \{[^}]*grid-template-columns:([^;]+);/)[1];
    for (const col of ['state', 'proj', 'person', 'prio']) expect(grid).toContain(`var(--th-${col},)`);
    for (const col of ['state', 'proj', 'prio']) {
      expect(CSS).toMatch(new RegExp(String.raw`\.th-table:has\(\.th-head\):not\(:has\(\.th-cell-${col}:not\(:empty\)\)\) \.th-grid\s*\{\s*--th-${col}:\s*initial;?\s*\}`));
    }
  });

  it('every row of a list has the same cells in the same order, filled or not', () => {
    const html = list([thread('w-1'), thread('w-2', { priority: 7 }), task()]);
    const rows = [...html.matchAll(/<div class="row-main th-grid[^"]*">([\s\S]*?)<\/div><\/div>/g)].map((m) => m[1].match(/th-cell-[a-z]+/g)).filter(Boolean);
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r).toEqual(['th-cell-title', 'th-cell-state', 'th-cell-proj', 'th-cell-prio', 'th-cell-when']);
  });
});

describe('a board card follows the rows', () => {
  const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' };
  const given = task({ id: 'w-g', product: withDev.slug, assignee: DEV, people: [ME, DEV], createdBy: ME, talk: { chat: [{ by: ME, ts: NOW - MIN, text: 'Fix it' }] } });
  const board = (items) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
    React.createElement(InboxBoard, { items, products: [company, withDev], display, now: NOW, stateOf: () => 'running', onOpenItem() {}, picked: [ME] })));
  const cards = (html) => [...html.matchAll(/<button type="button" class="th-card[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);

  it('the reported card: a task at Medium says who has it and nothing more', () => {
    const [card] = cards(board([given]));
    expect(card).toContain('With Dev');
    expect(card).not.toMatch(/>Task</);
    expect(card).not.toContain('th-prio-mark');
  });

  it('a thread keeps its project and loses the Medium bars', () => {
    const [card] = cards(board([thread('w-1')]));
    expect(card).toContain('>Company<');
    expect(card).not.toContain('th-prio-mark');
  });

  it('a level somebody set still wears its bars', () => {
    expect(cards(board([thread('w-1', { priority: 7 })]))[0]).toContain('th-prio-mark');
    expect(cards(board([thread('w-1', { priority: 2 })]))[0]).toContain('th-prio-mark');
  });

  it('the entries carry no kind for a project', () => {
    const entries = teamEntries({ items: [given], products: [withDev], cards: [], me: ME, now: NOW, stateOf: () => 'running', allMine: true, nameOf: (id) => NAMES[id].split(' ')[0] });
    expect(entries[0].project).toBe(null);
  });
});

describe("a teammate's task row", () => {
  const card = (over = {}) => ({ personId: SOFIA, threadId: 't1', visible: true, title: 'Write the words for a slot', project: 'Task', state: 'waiting', priority: 5,
    problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: NOW - MIN, task: { from: DEV }, ...over });

  it('says nothing where a project goes', () => {
    expect(cardPlace(card())).toBe('');
    // The kind other copies of the app still publish, with no task field on the card.
    expect(cardPlace(card({ task: undefined }))).toBe('');
  });

  it('a teammate thread in a project still names it', () => {
    expect(cardPlace(card({ project: 'Northwind', task: undefined }))).toBe('Northwind');
    expect(cardPlace(card({ project: null, task: undefined }))).toBe('');
  });

  it('is empty in the drawn row', () => {
    const html = renderToStaticMarkup(React.createElement(RowCells, { title: 'x', where: cardPlace(card()), priority: 5, updatedAt: NOW, now: NOW }));
    expect(html).toContain('<div class="th-cell-proj th-col-proj"></div>');
  });

  it('on the board, under its teammate', () => {
    const entries = teamEntries({ items: [], products: [company], cards: [card()], me: ME, now: NOW });
    expect(entries[0].project).toBe(null);
  });
});
