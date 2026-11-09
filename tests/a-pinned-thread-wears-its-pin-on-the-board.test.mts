// A PINNED THREAD WEARS ITS PIN ON THE BOARD, AS IT DOES IN THE LIST.
//
// Reported 2026-10-20 (w-739077c097): "I feel like pinned threads aren't
// showing up in board view. I don't see any pinned icons even when I did have
// pinned threads here."
//
// Measured before the fix: the board already put pinned threads at the top of
// their column (`sortedEntries`, tests/a-pinned-thread-stays-at-the-top-of-the-list),
// but a card's title drew only the lock or the people mark, never the pin.
// A list row draws `th-pin` after its title (`RowCells`); the same pinned
// thread drawn as a card carried no `th-pin` anywhere in its markup, so on the
// board a pinned thread looked like any other.
//
// Now a card of yours that is pinned and not done wears the same faint pin
// after its title, after the lock when it has one, and kept on one line with
// the title's last word like every mark after a card's title. A message card
// wears it after the name. A finished thread, an unpinned one and a teammate's
// card wear none.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxBoard, ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY;
const ME = 'p-me';
const northwind = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const direct = { slug: 'direct-1', name: 'Maya', team: { direct: true, people: [ME, 'p-maya'] } };
const item = (o = {}) => ({
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Cloud launch video', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: SINCE + DAY, updatedAt: NOW - 60_000, createdBy: ME, visibility: 'team', ...o,
});
const team = { state: { since: SINCE, signedIn: true }, me: ME, byId: new Map([['p-maya', { id: 'p-maya', name: 'Maya Lin' }]]), products: new Map() };
const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const stateOf = (i) => (i.status === 'done' ? 'done' : 'waiting');
const board = (items, extra = {}) => renderToStaticMarkup(React.createElement(
  TeamContext.Provider, { value: team },
  React.createElement(InboxBoard, { items, products: [northwind, direct], display, now: NOW, stateOf, onOpenItem: () => {}, picked: [ME], ...extra }),
));
const cardsOf = (html) => [...html.matchAll(/<button type="button" class="th-card[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
const titleOf = (card) => card.match(/<div class="t">([\s\S]*?)<\/div>/)[1];
const PIN = /<svg[^>]*class="th-pin"/;

describe('a pinned card wears the pin', () => {
  it('the reported case: a pinned open thread on your board', () => {
    const [card] = cardsOf(board([item({ pinned: true })]));
    expect(titleOf(card)).toMatch(PIN);
  });

  it('the same mark the list row draws for the same thread', () => {
    const row = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
      React.createElement(ThreadCells, { item: item({ pinned: true }), product: northwind, now: NOW })));
    const mark = (html) => html.match(/<svg[^>]*class="th-pin"[^>]*>[\s\S]*?<\/svg>/)[0];
    expect(mark(titleOf(cardsOf(board([item({ pinned: true })]))[0]))).toBe(mark(row));
  });

  it('after the lock on a private thread, both kept on one line with the last word', () => {
    const t = titleOf(cardsOf(board([item({ pinned: true, visibility: 'private' })]))[0]);
    expect(t).toMatch(/<span class="th-keep">video<svg class="th-lock"[\s\S]*<\/svg><svg[^>]*class="th-pin"/);
  });

  it('kept with the last word when it is the only mark', () => {
    const t = titleOf(cardsOf(board([item({ pinned: true })]))[0]);
    expect(t).toMatch(/^Cloud launch <span class="th-keep">video<svg[^>]*class="th-pin"/);
  });

  it('on a message card, after the name', () => {
    const msg = item({ id: 'w-m', product: 'direct-1', body: 'Can you take the call?', pinned: true });
    const [card] = cardsOf(board([msg]));
    expect(card).toMatch(/<b class="th-msg-who">Maya Lin<svg[^>]*class="th-pin"/);
  });
});

describe('and nothing else does', () => {
  it('an unpinned card wears no pin', () => {
    expect(board([item()])).not.toMatch(PIN);
    expect(board([item({ pinned: false })])).not.toMatch(PIN);
  });

  it('a finished thread that still carries a pin wears none, as in the list', () => {
    expect(board([item({ pinned: true, status: 'done', updatedAt: NOW - 60_000 })])).not.toMatch(PIN);
  });

  it('an unpinned message card wears none', () => {
    expect(board([item({ id: 'w-m', product: 'direct-1', body: 'Can you take the call?' })])).not.toMatch(PIN);
  });

  it('a teammate\'s card wears none: a pin is yours alone', () => {
    const card = { personId: 'p-maya', threadId: 't', state: 'waiting', visible: true, title: 'Theirs', project: 'Northwind', priority: 5, updatedAt: NOW, pinned: true };
    const html = board([], { cards: [card], picked: [ME, 'p-maya'] });
    expect(cardsOf(html)).toHaveLength(1);
    expect(html).not.toMatch(PIN);
  });

  it('only the pinned card of two wears it', () => {
    const cards = cardsOf(board([item({ id: 'w-a', title: 'Pinned one', pinned: true }), item({ id: 'w-b', title: 'Plain one' })]));
    expect(cards).toHaveLength(2);
    expect(cards.filter((c) => PIN.test(c)).map((c) => titleOf(c).replace(/<[^>]+>/g, ''))).toEqual(['Pinned one']);
  });
});
