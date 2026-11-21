// A THREAD AT MEDIUM SAYS MEDIUM IN THE PRIORITY COLUMN.
//
// Reported 2026-11-21 with a picture of Needs you in the team version: eleven
// rows, two reading URGENT under Priority and nine reading nothing, a wide
// blank where their level belonged. "Tasks that have medium priority should
// still show up as medium priority in the priority section rather than having
// this big empty space."
//
// Medium had been left out on purpose on 2026-11-02 as the level nobody set.
// Measured on the rendered markup before this change: the Priority cell of a
// thread at 5, of a thread nobody tagged and of a repeating task at 5 was
// empty, and a list where every thread was at Medium drew no Priority column
// at all. A repeating task left on Agent decides is saved at 0 and its runs go
// at Medium, yet its row read Low.
//
// A message nobody gave a level still leaves its cell empty.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { List } from '../renderer/src/components/List.tsx';
import { RowCells, ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.parse('2026-11-21T10:00:00Z');
const MIN = 60_000;
const ME = 'p-maya', SOFIA = 'p-sofia';
const team = { state: { signedIn: true, cards: [] }, me: ME, byId: new Map([[ME, { id: ME, name: 'Maya Chen' }], [SOFIA, { id: SOFIA, name: 'Sofia Ruiz' }]]), products: new Map() };

const company = { slug: 'company', name: 'Company' };
const withSofia = { slug: 'direct-sofia', name: 'Sofia', team: { projectId: 'd', direct: true, people: [ME, SOFIA] } };

const thread = (over = {}) => ({
  id: 'w-1', product: 'company', productName: 'Company', status: 'open', kind: 'question', title: 'Draft the October investor update',
  note: 'Two ways to do it.', labels: ['founder'], priority: 5, claim: null, createdAt: NOW - 3 * MIN, updatedAt: NOW - 3 * MIN, ...over,
});
const message = (over = {}) => ({
  id: 'w-3', product: withSofia.slug, status: 'open', kind: 'directive', title: 'Is the cut ready?', body: 'Is the cut ready?',
  labels: [], people: [ME, SOFIA], createdBy: SOFIA, priority: 5, createdAt: NOW - MIN, updatedAt: NOW - MIN,
  wrote: { body: { ts: NOW - MIN, by: SOFIA } }, ...over,
});
const rule = (over = {}) => ({
  id: 'r-abc1234567', product: 'company', productName: 'Company', title: 'Check for new video skills', priority: 5,
  every: 'day', at: '09:00', createdAt: NOW - 3 * 86_400_000, served: '', misses: 0, alerted: 0, ...over,
});

const shown = (element) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: team },
    React.createElement(FleetContext.Provider, { value: { queued: [] } }, element)));
const row = (item, product = company) => shown(React.createElement(ThreadCells, { item, product, now: NOW, tab: 'inbox' }));
const list = (props) => shown(React.createElement(List, {
  items: [], view: 'inbox', selected: -1, seen: new Set(), running: [], multiSel: new Set(), repeats: [], allItems: [],
  onSelect() {}, onOpen() {}, onToggle() {}, onRange() {}, table: true, products: [company], ...props,
}));

// Every Priority cell's inside, in order.
const prioCells = (html) => [...html.matchAll(/<div class="th-cell-prio[^"]*">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
const words = (html) => prioCells(html).map((c) => c.replace(/<[^>]+>/g, '').trim());
const bars = (cell) => cell.match(/prio-bars p(\d)/)?.[1] ?? null;

describe('the Priority cell of a thread at Medium', () => {
  it('the reported case: a thread at 5 says Medium, with the two bars', () => {
    const [cell] = prioCells(row(thread({ priority: 5 })));
    expect(cell.replace(/<[^>]+>/g, '')).toBe('Medium');
    expect(bars(cell)).toBe('2');
  });

  it('a thread nobody tagged runs at Medium and says so', () => {
    expect(words(row(thread({ priority: 0 })))).toEqual(['Medium']);
    expect(words(row(thread({ priority: null })))).toEqual(['Medium']);
    expect(words(row(thread({ priority: undefined })))).toEqual(['Medium']);
  });

  it('the edges of Medium say Medium, and one step past them does not', () => {
    expect(words(row(thread({ priority: 3 })))).toEqual(['Medium']);
    expect(words(row(thread({ priority: 6 })))).toEqual(['Medium']);
    expect(words(row(thread({ priority: 2 })))).toEqual(['Low']);
    expect(words(row(thread({ priority: 7 })))).toEqual(['High']);
  });

  it('is not drawn as urgent', () => {
    expect(row(thread({ priority: 5 }))).not.toMatch(/th-cell-prio[^"]*urgent/);
    expect(row(thread({ priority: 9 }))).toMatch(/th-cell-prio[^"]*urgent/);
  });
});

describe('the other levels are as they were', () => {
  it.each([[9, 'Urgent', '4'], [7, 'High', '3'], [2, 'Low', '1']])('%i says %s with %s bars', (priority, word, n) => {
    const [cell] = prioCells(row(thread({ priority })));
    expect(cell.replace(/<[^>]+>/g, '')).toBe(word);
    expect(bars(cell)).toBe(n);
  });
});

describe('rows that are not your own threads', () => {
  it("a teammate's thread at Medium says Medium", () => {
    expect(words(renderToStaticMarkup(React.createElement(RowCells, { title: 'x', where: 'Company', priority: 5, updatedAt: NOW, now: NOW })))).toEqual(['Medium']);
  });

  it('a row with no level at all stays empty', () => {
    expect(words(renderToStaticMarkup(React.createElement(RowCells, { title: 'x', where: 'Company', priority: null, updatedAt: NOW, now: NOW })))).toEqual(['']);
  });

  it('a message nobody gave a level stays empty', () => {
    expect(words(row(message(), withSofia))).toEqual(['']);
  });

  it('a message the sorter put at Medium says Medium', () => {
    const sorted = message({ priority: 5, wrote: { body: { ts: NOW - MIN, by: SOFIA }, priority: { ts: NOW - MIN, source: 'agent', by: 'sorter' } } });
    expect(words(row(sorted, withSofia))).toEqual(['Medium']);
  });
});

describe('a repeating task on Later', () => {
  const later = (r) => words(list({ view: 'snoozed', repeats: [r] }));

  it('at Medium says Medium', () => {
    expect(later(rule({ priority: 5 }))).toEqual(['Medium']);
    expect(later(rule({ priority: undefined }))).toEqual(['Medium']);
  });

  it('left on Agent decides (saved at 0) says Medium, the level its runs go at, not Low', () => {
    expect(later(rule({ priority: 0 }))).toEqual(['Medium']);
  });

  it('one set to Low or High still says so', () => {
    expect(later(rule({ priority: 2 }))).toEqual(['Low']);
    expect(later(rule({ priority: 7 }))).toEqual(['High']);
  });
});

describe('the Priority column of a list', () => {
  it('is drawn when every thread in it is at Medium', () => {
    const html = list({ items: [thread({ id: 'w-1' }), thread({ id: 'w-2', priority: 0 }), thread({ id: 'w-3' })] });
    expect(html).toContain('<div class="th-col-prio">Priority</div>');
    expect(words(html)).toEqual(['Medium', 'Medium', 'Medium']);
  });

  it('names each row its own level when they differ', () => {
    const html = list({ items: [thread({ id: 'w-1', priority: 9 }), thread({ id: 'w-2' }), thread({ id: 'w-3', priority: 2 })] });
    expect(words(html)).toEqual(['Urgent', 'Medium', 'Low']);
  });
});
