// A ROOM ON THE ROOMS PAGE CAN BE MARKED READ OR UNREAD FROM ITS DOTS.
//
// Asked for after the first build: marking a conversation read or unread was
// on the messages page's rows, but the sidebar's rooms, whose dots already open
// a menu, had no way to do it. Measured on the drawn menu: an unread room
// offers Mark as read first, a read one Mark as unread, a muted room with
// unread messages counts as read (its count is hidden too), and a room marked
// unread by hand offers Mark as read. The rooms and their dots moved from the
// sidebar to the Rooms page, and Pin as a tab went with the tabs (w-a0429b3d5e).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomMenu } from '../renderer/src/team/rooms/RoomsPage.tsx';

const room = (extra = {}) => ({
  id: 'r1', name: 'Northwind', kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 3,
  createdAt: 0, pinned: false, muted: false, unread: 0, lastAt: 0, agents: 0, wall: [], ...extra,
});
const rows = (r) => [...renderToStaticMarkup(React.createElement(RoomMenu, { room: r, at: { left: 0, bottom: 0 }, onPick: () => {}, onClose: () => {} }))
  .matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);

describe('the dots on a room on the Rooms page', () => {
  it('offer Mark as read first on a room with unread messages', () => {
    expect(rows(room({ unread: 3 }))[0]).toBe('Mark as read');
  });

  it('offer Mark as unread on a room that is read', () => {
    expect(rows(room())[0]).toBe('Mark as unread');
  });

  it('count a muted room as read, as its hidden count does', () => {
    expect(rows(room({ unread: 3, muted: true }))[0]).toBe('Mark as unread');
  });

  it('offer Mark as read on a room marked unread by hand', () => {
    expect(rows(room({ markedUnread: true }))[0]).toBe('Mark as read');
  });

  // Show in the Threads tab since 2026-10-22.
  it('keep everything they offered before but the pin', () => {
    expect(rows(room())).toEqual(['Mark as unread', 'Invite people', 'Members', 'Ranks this week', 'Show in the Threads tab', 'Mute room']);
  });
});
