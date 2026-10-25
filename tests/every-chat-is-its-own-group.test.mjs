// EVERY CHAT IS ITS OWN GROUP (w-dcaa2c122e, 2026-10-23).
//
// Messages and Rooms were two places for one idea, and a chat with Maya and a
// chat with Maya and Priya sat in different lists from the room they came
// from. Asked for: a chat with one teammate and a chat with that teammate and
// another, each reachable on its own, and named groups told apart from the
// chats made from them with a #.
// Measured on the drawn list: before, the Messages page listed chats and the
// Rooms page rooms. Now one list holds the named groups and every chat.
//
// It was drawn first as a row of chips over a group's chat; on 2026-10-24 that
// row was "functionally overwhelming" and the list moved into the narrow
// sidebar (tests/with-groups-the-sidebar-stays-narrow-and-widens-when-pointed-at).
import { describe, it, expect } from 'vitest';
import { groupChoices, lastWords } from '../renderer/src/team/rooms/GroupList.tsx';
import { groupsInOrder } from '../renderer/src/team/rooms/GroupsSidebar.tsx';

const face = (name) => ({ name, url: null });
const conv = (key, name, at, faces = [], extra = {}) => ({ key, kind: faces.length ? 'group' : 'room', id: key.split(':')[1], name, faces, last: '', at, unread: false, ...extra });
const list = [
  conv('room:team', 'Northwind', 10),
  conv('room:general', 'General', 50),
  conv('room:g1', 'Maya Chen', 40, [face('Maya Chen')], { last: 'Maya Chen: Yes' }),
  conv('room:g2', 'Maya Chen, Priya Nair', 30, [face('Maya Chen'), face('Priya Nair')], { last: 'Priya Nair: Back at 3' }),
  conv('direct:d1', 'Theo P.', 20, [face('Theo P.')], { last: 'You: On it' }),
];
const all = groupChoices(list, new Set(['room:team']));

describe('the list of groups', () => {
  it('keeps a chat with one person and a chat with that person and another apart', () => {
    expect(all.map((g) => g.name)).toEqual(['General', 'Maya', 'Maya, Priya', 'Theo', 'Northwind']);
  });
  it('lists a teammate’s direct record as a chat of its own, by its key', () => {
    expect(all.find((g) => g.name === 'Theo')?.key).toBe('direct:d1');
  });
  it('marks your team’s group, and only it', () => {
    expect(all.filter((g) => g.pinned).map((g) => g.name)).toEqual(['Northwind']);
  });
  it('is shown named groups first, your team’s leading, then chats newest first', () => {
    expect(groupsInOrder(all).map((g) => g.name)).toEqual(['Northwind', 'General', 'Maya', 'Maya, Priya', 'Theo']);
  });
});

describe('what was said last', () => {
  it('drops the name in a chat with only that person', () => {
    expect(lastWords('Maya Chen: Yes', true)).toBe('Yes');
  });
  it('keeps a first name where several people talk', () => {
    expect(lastWords('Priya Nair: Back at 3', false)).toBe('Priya: Back at 3');
  });
  it('keeps You, and words with no speaker', () => {
    expect(lastWords('You: On it', true)).toBe('You: On it');
    expect(lastWords('Deleted a message', false)).toBe('Deleted a message');
  });
});
