// GROUPS OPENS THE GROUP OPEN LAST (w-dcaa2c122e, 2026-10-23).
//
// The tab after Done held one room you picked by hand, and every other room or
// chat opened as a page of its own from the sidebar's Messages and Rooms rows.
// Asked for: call it Groups and have it show "the most recent group you had
// selected", with every group, and every chat, one click away from it.
// Measured on the drawn tab before: the room's name and its headcount, a
// picker of rooms only, and No room tab. Groups now opens the group open last,
// and any group, from anywhere, opens as the Groups page. Since 2026-10-24
// Groups is a row in the narrow sidebar rather than a tab
// (tests/with-groups-the-sidebar-stays-narrow-and-widens-when-pointed-at).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { groupInTab } from '../renderer/src/team/rooms/room-rules.ts';

const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
const room = (id, kind = 'room', pinned = false) => ({ id, kind, pinned });
const rooms = [room('general'), room('team', 'room', true), room('chat-maya', 'group')];

describe('which group Groups opens', () => {
  it('the one open last', () => {
    expect(groupInTab(rooms, 'chat-maya')?.id).toBe('chat-maya');
  });
  it('your team’s group until one has been opened, or after you left the last one', () => {
    expect(groupInTab(rooms, null)?.id).toBe('team');
    expect(groupInTab(rooms, 'gone')?.id).toBe('team');
  });
  it('a chat when there is no named group', () => {
    expect(groupInTab([room('chat-maya', 'group')], null)?.id).toBe('chat-maya');
  });
  it('none when you are in no group', () => {
    expect(groupInTab([], null)).toBeNull();
  });
});

describe('every group opens as the Groups page', () => {
  it('which then holds it', () => {
    expect(hook).toMatch(/const openRoom = \(id: string\) => \{[^}]*setOpenId\(id\);[^}]*setLastId\(id\); writeRoomTab\(id\);/);
  });
  it('a mention, a chat started from someone’s page, a group joined or started all go through it', () => {
    expect(hook).toContain('const openMention = (m: RoomMention) => openRoom(m.roomId);');
    expect(hook).toMatch(/id = res\.value;\s*\}\s*openRoom\(id\);\s*\};/);
    expect(hook.match(/if \(res\.value\) openRoom\(res\.value\);/g)).toHaveLength(2);
  });
  it('a teammate’s direct record opens in its own view, over the group', () => {
    expect(hook).toMatch(/if \(key\.startsWith\('direct:'\)\) onOpenDirect\(key\.slice\('direct:'\.length\)\);/);
  });
});

describe('stepping back', () => {
  it('goes from everyone’s threads, Find groups or a person’s page to the group, and from the group out', () => {
    const close = hook.slice(hook.indexOf('const close = () => {'), hook.indexOf('const leave = '));
    const order = ['if (finding)', 'if (boardOn)', "if (pane !== 'wall')", 'setOpenId(null)'].map((s) => close.indexOf(s));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('those pages say where back goes', () => {
    expect(hook).toContain("title: backTitle('Find groups')");
    expect(hook).toContain('heading = { title: backTitle(nameOf(open)) };');
  });
});
