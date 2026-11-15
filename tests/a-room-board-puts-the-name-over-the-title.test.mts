// A ROOM'S BOARD PUTS THE NAME OVER THE TITLE (w-49cd37092c, round six).
//
// Of five ways drawn to show whose a thread is, name over title was picked:
// the face beside two lines, the first name small above the title. The board
// before it put the title first and the face and name after it on the same
// line, so the name took width from the title and most titles were cut. Now
// the title has all the width beside the face and the whole of it shows on
// hover.
//
// Round eleven: titles wrapped once before they were cut, and on the built
// board at 1728 one of Theo's ran to a second line while the rest sat on one.
// Asked for every title on one line, cut with an ellipsis.
//
// Round twelve: then a tiny bit larger, as long as most still fit. Measured on
// the built board at 1728 with 19 real-length titles: 13px cut 1, 13.5px cut 3,
// 14px cut 5 and 14.5px cut 9.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomBoard } from '../renderer/src/team/rooms/RoomBoard.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.parse('2026-10-21T15:00:00Z');
const sam = { id: 'p-sam', name: 'Sam Rivera', email: 'sam@example.test', avatarUrl: null };
const maya = { id: 'p-maya', name: 'Maya Chen', email: 'maya@example.test', avatarUrl: 'https://example.test/maya.jpg' };
const products = [{ slug: 'checkout', name: 'Checkout' }];
const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any', privacy: 'any' };
const LONG = 'Stripe webhook retries drop the second attempt after a timeout';
const card = (threadId, title, state) => ({
  personId: maya.id, threadId, visible: true, title, project: 'Checkout', state, priority: null, problem: null, progress: null, solution: null,
  blockedBy: [], blocks: [], people: null, updatedAt: NOW - 60_000,
});
const mine = { id: 'w-1', product: 'checkout', title: 'Pricing page copy', body: '', status: 'open', labels: [], createdAt: NOW - 600_000, updatedAt: NOW - 60_000 };

const draw = () => renderToStaticMarkup(React.createElement(TeamContext.Provider, {
  value: { state: { since: null }, me: sam.id, byId: new Map([[sam.id, sam], [maya.id, maya]]), products: new Map() },
}, React.createElement(RoomBoard, {
  items: [mine], products, display, now: NOW, stateOf: () => 'waiting',
  cards: [card('m1', LONG, 'running')], picked: [sam.id, maya.id], onOpenItem: () => {}, onOpenCard: () => {},
})));
const row = (html, title) => html.match(new RegExp(`<button[^>]*class="rm-brow[^"]*"[^>]*>(?:(?!</button>)[\\s\\S])*?${title}[\\s\\S]*?</button>`))?.[0] ?? '';

describe('a line on the room’s board', () => {
  it('is the face, then the first name over the title', () => {
    const line = row(draw(), 'Stripe webhook');
    expect(line).toMatch(/<img class="tm-av tm-ph" src="https:\/\/example.test\/maya.jpg"[^>]*\/?><span class="txt"><span class="who">Maya<\/span><span class="t">Stripe webhook/);
  });
  it('says You on your own, with your initials where there is no photo', () => {
    const line = row(draw(), 'Pricing page copy');
    expect(line).toMatch(/<span class="tm-av you"[^>]*>Sa<\/span><span class="txt"><span class="who">You<\/span><span class="t">Pricing page copy<\/span>/);
  });
  it('carries the whole title for a hover, however it is cut on screen', () => {
    expect(row(draw(), 'Stripe webhook')).toContain(`title="${LONG}"`);
  });
});

describe('how much of a title shows', () => {
  const rooms = readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
  const title = rooms.match(/\.rm-brow \.t \{([^}]*)\}/)?.[1] ?? '';
  it('one line, cut with an ellipsis, never a second', () => {
    expect(title).toMatch(/white-space: nowrap/);
    expect(title).toMatch(/text-overflow: ellipsis/);
    expect(title).toMatch(/overflow: hidden/);
    expect(title).not.toMatch(/line-clamp/);
  });
  it('a touch larger than 13px, and no larger than most titles allow', () => {
    expect(Number(title.match(/font-size: ([\d.]+)px/)?.[1])).toBe(13.5);
  });
  it('a name is one line, whatever its length', () => {
    expect(rooms.match(/\.rm-brow \.who \{([^}]*)\}/)?.[1] ?? '').toMatch(/white-space: nowrap/);
  });
});
