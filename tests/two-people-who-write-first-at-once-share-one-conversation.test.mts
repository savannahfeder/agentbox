// TWO PEOPLE WHO WRITE FIRST AT ONCE SHARE ONE CONVERSATION (2026-11-11).
//
// Both testers of a two-person team, twice: "Sent first message is absent from
// Lena conversation: only Lena's incoming message appears. My 271-character
// message is absent." Both wrote their first message at 7:05, seconds after
// the team formed. Each Mac looked for a two-person group among the rooms it
// had pulled, found none, and made its own, so the cloud held two groups for
// the pair and each person's page drew a different one: each side saw only
// the other's message. Measured over the in-memory cloud: two creates in the
// same round trip made two groups, and a create after the other side's (before
// a pull) made a second one too.
//
// Now a create asks the cloud first and takes the pair's group it already has;
// when two exist anyway both Macs pick the same one (oldest, then lowest id),
// and the person's page reads the pair's messages from every one of them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms } from '../main/team/rooms.mts';
import { pairRooms, listedIn, oneConversation } from '../shared/pair-room.mts';

const timers = { setTimeout: () => ({}), clearTimeout: () => {} };

async function person(cloud, name) {
  const id = signUpMemory(cloud, { email: `${name.toLowerCase()}@x.test`, name });
  const backend = memoryBackend(cloud, id);
  const p = { id, backend, teamState: { team: null, people: [], cards: [] } };
  p.rooms = createRooms({
    backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => p.teamState, enabled: () => true,
    device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }), now: () => Date.now(), timers,
  });
  await p.rooms.start();
  return p;
}

async function aTeam(...names) {
  const cloud = createMemoryCloud();
  const people = [];
  for (const n of names) people.push(await person(cloud, n));
  const team = await people[0].backend.createTeam('Northwind');
  for (let i = 1; i < people.length; i += 1) {
    await people[0].backend.invite(team.id, `${names[i].toLowerCase()}@x.test`);
    await people[i].backend.acceptInvite(team.id);
  }
  for (const p of people) p.teamState = { team: { id: team.id }, people: people.map((x) => ({ id: x.id })), cards: [] };
  return { cloud, people };
}

const groupsIn = async (p) => (await p.backend.myRooms()).filter((r) => r.kind === 'group');
const chosen = (p, other) => pairRooms(p.rooms.state().rooms, other.id, listedIn)[0]?.id ?? null;
const pageWords = (p, other) => {
  const s = p.rooms.state();
  return oneConversation(pairRooms(s.rooms, other.id, listedIn).map((r) => s.messages[r.id] ?? [])).map((m) => m.body);
};

describe('choosing the pair\'s room', () => {
  const card = (id, me = false) => ({ id, me, name: id });
  const pair = (id, createdAt, me = 'p-theo', them = 'p-lena') => ({ id, kind: 'group', teamId: null, members: 2, createdAt, wall: [card(me, true), card(them)], people: null });

  it('picks the older of two, in either list order and on either side', () => {
    const a = pair('r-b', 100);
    const b = pair('r-a', 200);
    expect(pairRooms([a, b], 'p-lena', listedIn)[0].id).toBe('r-b');
    expect(pairRooms([b, a], 'p-lena', listedIn)[0].id).toBe('r-b');
    const hers = [pair('r-a', 200, 'p-lena', 'p-theo'), pair('r-b', 100, 'p-lena', 'p-theo')];
    expect(pairRooms(hers, 'p-theo', listedIn)[0].id).toBe('r-b');
  });

  it('breaks a tie in time by the id, the same way on both sides', () => {
    expect(pairRooms([pair('r-b', 100), pair('r-a', 100)], 'p-lena', listedIn)[0].id).toBe('r-a');
    expect(pairRooms([pair('r-a', 100, 'p-lena', 'p-theo'), pair('r-b', 100, 'p-lena', 'p-theo')], 'p-theo', listedIn)[0].id).toBe('r-a');
  });

  it('finds them by name when they have no card on the wall yet', () => {
    const r = { ...pair('r-a', 1), wall: [card('p-theo', true)], people: [{ id: 'p-theo' }, { id: 'p-lena' }] };
    expect(pairRooms([r], 'p-lena', listedIn).map((x) => x.id)).toEqual(['r-a']);
  });

  it('never takes a group of three, a named room, the team\'s room or a pair with someone else', () => {
    const three = { ...pair('r-3', 1), members: 3, wall: [card('p-theo', true), card('p-lena'), card('p-jun')] };
    const named = { ...pair('r-n', 1), kind: 'room' };
    const team = { ...pair('r-t', 1), kind: 'room', teamId: 't1' };
    const jun = pair('r-j', 1, 'p-theo', 'p-jun');
    expect(pairRooms([three, named, team, jun], 'p-lena', listedIn)).toEqual([]);
    expect(pairRooms([three, named, team, jun, pair('r-ok', 9)], 'p-lena', listedIn).map((r) => r.id)).toEqual(['r-ok']);
  });

  it('lists what was said in both rooms in time order', () => {
    const m = (id, roomId, at) => ({ id, roomId, at, body: id });
    expect(oneConversation([[m('t1', 'a', 1), m('t3', 'a', 3)], [m('l2', 'b', 2)]]).map((x) => x.id)).toEqual(['t1', 'l2', 't3']);
    expect(oneConversation([[m('x', 'a', 5)], [m('w', 'b', 5)]]).map((x) => x.id)).toEqual(['w', 'x']);
    expect(oneConversation([])).toEqual([]);
  });
});

