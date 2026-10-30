// "For the team chat it'd be good to be able to move these around, like drag
// them, because I would personally want the team chat to be right after me.
// I would want the chats to maybe look a little bit different because right
// now this is sort of perceived as same as everything else (people and bots)."
// Everything else draws your team as cards over the page: you, the team's
// chat, the people on your team, your AI teammates and your other chats. The
// order is whatever you dragged it into, kept across launches; anyone new
// lands where they would have been by default, and anyone gone leaves no gap.
import { describe, it, expect } from 'vitest';
import { buildMembers, orderMembers, moveMember, readOrder, writeOrder } from '../renderer/src/team/everything/members.ts';

const person = (id, name, extra = {}) => ({ id, name, email: `${id}@x`, avatarUrl: null, ...extra });
const card = (id, name, extra = {}) => ({ id, name, me: false, avatarUrl: null, agents: 0, level: 10, workingOn: null, workingPrivate: false, status: null, away: false, ...extra });
const mate = (id, name, extra = {}) => ({ id, name, letter: name[0], role: 'Maintainer', now: null, status: 'active', paused: false, ...extra });
const chat = (key, name, extra = {}) => ({ key, name, faces: [], last: '', at: 0, unread: false, pinned: false, ...extra });

const BASE = {
  me: { id: 'p-me', name: 'Sam Rivera', avatarUrl: null },
  people: [person('p-me', 'Sam Rivera'), person('p-theo', 'Theo Brandt'), person('p-maya', 'Maya Costa')],
  wall: [card('p-me', 'Sam Rivera', { me: true, agents: 2, workingOn: 'Signup flow' }), card('p-maya', 'Maya Costa', { agents: 14, workingOn: 'Billing page', level: 80 }),
    card('p-theo', 'Theo Brandt', { agents: 0, status: 'In meetings until 3' })],
  teammates: [mate('t-ada', 'Ada'), mate('t-rex', 'Rex', { role: 'Release notes' })],
  mateAgents: new Map([['t-ada', 6]]),
  chats: [chat('room:r-team', 'Northwind', { pinned: true, last: 'Theo: Lock screen works' }), chat('room:r-cowork', 'Coworking', { at: 5 }), chat('room:r-g1', 'Maya, Theo', { faces: [{ name: 'Maya Costa', url: null }, { name: 'Theo Brandt', url: null }], at: 9 })],
  teamRoomId: 'r-team',
};

describe('the cards over Everything else', () => {
  it('start with you, then the team chat, the people on your team, your AI teammates and your other chats', () => {
    expect(buildMembers(BASE).map((m) => m.key)).toEqual([
      'me', 'room:r-team', 'person:p-maya', 'person:p-theo', 'mate:t-ada', 'mate:t-rex', 'room:r-g1', 'room:r-cowork',
    ]);
  });

  it('say how many agents each one is running, and what a quiet one is doing instead', () => {
    const byKey = new Map(buildMembers(BASE).map((m) => [m.key, m]));
    expect(byKey.get('me')).toMatchObject({ kind: 'me', agents: 2, now: 'Signup flow' });
    expect(byKey.get('person:p-maya')).toMatchObject({ kind: 'person', agents: 14, now: 'Billing page', level: 80 });
    expect(byKey.get('person:p-theo')).toMatchObject({ agents: 0, now: 'In meetings until 3' });
    expect(byKey.get('mate:t-ada')).toMatchObject({ kind: 'mate', agents: 6, role: 'Maintainer' });
    expect(byKey.get('mate:t-rex')).toMatchObject({ agents: 0 });
  });

  it('mark the chats as chats, not as one more person: the team chat, a group and a chat with two people', () => {
    const byKey = new Map(buildMembers(BASE).map((m) => [m.key, m]));
    expect(byKey.get('room:r-team')).toMatchObject({ kind: 'chat', team: true, name: 'Team', last: 'Theo: Lock screen works' });
    expect(byKey.get('room:r-g1')).toMatchObject({ kind: 'chat', team: false });
    expect(byKey.get('room:r-g1').faces).toHaveLength(2);
  });

  it('leave a one-to-one chat with someone on your team to that person\'s own card', () => {
    const keys = buildMembers({ ...BASE, chats: [...BASE.chats, chat('room:r-maya', 'Maya', { faces: [{ name: 'Maya Costa', url: null }], at: 20 })], personChats: new Map([['p-maya', 'room:r-maya']]) }).map((m) => m.key);
    expect(keys).not.toContain('room:r-maya');
    expect(keys).toContain('person:p-maya');
    // A one-to-one chat with someone outside the team is a chat of its own.
    expect(buildMembers({ ...BASE, chats: [chat('room:r-jonah', 'Jonah', { faces: [{ name: 'Jonah W', url: null }] })] }).map((m) => m.key)).toContain('room:r-jonah');
  });

  it('keep the people on your team without Rooms, from the team itself, and leave out anyone who is you', () => {
    const keys = buildMembers({ ...BASE, wall: null, chats: [] }).map((m) => m.key);
    expect(keys).toEqual(['me', 'person:p-maya', 'person:p-theo', 'mate:t-ada', 'mate:t-rex']);
  });

  it('are just you and your AI teammates for someone with no team', () => {
    expect(buildMembers({ ...BASE, people: [], wall: null, chats: [], teamRoomId: null }).map((m) => m.key)).toEqual(['me', 'mate:t-ada', 'mate:t-rex']);
  });
});

describe('dragging the cards', () => {
  const keys = ['me', 'room:r-team', 'person:p-maya', 'mate:t-ada'];
  const members = keys.map((key) => ({ key }));

  it('moves one card to where it was dropped', () => {
    expect(moveMember(keys, 'mate:t-ada', 'room:r-team')).toEqual(['me', 'mate:t-ada', 'room:r-team', 'person:p-maya']);
    expect(moveMember(keys, 'me', 'mate:t-ada', 'after')).toEqual(['room:r-team', 'person:p-maya', 'mate:t-ada', 'me']);
    expect(moveMember(keys, 'me', 'me')).toEqual(keys);
  });

  it('draws the saved order, puts someone new where they belong by default, and forgets someone gone', () => {
    expect(orderMembers(members, ['mate:t-ada', 'me', 'person:p-maya', 'room:r-team']).map((m) => m.key))
      .toEqual(['mate:t-ada', 'me', 'person:p-maya', 'room:r-team']);
    expect(orderMembers(members, ['mate:t-ada', 'me']).map((m) => m.key))
      .toEqual(['mate:t-ada', 'me', 'room:r-team', 'person:p-maya']);
    expect(orderMembers(members, ['person:p-gone', 'me', 'mate:t-ada']).map((m) => m.key))
      .toEqual(['me', 'room:r-team', 'person:p-maya', 'mate:t-ada']);
    expect(orderMembers(members, null).map((m) => m.key)).toEqual(keys);
  });

  it('keeps the order across launches, and a broken saved value reads as no order', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    writeOrder(['mate:t-ada', 'me'], storage);
    expect(readOrder(storage)).toEqual(['mate:t-ada', 'me']);
    store.set([...store.keys()][0], '{not json');
    expect(readOrder(storage)).toBeNull();
    expect(readOrder(null)).toBeNull();
  });
});
