// A group row in Needs you took its author and words from the group's newest message, whoever it was to, so Sam read "Theo is waiting on you" for Theo's message to Priya (power test issues 105, 20).
// Measured on groupRow: the row now says the newest message that is to you, and the group still opens only on one.
import { it, expect } from 'vitest';
import { groupRow } from '../shared/room-needs-you.mts';

const PEOPLE = [{ id: 'sam', name: 'Sam' }, { id: 'theo', name: 'Theo' }, { id: 'priya', name: 'Priya' }];
const said = (id, by, body, at, over = {}) => ({ id, roomId: 'r', by, body, at, mentions: [], inReplyTo: null, ...over });
const row = (messages, over = {}) => groupRow({ roomId: 'r', roomName: 'Northwind', messages, me: 'sam', people: PEOPLE, nameOf: (id) => PEOPLE.find((p) => p.id === id)?.name ?? '', ...over });

it('says the message to you, not a newer one to someone else', () => {
  const r = row([said('1', 'priya', 'Sam, is the cents step done?', 10), said('2', 'theo', 'Priya, all four of your copy changes are in.', 20)]);
  expect(r).toMatchObject({ by: 'priya', byName: 'Priya', body: 'Sam, is the cents step done?', messageId: '1', at: 10 });
});

it('says the newest of several messages to you', () => {
  const r = row([said('1', 'priya', 'Sam, one', 10), said('2', 'theo', 'Sam, two', 15), said('3', 'priya', 'Theo, thanks', 20)]);
  expect(r).toMatchObject({ by: 'theo', body: 'Sam, two', messageId: '2', at: 15 });
});

it('is unread by the message to you, not by the newer one', () => {
  const messages = [said('1', 'priya', 'Sam, one', 10), said('2', 'theo', 'Priya, two', 20)];
  expect(row(messages, { readAt: 12 })).toMatchObject({ unread: false });
  expect(row(messages, { readAt: 9 })).toMatchObject({ unread: true });
});

it('is still nothing when no message is to you', () => {
  expect(row([said('1', 'theo', 'Priya, all four are in.', 20)])).toBeNull();
});

it('in a chat that is just you and one teammate, still says their newest message', () => {
  expect(row([said('1', 'theo', 'one', 10), said('2', 'theo', 'two', 20)], { pair: true })).toMatchObject({ body: 'two', messageId: '2' });
});
