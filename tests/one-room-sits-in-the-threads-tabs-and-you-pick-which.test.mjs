// ONE ROOM SITS IN THE THREADS TABS, AND YOU PICK WHICH (w-49cd37092c, 2026-10-22).
//
// When rooms moved to a page of their own (w-a0429b3d5e) every room tab went,
// though what was asked there was one slot in the tab bar that switches
// between rooms. "Before we used to have the first room pinned in a tab on the
// Threads page and now that's just gone. We were meant to add a little
// dropdown or something that allows me to choose which page is pinned." Of
// three drawings, the picked one is a room tab after Done with a small arrow
// to pick the room in it.
//
// Since Groups (w-dcaa2c122e, 2026-10-23) there is no slot: Groups, in the
// page-name menu, opens the group open last, and until one has been opened,
// the room picked here (tests/groups-opens-the-group-open-last). What still
// holds is below: which room comes first, and that the choice is remembered.
import { describe, it, expect } from 'vitest';
import { readRoomTab, writeRoomTab, tabRoom } from '../renderer/src/team/rooms/room-rules.ts';

const room = (id, o = {}) => ({ id, name: id, kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 4, createdAt: 0, pinned: false, muted: false, unread: 0, lastAt: 0, agents: 0, wall: [], ...o });
const general = room('general', { name: 'General', members: 23 });
const astral = room('astral', { name: 'Astral', members: 8, pinned: true });
const crit = room('crit', { name: 'Design crit', members: 5 });
const chat = room('chat', { name: 'Maya, Jun', kind: 'group' });
const rooms = [general, astral, crit, chat];
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('which room comes first', () => {
  it('the one you picked', () => {
    expect(tabRoom(rooms, 'crit')?.id).toBe('crit');
  });
  it('the first pinned room until you pick', () => {
    expect(tabRoom(rooms, null)?.id).toBe('astral');
  });
  it('the first room when none is pinned', () => {
    expect(tabRoom([general, crit], null)?.id).toBe('general');
  });
  it('the default again when the one you picked is gone', () => {
    expect(tabRoom(rooms, 'left-it')?.id).toBe('astral');
  });
  it('never a group chat', () => {
    expect(tabRoom([chat], null)).toBeNull();
    expect(tabRoom(rooms, 'chat')?.id).toBe('astral');
  });
  it('is remembered', () => {
    const store = memory();
    expect(readRoomTab(store)).toBeNull();
    writeRoomTab('crit', store);
    expect(readRoomTab(store)).toBe('crit');
  });
});
