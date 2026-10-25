// A ROOM IS ITS BOARD, WITH NO GRID TO SWITCH TO (w-49cd37092c, 2026-10-22).
//
// The room's board shipped behind a View switch, with the grid of people as
// the room's first view. After restarting onto it the room still showed only
// people and no threads: the running app was built from the shipped code, and
// its saved settings held no rooms.view, so it opened on the grid. Then: "I
// didn't even know there was a difference between board view and non-board
// view... you open a room and you immediately see this, and there is no board
// view or list view for rooms." The board's row of tiles carries what the
// grid did, so the grid and the switch are gone. The sliders button keeps the
// board's own choices, Later and People.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomViewButton, RoomViewMenu } from '../renderer/src/team/rooms/RoomView.tsx';
import { RoomPage } from '../renderer/src/team/rooms/RoomPage.tsx';
import * as rules from '../renderer/src/team/rooms/room-rules.ts';
globalThis.React = React;

const card = (id, o = {}) => ({
  id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 1, level: 3, hoursTotal: 10, hoursWeek: 2, hoursToday: 1,
  streak: 1, byMonth: [], teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o,
});
const me = card('sam', { me: true, teammate: false, name: 'Sam' });
const maya = card('maya', { name: 'Maya' });
const props = { people: [me, maya], picked: ['sam', 'maya'], onPick: () => {}, unseen: 0, later: false, onLater: () => {} };

describe('the sliders menu over a room', () => {
  const menu = renderToStaticMarkup(React.createElement(RoomViewMenu, props));
  it('offers no Grid and no Board', () => {
    expect(menu).not.toContain('>Grid<');
    expect(menu).not.toContain('>Board<');
    expect(menu).not.toMatch(/<span class="lab">View<\/span>/);
  });
  it('keeps the board’s own choices, Later and whose threads', () => {
    expect(menu).toContain('<span class="lab">Show</span>');
    expect(menu).toContain('<span class="lab">People</span>');
  });
  it('names no key that switches views', () => {
    const button = renderToStaticMarkup(React.createElement(RoomViewButton, props));
    expect(button).not.toContain('(B)');
    expect(button).toContain('title="Filters"');
  });
});

describe('the room page', () => {
  const room = (wall, members) => ({ id: 'r1', name: 'Northwind', kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'owner', members, createdAt: 0, pinned: true, muted: false, unread: 0, lastAt: 0, agents: 0, wall });
  const page = (r, board) => renderToStaticMarkup(React.createElement(RoomPage, {
    room: r, rooms: [r], cards: [], ranks: {}, me: null, now: 0, pane: 'wall', link: 'tok', chat: null, board,
    picked: new Set(), onPick: () => {}, onPane: () => {}, onComeBack: () => {}, onCopyLink: () => {},
  }));
  const board = React.createElement('div', { id: 'the-board' });
  it('draws the board and not the grid', () => {
    const html = page(room([me, maya], 2), board);
    expect(html).toContain('the-board');
    expect(html).not.toContain('rm-grid');
  });
  it('still says it is just you, with the link, in a room of one', () => {
    const html = page(room([me], 1), board);
    expect(html).toContain('the-board');
    expect(html).toContain('It is just you in Northwind.');
    expect(html).toContain('Copy link');
  });
  it('does not say so once someone else is in it', () => {
    expect(page(room([me, maya], 2), board)).not.toContain('It is just you');
  });
});

describe('wired in the app', () => {
  const hook = readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('a room always draws its board', () => {
    expect(hook).toMatch(/const board = onRoom && renderBoard\s*\n?\s*\?/);
    expect(hook).not.toMatch(/readRoomView|view === 'board'/);
  });
  it('B does nothing of its own in a room', () => {
    expect(app).not.toContain('roomsUi.flipView');
    expect(hook).not.toContain('flipView');
  });
  it('no view is kept for rooms', () => {
    expect(rules.readRoomView).toBeUndefined();
    expect(rules.writeRoomView).toBeUndefined();
  });
});
