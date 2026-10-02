// A PRIVATE THREAD ALWAYS WEARS THE LOCK.
//
// The lock used to be drawn only while a teammate's threads were on the page:
// `privateMark` returned `withOthers && ... === 'private'`, so the same row
// said "only you can see this" or said nothing at all depending on whose faces
// were lit at the top of the page. A mark that comes and goes with an
// unrelated control is a mark you cannot read.
//
// So the marks are now unconditional, and a row carries at most one of them:
// the lock on a thread only you can see, the people mark on one a few chosen
// people see, and (since 2026-10-02) nothing on one the whole team sees,
// because that is the default. None depends on who else is on the page. Where the question does not
// arise at all (nobody signed in, a message between people, an agent's own
// row, a teammate's thread) there is still no mark, because `rowSharing`
// answers null and both marks hang off it.
//
// The cost, stated rather than discovered: every thread from before you joined
// is private, so on a store whose threads all predate the team the lock is on
// every line. That is deliberate.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadCells, InboxBoard } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { privateMark } from '../renderer/src/threads/people-rules.ts';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY;
const ME = 'p-me';
const northwind = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const direct = { slug: 'direct-1', name: 'Maya', team: { direct: true, people: [ME, 'p-maya'] } };
const item = (o = {}) => ({
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Acme renewal terms', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: SINCE - DAY, updatedAt: NOW - DAY, createdBy: ME, ...o,
});
const team = { state: { since: SINCE, signedIn: true }, me: ME, byId: new Map(), products: new Map() };
const T = { me: ME, since: SINCE };
const draw = (it, product = northwind, t = team) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: t }, React.createElement(ThreadCells, { item: it, product, now: NOW })),
);

describe('privateMark no longer asks who else is on the page', () => {
  it('a thread only you can see wears the lock on your own page', () => {
    expect(privateMark(item(), northwind, T, false)).toBe(true);
  });
  it('and wears it with a teammate beside you, as it already did', () => {
    expect(privateMark(item(), northwind, T, true)).toBe(true);
  });
  it('the boundary either side: the moment you joined is the team’s, a moment before is yours', () => {
    expect(privateMark(item({ createdAt: SINCE }), northwind, T, false)).toBe(false);
    expect(privateMark(item({ createdAt: SINCE - 1 }), northwind, T, false)).toBe(true);
  });
  it('never on a thread the team can see, however the page is set', () => {
    expect(privateMark(item({ visibility: 'team' }), northwind, T, false)).toBe(false);
    expect(privateMark(item({ visibility: 'team' }), northwind, T, true)).toBe(false);
  });
  it('and never where the question does not arise', () => {
    expect(privateMark(item(), northwind, null, false)).toBe(false);
    expect(privateMark(item(), direct, T, false)).toBe(false);
    expect(privateMark(item({ agent: { pid: 1 } }), northwind, T, false)).toBe(false);
    expect(privateMark(item({ createdBy: 'p-maya' }), northwind, T, false)).toBe(false);
  });
});

describe('the row draws one mark, and the same one either way', () => {
  it('the lock on a private thread', () => {
    expect(draw(item())).toContain('th-lock');
  });
  // Since 2026-10-02 a thread the whole team sees, the default, wears nothing
  // (tests/a-thread-the-whole-team-sees-wears-no-mark.test.mjs); the people
  // mark is left for a thread a few chosen people see.
  it('no lock on a thread the team can see', () => {
    expect(draw(item({ createdAt: SINCE + DAY }))).not.toContain('th-lock');
  });
  it('the people mark on a thread a few chosen people see', () => {
    expect(draw(item({ createdAt: SINCE + DAY, visibility: 'people', visibleTo: ['p-theo'] }))).toContain('th-shared');
  });
  it('never both on one row', () => {
    for (const html of [draw(item()), draw(item({ createdAt: SINCE + DAY })), draw(item({ visibility: 'people', visibleTo: ['p-theo'] }))]) {
      expect(html.includes('th-lock') && html.includes('th-shared')).toBe(false);
    }
  });
  it('and neither on a message between people or with nobody signed in', () => {
    const message = draw(item({ product: 'direct-1', body: 'Can you take the call?' }), direct);
    expect(message).not.toContain('th-lock');
    expect(message).not.toContain('th-shared');
    const out = draw(item(), northwind, null);
    expect(out).not.toContain('th-lock');
    expect(out).not.toContain('th-shared');
  });
});

describe('a board card wears it too, on your own board', () => {
  const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any' };
  const board = (items) => renderToStaticMarkup(React.createElement(
    TeamContext.Provider, { value: team },
    React.createElement(InboxBoard, { items, products: [northwind], display, now: NOW, onOpenItem: () => {}, picked: [ME] }),
  ));
  it('the lock on a private card with nobody else on the board', () => {
    expect(board([item()])).toContain('th-lock');
  });
  it('no lock on a card the team can see', () => {
    expect(board([item({ createdAt: SINCE + DAY })])).not.toContain('th-lock');
  });
});
