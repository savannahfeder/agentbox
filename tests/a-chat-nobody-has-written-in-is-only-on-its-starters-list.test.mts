// A CHAT NOBODY HAS WRITTEN IN IS ONLY ON ITS STARTER'S LIST (w-3d0fa23ffb, 2026-10-22).
//
// The power tester's Messages list showed the founder's name and "15:47" with no line
// under it, and opening it showed an empty chat: the founder had pressed
// Message on her card, which makes the conversation, and written nothing yet.
// She logged it as a message she could not find. A chat with nothing in it
// now waits on the list of whoever started it, and reaches everyone else with
// its first message.
import { it, expect } from 'vitest';
import { roomConversations } from '../renderer/src/team/rooms/conversations.ts';

const state = (rooms, messages = {}) => ({ on: true, ready: true, ranks: {}, invites: [], mentions: [], error: null, me: { person_id: 'p-maya', display_name: 'Maya C.' }, rooms, messages });
const group = (role, extra = {}) => ({ id: 'g1', kind: 'group', name: '', role, wall: [{ id: 'p-ana', name: 'Ana L.', me: false, avatarUrl: null }], unread: 0, muted: false, markedUnread: false, createdAt: 5, ...extra });

it("someone else's empty chat with me is not on my list yet", () => {
  expect(roomConversations(state([group('member')]))).toEqual([]);
});

it('it is, once they write in it', () => {
  const rows = roomConversations(state([group('member')], { g1: [{ id: 'm1', roomId: 'g1', by: 'p-ana', body: 'hey', at: 9 }] }));
  expect(rows.map((r) => r.last)).toEqual(['Ana L.: hey']);
});

it('the one I started stays on my list, empty, so I can write in it', () => {
  expect(roomConversations(state([group('owner')])).map((r) => r.id)).toEqual(['g1']);
});

it('a room is listed whether or not anyone has written in it', () => {
  expect(roomConversations(state([group('member', { kind: 'room', name: 'Astral' })])).map((r) => r.name)).toEqual(['Astral']);
});
