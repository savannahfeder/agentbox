// A THREAD THE WHOLE TEAM SEES WEARS NO MARK. ONLY THE UNUSUAL ONES DO.
//
// Seen on the team build (2026-10-02): every row on the Waiting tab, ten of
// ten, carried the little two-people mark after its title, because every one
// of them was shared with the team. Shared with the team is the default, so a
// mark on it says nothing and sits on almost every line. The feedback: "public
// tasks are the expected default state", so they carry no icon, and the lock
// is what marks the unusual case, a thread only you can see.
//
// So, after the title of a row and on a board card:
//   - the whole team can see it: nothing;
//   - only you can see it: the lock;
//   - a few chosen people can see it: the people mark with their count, since
//     that is not the default either, and the count needs something to sit by.
// Hovering a row still offers Share / Unshare, with its own small mark inside
// the button, so the way to change it is unchanged.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadCells, InboxBoard } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY;
const ME = 'p-me';
const northwind = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const item = (o = {}) => ({
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Task prioritization in queue', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: SINCE + DAY, updatedAt: NOW - DAY, createdBy: ME, ...o,
});
const team = { state: { since: SINCE, signedIn: true }, me: ME, byId: new Map(), products: new Map() };
const row = (it) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: team }, React.createElement(ThreadCells, { item: it, product: northwind, now: NOW })),
);
const title = (html) => html.match(/<div class="th-cell-title[^"]*">([\s\S]*?)<\/div>/)[1];
const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any' };
const board = (items) => renderToStaticMarkup(React.createElement(
  TeamContext.Provider, { value: team },
  React.createElement(InboxBoard, { items, products: [northwind], display, now: NOW, onOpenItem: () => {}, picked: [ME] }),
));

describe('the row', () => {
  it('draws nothing after the title of a thread the whole team sees', () => {
    expect(title(row(item()))).toBe('Task prioritization in queue');
  });
  it('the same for an old thread shared by hand', () => {
    expect(title(row(item({ createdAt: SINCE - DAY, visibility: 'team' })))).toBe('Task prioritization in queue');
  });
  it('still offers Unshare on hover', () => {
    expect(row(item())).toMatch(/<button[^>]*class="th-row-act"[^>]*>.*Unshare<\/button>/);
  });
  it('draws the lock, and only the lock, on a thread only you can see', () => {
    const t = title(row(item({ visibility: 'private' })));
    expect(t).toContain('th-lock');
    expect(t).not.toContain('th-shared');
  });
  it('the boundary: started a moment before you joined is yours and wears the lock', () => {
    expect(title(row(item({ createdAt: SINCE - 1 })))).toContain('th-lock');
    expect(title(row(item({ createdAt: SINCE })))).not.toContain('th-lock');
  });
  it('keeps the people mark and its count on a thread only a few chosen people see', () => {
    const t = title(row(item({ visibility: 'people', visibleTo: ['p-theo', 'p-ana'] })));
    expect(t).toContain('th-shared');
    expect(t).toMatch(/<span class="th-shared-n"[^>]*>2<\/span>/);
    expect(t).not.toContain('th-lock');
  });
});

// THE COUNT SITS LEVEL WITH THE MARK (2026-10-02). Feedback on the shipped row:
// the 2 beside the people mark was "like a pixel below where it should be".
// Measured in the built app (scripts/scratch/measure-w-61c7f4a224.mjs, ink
// from the font's metrics and the mark's paths): the digit's middle sat 1.33px
// below the mark's, at vertical-align 0. Raised by 1.5px it sat 0.17px above
// level, and side by side at normal size that read as too high, while 0 read
// as too low: "can you have one placed in between?" So 0.75px, halfway.
describe('the count beside the people mark', () => {
  const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  it('is raised halfway between the baseline (too low) and 1.5px (too high)', () => {
    expect(css).toMatch(/\.th-shared-n \{[^}]*vertical-align: 0\.75px/);
  });
  it('the mark itself stays where it was', () => {
    expect(css).toMatch(/\.th-shared \{[^}]*vertical-align: -1px/);
  });
});

describe('a board card', () => {
  it('draws nothing beside a thread the whole team sees', () => {
    const html = board([item()]);
    expect(html).not.toContain('th-shared');
    expect(html).not.toContain('th-lock');
  });
  it('the lock on a private card', () => {
    expect(board([item({ visibility: 'private' })])).toContain('th-lock');
  });
  it('the people mark on a card only a few chosen people see', () => {
    expect(board([item({ visibility: 'people', visibleTo: ['p-theo'] })])).toContain('th-shared');
  });
});
