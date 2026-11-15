// ROOMS LIVE ON A PAGE OF THEIR OWN (w-a0429b3d5e, 2026-10-21).
//
// Clicking General in the sidebar put a General tab after Done that went away
// again as soon as you left, and the sidebar carried a folding Rooms list with
// a full-size New room row under it. Asked for: "a dedicated page with a
// dedicated sidebar button for rooms ... a page that shows the rooms you're in
// and allows you to jump into them."
//
// Measured by drawing the sidebar through useRooms with two rooms and a group:
// it drew the Rooms header, both rooms and New room, and the tab bar drew a
// tab per pinned room plus the one open. Then the sidebar had one Rooms row
// under Messages, and the Rooms page listed the rooms.
//
// Since Groups (w-dcaa2c122e, 2026-10-23) the Rooms page is not drawn: every
// group and chat opens as the Groups page (tests/groups-opens-the-group-open-last)
// and the sidebar has no rooms row (tests/the-narrow-sidebar-draws-no-rooms).
// The page's component is still in the tree, so what it draws is still held
// here, and no room ever becomes a pinned tab again.
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { RoomsPage, RoomMenu, menuLeft } from '../renderer/src/team/rooms/RoomsPage.tsx';
import * as rules from '../renderer/src/team/rooms/room-rules.ts';

const card = (id, extra = {}) => ({ id, me: false, name: id, avatarUrl: null, agents: 0, level: 1, ...extra });
const room = (id, extra = {}) => ({
  id, name: id, kind: 'room', teamId: null, listed: false, inviteOnly: false, role: 'member', members: 3,
  createdAt: 1, pinned: false, muted: false, unread: 0, lastAt: 1, agents: 0, wall: [], ...extra,
});
const state = (rooms, messages = {}) => ({ on: true, ready: true, rooms, messages, me: null, ranks: {}, invites: [], mentions: [], error: null });
const msg = (roomId, by, body, at) => ({ id: `${roomId}-${at}`, roomId, by, body, inReplyTo: null, mentions: [], at });

const noop = () => {};

describe('the Rooms page', () => {
  const now = 10 * 60_000;
  const draw = (rooms, messages, invisible = false) => renderToStaticMarkup(createElement(RoomsPage,
    { state: state(rooms, messages), invisible, now, onOpen: noop, onFind: noop, onMenu: noop }));
  const astral = room('Astral', { members: 4, agents: 6, wall: [card('me', { me: true }), card('Maya C.')] });
  const general = room('General', { members: 6, unread: 2 });
  const html = draw([astral, general, room('group-chat', { kind: 'group', name: 'Maya, Theo' })],
    { Astral: [msg('Astral', 'Maya C.', 'Restart it with the png.', 9 * 60_000)] });

  it('has a row for each room you are in', () => {
    expect(html).toContain('>Astral<');
    expect(html).toContain('>General<');
  });
  it('never lists a group chat, which lives in Messages', () => {
    expect(html).not.toContain('Maya, Theo');
  });
  it('says how many people are in each, how many agents are working, and what was said last', () => {
    expect(html).toMatch(/class="n">4</);
    expect(html).toContain('6 agents working');
    expect(html).toContain('Not running');
    expect(html).toContain('Maya C.: Restart it with the png.');
    expect(html).toContain('1 min ago');
  });
  it('counts you out of the people while you are invisible', () => {
    expect(draw([astral], {}, true)).toMatch(/class="n">3</);
  });
  it('marks a room with something new, but not a read one or a muted one', () => {
    const rowOf = (h, name) => h.split('role="button"').find((s) => s.includes(`>${name}<`));
    expect(rowOf(html, 'General')).toContain('class="row unread"');
    expect(rowOf(html, 'Astral')).not.toContain('unread');
    expect(draw([room('Quiet', { unread: 5, muted: true })], {})).not.toContain('unread');
  });
  // Seen on the first build: the dots end the row at the window's right, and
  // the menu opened from their left edge ran off the window.
  it('opens a row’s menu inside the window, ending under the dots at the right', () => {
    expect(menuLeft(1378, 1402, 1440)).toBe(1152);
    expect(menuLeft(1430, 1430, 1440)).toBe(1180);
    expect(menuLeft(600, 624, 1440)).toBe(592);
    expect(menuLeft(4, 4, 1440)).toBe(8);
  });
  it('ends with a way to find more rooms', () => {
    expect(html).toContain('Find rooms to join');
  });
  it('says so when you are in no rooms yet', () => {
    const empty = draw([], {});
    expect(empty).toContain('You are not in any rooms yet.');
    expect(empty).toContain('Find rooms to join');
  });
});

// The pinned tabs and the tab per open room stay gone; Groups is a row in the
// narrow sidebar (tests/with-groups-the-sidebar-stays-narrow-and-widens-when-pointed-at).
describe('no pinned room tabs', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  it('the tab bar is given no room tabs', () => {
    expect(app).not.toContain('roomsUi.tabs');
    expect(app).not.toContain('roomsUi.walk');
    expect(fs.existsSync(new URL('../renderer/src/team/rooms/RoomTabs.tsx', import.meta.url))).toBe(false);
    expect(rules.roomTabs).toBeUndefined();
    expect(rules.tabWalk).toBeUndefined();
  });
  it('a room has no pin, in its menu or anywhere', () => {
    const items = [...renderToStaticMarkup(createElement(RoomMenu, { room: room('r'), at: { left: 0, bottom: 0 }, onPick: noop, onClose: noop }))
      .matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(items).not.toContain('Pin as a tab');
    expect(hook).not.toMatch(/call\('pin'/);
  });
});
