// A ROOM-MATE'S THREADS ON THE BOARD WEAR THEIR OWN FACE (w-3d0fa23ffb, 2026-10-22).
//
// A room-mate outside the team now has their activity drawn on their page's
// board, and every card on it wore "SO", the first letters of "Someone": the
// board names a card's owner from the team's people, and they are not on the
// team. Room-mates are known by name from the rooms, so the board falls back to
// them. They are kept apart from the team's people, which the Inbox's people
// pick lists, so a room-mate never becomes someone to pick there.
import { it, expect } from 'vitest';
import { personOf } from '../renderer/src/team/company.ts';
import { roomMatesById } from '../renderer/src/team/rooms/room-rules.ts';

const card = (id, name, extra = {}) => ({ id, name, me: false, teammate: false, avatarUrl: null, ...extra });
const team = (alsoById) => ({ me: 'p-ana', byId: new Map([['p-teo', { id: 'p-teo', email: 'teo@x', name: 'Teo Park', avatarUrl: null }]]), alsoById });

it("a room-mate's card is named after them, not Someone", () => {
  const rooms = [{ wall: [card('p-maya', 'Maya C.'), card('p-ana', 'You', { me: true })] }];
  expect(personOf(team(roomMatesById(rooms)), 'p-maya')?.name).toBe('Maya C.');
});

it("a teammate's is still the team's own entry", () => {
  expect(personOf(team(roomMatesById([{ wall: [card('p-teo', 'Teo P.', { teammate: true })] }])), 'p-teo')?.name).toBe('Teo Park');
});

it('nobody known is nobody, and no team is no answer', () => {
  expect(personOf(team(new Map()), 'p-x')).toBeNull();
  expect(personOf(null, 'p-maya')).toBeNull();
});

it('room-mates are kept out of the team map itself, and I am not one', () => {
  const also = roomMatesById([{ wall: [card('p-maya', 'Maya C.'), card('p-ana', 'You', { me: true })] }]);
  expect([...also.keys()]).toEqual(['p-maya']);
});
