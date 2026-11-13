// THE BOARD LISTS THE FILE NOTES AND FOLLOWED THREADS THE LIST SHOWS (2026-11-12).
//
// Two testers in one round: the Inbox list said Needs you 16 (or 14) and the
// board, one press of B later, said 14 (or 12); the rows missing were a
// teammate's note naming them on a file and a followed thread that finished.
// The list drew those at the top of Needs you (SharedFileRows, FollowRows);
// the board drew only group messages and invitations there, and the board a
// team sees drew none of them. Measured by drawing the board with one of each
// and reading App.tsx: both boards now take the same cards, in the list's
// order, and count them in the column's number.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxBoard } from '../renderer/src/threads/Pages.tsx';
import { SharedFileCards } from '../renderer/src/threads/SharedFileRows.tsx';
import { FollowCards } from '../renderer/src/threads/FollowRows.tsx';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' };
const team = { me: 'u-me', state: {}, byId: new Map([['u-maya', { id: 'u-maya', name: 'Maya Chen', email: '', avatarUrl: null }]]), products: new Map() };
const card = { personId: 'u-maya', threadId: 't-1', visible: true, title: 'Fix the pricing page', project: 'Kestrel', state: 'waiting', priority: 5, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
const news = { owner: 'u-maya', threadId: 't-1', id: 'n1', file: 'deck.md#2', text: 'Is this right?', by: 'u-maya', ts: 1 };
const follow = { key: 'u-maya/t-9/done', kind: 'done', owner: 'u-maya', thread: 't-9', title: 'Ship the invoices', at: 2, card: { ...card, threadId: 't-9', state: 'done', title: 'Ship the invoices' } };
const board = (lead) => renderToStaticMarkup(h(InboxBoard, { items: [], products: [], display, now: 3, onOpenItem() {}, lead }));
const column = (html, word) => html.split('th-col-h').find((c) => c.includes(word));

describe('the board with a file note and a followed thread for you', () => {
  const cards = h('div', null,
    h(SharedFileCards, { news: [news], cards: [card], team, onOpen() {} }),
    h(FollowCards, { news: [follow], team, onOpen() {} }));
  const html = board({ count: 2, cards });

  it('draws each as a card in Needs you, saying who and on what, as the list row does', () => {
    const needs = column(html, 'Needs you');
    expect(needs).toContain('Maya');
    expect(needs).toContain('named you on deck.md: Is this right?');
    expect(needs).toContain('Fix the pricing page');
    expect(needs).toContain('Ship the invoices');
    expect(needs).toContain('Maya finished Ship the invoices');
  });
  it('counts them in the column', () => {
    expect(column(html, 'Needs you')).toContain('<b>2</b>');
    expect(column(html, 'Needs you')).not.toContain('Nothing here');
  });
  it('puts them in no other column', () => {
    expect(column(html, 'In progress')).not.toContain('deck.md');
    expect(column(html, 'Done')).not.toContain('Ship the invoices');
  });
  it('draws no card for a note whose thread is not here to open, as the list draws no row', () => {
    const gone = renderToStaticMarkup(h(SharedFileCards, { news: [{ ...news, threadId: 't-gone' }], cards: [card], team, onOpen() {} }));
    expect(gone).toBe('');
  });
});

describe('in the app', () => {
  it('builds one set of cards for the board, in the order the list draws its rows', () => {
    const built = app.slice(app.indexOf('const boardLead ='), app.indexOf('const boardLead =') + 900);
    expect(built).toContain('count: fromPeopleAbove');
    expect(built.indexOf('<SharedFileCards')).toBeGreaterThan(-1);
    expect(built.indexOf('<SharedFileCards')).toBeLessThan(built.indexOf('<FollowCards'));
    expect(built.indexOf('<FollowCards')).toBeLessThan(built.indexOf('leadCardsDrawn(allLeads)'));
  });
  it('gives those cards to the board without a team and to your own board with one', () => {
    expect(app).toContain('<InboxBoard items={items} lead={boardLead}');
    expect(app).toContain('<InboxBoard items={boardArgs.items} lead={evBoard.mineOnly ? boardLead : undefined}');
  });
  it('opens a file card at the note, and a followed card marks the news read, as the list rows do', () => {
    const built = app.slice(app.indexOf('const boardLead ='), app.indexOf('const boardLead =') + 900);
    expect(built).toContain('openTeammateCard(card, { file: n.file, note: n.id })');
    expect(built).toContain('changeFollows((was) => markTold(was, n)); openTeammateCard(card);');
  });
});