describe('starting a chat with one person on the Mac', () => {
  it('takes the group the cloud already has for the pair, made on the other Mac and not pulled here yet', async () => {
    const { people: [theo, lena] } = await aTeam('Theo', 'Lena');
    const his = await theo.rooms.create({ name: 'Lena', kind: 'group', people: [lena.id] });
    // Lena's Mac has not pulled since.
    const hers = await lena.rooms.create({ name: 'Theo', kind: 'group', people: [theo.id] });
    expect(hers).toBe(his);
    expect((await groupsIn(lena)).map((r) => r.id)).toEqual([his]);
  });

  it('makes one when the pair has none', async () => {
    const { people: [theo, lena] } = await aTeam('Theo', 'Lena');
    expect(await groupsIn(theo)).toEqual([]);
    const id = await theo.rooms.create({ name: 'Lena', kind: 'group', people: [lena.id] });
    expect((await groupsIn(lena)).map((r) => r.id)).toEqual([id]);
  });

  it('does not take a group of three for a pair', async () => {
    const { people: [theo, lena, jun] } = await aTeam('Theo', 'Lena', 'Jun');
    const three = await theo.rooms.create({ name: 'Lena, Jun', kind: 'group', people: [lena.id, jun.id] });
    const pair = await lena.rooms.create({ name: 'Theo', kind: 'group', people: [theo.id] });
    expect(pair).not.toBe(three);
    expect((await groupsIn(lena)).length).toBe(2);
  });
});

describe('in the window', () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('every place that finds a person\'s chat uses the one chooser, never the first in its list', () => {
    for (const f of ['renderer/src/App.tsx', 'renderer/src/team/rooms/useRooms.tsx']) {
      expect(read(f), f).not.toMatch(/members === 2/);
      expect(read(f), f).toContain('pairRooms(');
    }
  });

  it('draws a pair\'s chat from every room the pair has, and sends where the other side reads', () => {
    const rooms = read('renderer/src/team/rooms/useRooms.tsx');
    expect(rooms).toMatch(/oneConversation\(twins\.map/);
    expect(rooms).toMatch(/onSend: \(body, opts\) => send\(opts\.inReplyTo \? roomOfMessage\(opts\.inReplyTo\)\.id : home\.id\)\(body, opts\)/);
  });
});

describe('both writing first in the same moment, on two Macs', () => {
  it('ends with both on the same room, and both first messages on both pages', async () => {
    const { people: [theo, lena] } = await aTeam('Theo', 'Lena');
    // Neither has pulled the other's room: both creates are in flight at once.
    const [his, hers] = await Promise.all([
      theo.rooms.create({ name: 'Lena', kind: 'group', people: [lena.id] }),
      lena.rooms.create({ name: 'Theo', kind: 'group', people: [theo.id] }),
    ]);
    await theo.rooms.send(his, 'Theo first: the import is green on staging.');
    await lena.rooms.send(hers, 'Lena first: can you look at the CSV rows?');
    await theo.rooms.refresh();
    await lena.rooms.refresh();

    expect(chosen(theo, lena)).not.toBeNull();
    expect(chosen(theo, lena)).toBe(chosen(lena, theo));
    for (const [p, other] of [[theo, lena], [lena, theo]]) {
      expect(pageWords(p, other)).toEqual(expect.arrayContaining(['Theo first: the import is green on staging.', 'Lena first: can you look at the CSV rows?']));
    }
  });
});
