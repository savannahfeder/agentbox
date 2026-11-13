// A CHAT IS NAMED FOR THE OTHERS IN IT, NEVER FOR YOU (2026-11-11).
//
// Three people on one team with Rooms on. Maya messaged Theo, which made a
// two-person group on her Mac named for him, "Theo Okafor". On Theo's Inbox
// the row read "Maya C. <text>  Waiting on you" with "# Theo Okafor" in the
// Project column: the group's stored name, which is only right from where
// Maya sits. The group's own header already named the others; the Needs you
// row (and the board card, Home and the phone, which all draw the same
// mention rows) used the stored name.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mentionRows, roomTitle } from '../renderer/src/team/rooms/room-rules.ts';
import { MentionRows } from '../renderer/src/team/rooms/MentionRows.tsx';
import { roomConversations } from '../renderer/src/team/rooms/conversations.ts';

const NOW = Date.UTC(2026, 10, 11, 12, 0);
const card = (id, name, me = false) => ({ id, me, name, avatarUrl: null, headline: null, bio: null, agents: 0, hoursTotal: 0, hoursWeek: 0, hoursToday: 0, streak: 0, byMonth: [], teammate: true, showActivity: false });
const room = (over = {}) => ({
  id: 'r-dm', name: 'Theo Okafor', kind: 'group', teamId: null, listed: false, inviteOnly: false, role: 'member', members: 2,
  createdAt: NOW - 60_000, pinned: false, muted: false, unread: 1, lastAt: NOW, agents: 0, wall: [], people: null, ...over,
});
const asTheo = (wall) => wall.map((c) => ({ ...c, me: c.id === 'u-theo' }));
const asMaya = (wall) => wall.map((c) => ({ ...c, me: c.id === 'u-maya' }));
const both = [card('u-maya', 'Maya C.'), card('u-theo', 'Theo O.')];
const said = (over = {}) => ({
  id: 'room-mention:m1', messageId: 'm1', roomId: 'r-dm', roomName: 'Theo Okafor', by: 'u-maya', byName: 'Maya C.', body: 'Can you look at the deck?', at: NOW, ...over,
});
const state = (rooms, me) => ({ rooms, me: { person_id: me, display_name: '', avatar_url: null, headline: null, bio: null } });
const draw = (rows) => renderToStaticMarkup(React.createElement(MentionRows, { mentions: rows, faces: new Map(), now: NOW, onOpen: () => {} }));

describe('a two-person chat', () => {
  it('is named for Maya on Theo\'s Needs you, not for Theo (the reported row)', () => {
    const rows = mentionRows([said()], state([room({ wall: asTheo(both) })], 'u-theo'));
    expect(rows[0].roomName).toBe('Maya C.');
    const html = draw(rows);
    expect(html).not.toContain('Theo');
    expect(html).toContain('Maya C.');
  });

  it('is named for Theo from where Maya sits', () => {
    expect(roomTitle(room({ wall: asMaya(both) }), 'u-maya')).toBe('Theo O.');
  });

  it('still names the sender as the sender', () => {
    const [row] = mentionRows([said()], state([room({ wall: asTheo(both) })], 'u-theo'));
    expect(row.byName).toBe('Maya C.');
    expect(draw([row])).toContain('<b class="th-msg-who">Maya C.</b>');
  });

  it('names the other person when they are off the wall but in the room', () => {
    const r = room({ wall: asTheo([card('u-theo', 'Theo O.')]), people: [{ id: 'u-maya', name: 'Maya Chen', avatarUrl: null }, { id: 'u-theo', name: 'Theo Okafor', avatarUrl: null }] });
    expect(roomTitle(r, 'u-theo')).toBe('Maya Chen');
  });

  it('keeps its stored name when nobody else is known to be in it', () => {
    expect(roomTitle(room({ wall: asTheo([card('u-theo', 'Theo O.')]) }), 'u-theo')).toBe('Theo Okafor');
  });
});

describe('a group of several', () => {
  const three = [card('u-maya', 'Maya C.'), card('u-theo', 'Theo O.'), card('u-priya', 'Priya S.')];
  it('names everyone else and leaves you out', () => {
    const r = room({ name: 'Theo Okafor, Priya S.', members: 3, wall: asTheo(three) });
    expect(roomTitle(r, 'u-theo')).toBe('Maya C., Priya S.');
    const [row] = mentionRows([said({ roomName: r.name })], state([r], 'u-theo'));
    expect(row.roomName).toBe('Maya C., Priya S.');
  });
});

describe('a named room', () => {
  it('keeps its own name, though you are in it', () => {
    const r = room({ id: 'r-astral', name: 'Astral', kind: 'room', members: 3, wall: asTheo(both) });
    expect(roomTitle(r, 'u-theo')).toBe('Astral');
    const [row] = mentionRows([said({ roomId: 'r-astral', roomName: 'Astral' })], state([r], 'u-theo'));
    expect(row.roomName).toBe('Astral');
  });
});

describe('every list of chats', () => {
  it('names a chat by the same rule as its Needs you row', () => {
    const r = room({ wall: asTheo(both), role: 'owner' });
    const rooms = { on: true, ready: true, rooms: [r], messages: {}, me: state([], 'u-theo').me, ranks: {}, invites: [], mentions: [], error: null };
    expect(roomConversations(rooms)[0].name).toBe(roomTitle(r, 'u-theo'));
  });
});
