// A MEDIUM THREAD SAYS MEDIUM IN THE PRIORITY COLUMN.
//
// Since 2026-11-01 the inbox table left the Priority cell blank at Medium, the
// level an untagged thread runs at, to cut clutter. On 2026-11-17, looking at
// Needs you with two High rows and an Urgent one among a dozen blanks: "medium
// priority tasks should show up under priority as medium. looks worse when
// empty". Drawn with ThreadCells, every Medium row's Priority cell was ''.
//
// The table's cell now names every level. The board's cards keep their rule
// (no bars at Medium): they have no Priority column to leave a hole in.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadCells, RowCells } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.parse('2026-11-17T10:00:00Z');
const MIN = 60_000;
const ME = 'p-maya';
const team = { state: { signedIn: true, cards: [] }, me: ME, byId: new Map([[ME, { id: ME, name: 'Maya Chen' }]]), products: new Map() };
const company = { slug: 'company', name: 'Company' };

const thread = (over = {}) => ({
  id: 'w-1', product: 'company', productName: 'Company', status: 'open', kind: 'question', title: 'Draft the October investor update',
  note: 'Two ways to do it.', labels: ['founder'], priority: 5, claim: null, createdAt: NOW - 3 * MIN, updatedAt: NOW - 3 * MIN, ...over,
});
const draw = (item) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: team },
    React.createElement(FleetContext.Provider, { value: { queued: [] } },
      React.createElement(ThreadCells, { item, product: company, now: NOW, tab: 'inbox' }))));
const prioCell = (html) => {
  const at = html.indexOf('th-cell-prio');
  const next = html.indexOf('<div class="th-cell-', at + 1);
  return html.slice(html.indexOf('>', at) + 1, next).replace(/<[^>]+>/g, '').trim();
};

describe('the Priority column', () => {
  it('the reported case: a thread set to Medium says Medium, with its bars', () => {
    const html = draw(thread({ priority: 5 }));
    expect(prioCell(html)).toBe('Medium');
    expect(html).toMatch(/th-cell-prio[^>]*><span class="th-prio-mark"><span class="prio-bars p2">/);
  });

  it('an untagged thread runs at Medium and says so', () => {
    expect(prioCell(draw(thread({ priority: 0 })))).toBe('Medium');
    expect(prioCell(draw(thread({ priority: null })))).toBe('Medium');
  });

  it('either side of Medium inside its band still says Medium', () => {
    expect(prioCell(draw(thread({ priority: 3 })))).toBe('Medium');
    expect(prioCell(draw(thread({ priority: 6 })))).toBe('Medium');
  });

  it.each([[9, 'Urgent'], [7, 'High'], [2, 'Low']])('the other levels are unchanged: %i is %s', (priority, word) => {
    expect(prioCell(draw(thread({ priority })))).toBe(word);
  });

  it('a row with no level at all, such as a conversation, stays blank', () => {
    const html = renderToStaticMarkup(React.createElement(RowCells, { title: 'x', where: '', priority: null, updatedAt: NOW, now: NOW }));
    expect(prioCell(html)).toBe('');
  });
});
