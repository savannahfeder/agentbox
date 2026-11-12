// A MESSAGE TO YOU IS A CARD IN THE BOARD'S NEEDS YOU COLUMN (2026-11-09).
//
// On the board a group message to you (and a team invitation) was drawn as a
// list row in a strip above the columns. The owner pinned it on the picture:
// "not sure i understand why there is an inbox thread here?" It is a card at
// the top of Needs you now, counted in that column's number. Measured by
// rendering the board with one message and reading App.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxBoard } from '../renderer/src/threads/Pages.tsx';
import { MentionCards } from '../renderer/src/team/rooms/MentionRows.tsx';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' };
const mention = { id: 'm1', roomId: 'r1', roomName: 'northwind', by: 'u2', byName: 'Maya Chen', body: 'Can you approve the keys?', at: 1, unread: true };
const board = (lead) => renderToStaticMarkup(h(InboxBoard, { items: [], products: [], display, now: 2, onOpenItem() {}, lead }));
const column = (html, word) => html.split('th-col-h').find((c) => c.includes(word));

describe('the board with a message to you', () => {
  const html = board({ count: 1, cards: h(MentionCards, { mentions: [mention], onOpen() {} }) });

  it('draws it as a card in Needs you, with who wrote and where', () => {
    const needs = column(html, 'Needs you');
    expect(needs).toContain('th-card');
    expect(needs).toContain('Maya Chen');
    expect(needs).toContain('#northwind');
  });

  it('counts it in the column and does not call the column empty', () => {
    expect(column(html, 'Needs you')).toContain('<b>1</b>');
    expect(column(html, 'Needs you')).not.toContain('Nothing here');
  });

  it('puts it in no other column', () => {
    expect(column(html, 'In progress')).not.toContain('Maya Chen');
  });

  it('leaves an empty Needs you empty when there is no message', () => {
    expect(column(board(undefined), 'Needs you')).toContain('Nothing here');
  });
});

describe('in the app', () => {
  it('draws no strip of rows above the board', () => {
    expect(app).not.toContain('{leadCount > 0 && <div className="list th-table">{leadRowsDrawn(allLeads)}</div>}');
    expect(app).toContain('<InboxBoard items={items} lead={boardLead}');
    expect(app).toContain('count: fromPeopleAbove');
  });
});
