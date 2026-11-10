// YOUR OWN MESSAGES SAY "YOU" WHILE YOU ARE INVISIBLE (w-3d0fa23ffb, 2026-10-21).
//
// The power tester went invisible in the founder's room and her Messages list
// read "Someone: agree, empty wall feels like working alone" for her own words,
// and flipped back to "You:" when she came back. Going invisible takes my card
// off every wall, including my own, and the list named a message's author only
// from the wall. The room's chat already kept me as "You" (withMe); the list now
// knows me the same way.
import { it, expect } from 'vitest';
import { roomConversations } from '../renderer/src/team/rooms/conversations.ts';

const ME = 'p-me';
const MATE = 'p-mate';
const card = (id, name, me = false) => ({ id, name, me, avatarUrl: null });
const state = ({ wall, by }) => ({
  on: true, ready: true, ranks: {}, invites: [], mentions: [], error: null,
  me: { person_id: ME, display_name: 'Maya C.' },
  rooms: [{ id: 'r1', kind: 'room', name: 'Astral', wall, unread: 0, muted: false, markedUnread: false, createdAt: 1 }],
  messages: { r1: [{ id: 'm1', roomId: 'r1', by, body: 'agree, empty wall feels like working alone', at: 5 }] },
});

it('my last message reads "You" while my card is off the wall', () => {
  const [row] = roomConversations(state({ wall: [card(MATE, 'Ana L.')], by: ME }));
  expect(row.last).toBe('You: agree, empty wall feels like working alone');
});

it('my last message reads "You" while I am on the wall too', () => {
  const [row] = roomConversations(state({ wall: [card(ME, 'Maya C.', true), card(MATE, 'Ana L.')], by: ME }));
  expect(row.last).toBe('You: agree, empty wall feels like working alone');
});

it("someone else's message keeps their name, and a stranger's is still Someone", () => {
  expect(roomConversations(state({ wall: [card(MATE, 'Ana L.')], by: MATE }))[0].last).toBe('Ana L.: agree, empty wall feels like working alone');
  expect(roomConversations(state({ wall: [card(MATE, 'Ana L.')], by: 'p-gone' }))[0].last).toBe('Someone: agree, empty wall feels like working alone');
});
