// A DIRECT MESSAGE FROM A TEAMMATE REACHES NEEDS YOU (2026-11-20).
//
// On a synthetic team, Sam sent Theo a link to his thread in their one-to-one
// chat, then "Hey Theo, sorry to bother you — could you look at just the last
// step?". Theo checked Needs you three times over nine minutes and it was
// never there; he found the thread by search. A group message only reached
// Needs you when it named you (@Theo, "Theo, …", or a reply to you), and a
// one-to-one chat ran the same rule, so a message that opened "Hey Theo" or
// was only a link made no row. Measured on Theo's copy: the two-person chat
// held both messages and his Needs you rows were empty.
//
// In the chat that is just you and one teammate, everything they send is to
// you. A group of three still needs your name.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { groupRow } from '../shared/room-needs-you.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';

const THEO = { id: 'p-theo', name: 'Theo Okafor' };
const SAM = { id: 'p-sam', name: 'Sam Ortiz' };
const T = Date.UTC(2026, 10, 20, 0, 38);
const said = (id: string, by: string, min: number, body: string) => ({ id, by, body, at: T + min * 60_000, mentions: [], inReplyTo: null });
const LINK = '[Idempotency key for POST appointments](https://app.agentbox.ac/t/x/y)';
const ASK = 'Hey Theo, sorry to bother you — could you look at just the last step?';

describe('the row a one-to-one chat makes', () => {
  const row = (messages: ReturnType<typeof said>[], pair: boolean, over = {}) => groupRow({ roomId: 'r', roomName: 'Sam', messages, me: THEO.id, people: [THEO, SAM], pair, ...over });

  it('is there for a message that never names you, the reported one', () => {
    expect(row([said('m1', SAM.id, 0, LINK), said('m2', SAM.id, 1, ASK)], true)).toMatchObject({ id: 'room-mention:r', by: SAM.id, body: ASK });
  });

  it('is there for a link alone', () => {
    expect(row([said('m1', SAM.id, 0, LINK)], true)?.body).toBe(LINK);
  });

  it('ends when you answer, and comes back on their next message', () => {
    const answered = [said('m1', SAM.id, 0, ASK), said('m2', THEO.id, 1, 'Keep them in memory for now.')];
    expect(row(answered, true)).toBeNull();
    expect(row([...answered, said('m3', SAM.id, 2, 'Thanks!')], true)?.body).toBe('Thanks!');
  });

  it('ends at Mark done', () => {
    expect(row([said('m1', SAM.id, 0, ASK)], true, { doneAt: T + 60_000 })).toBeNull();
  });

  it('is never your own message', () => {
    expect(row([said('m1', THEO.id, 0, 'Sam, the persistence thread is yours now.')], true)).toBeNull();
  });

  it('is not made in a group by a message that does not name you', () => {
    expect(row([said('m1', SAM.id, 0, LINK), said('m2', SAM.id, 1, ASK)], false)).toBeNull();
  });
});

const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: (fn: () => void) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h: { off: boolean } | null) => { if (h) h.off = true; } };

describe('on two Macs', () => {
  let clock = T;
  type Mac = { id: string; name: string; backend: ReturnType<typeof memoryBackend>; rooms: ReturnType<typeof createRooms> };
  let theo: Mac; let sam: Mac; let lena: Mac;
  beforeEach(async () => {
    clock = T;
    const cloud = createMemoryCloud();
    cloud.now = () => clock;
    let teamState: { team: { id: string } | null; people: { id: string; name: string }[]; cards: [] } = { team: null, people: [], cards: [] };
    const mk = (name: string): Mac => {
      const id = signUpMemory(cloud, { email: `${name.split(' ')[0].toLowerCase()}@team.test`, name });
      const backend = memoryBackend(cloud, id);
      const rooms = createRooms({
        backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => teamState, enabled: () => true,
        device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }),
        prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `dm-${name.split(' ')[0]}-`))), now: () => clock, timers,
      });
      return { id, name, backend, rooms };
    };
    theo = mk('Theo Okafor');
    sam = mk('Sam Ortiz');
    lena = mk('Lena Fischer');
    const team = await theo.backend.createTeam('Agentbox Team');
    for (const m of [sam, lena]) {
      await theo.backend.invite(team.id, `${m.name.split(' ')[0].toLowerCase()}@team.test`);
      await m.backend.acceptInvite(team.id);
    }
    teamState = { team: { id: team.id }, people: [theo, sam, lena].map((m) => ({ id: m.id, name: m.name })), cards: [] };
    for (const m of [theo, sam, lena]) await m.rooms.start();
  });

  it('Sam’s message in their one-to-one chat is a row in Theo’s Needs you', async () => {
    const room = await sam.rooms.create({ name: 'Theo Okafor', kind: 'group', people: [sam.id, theo.id] });
    await theo.rooms.refresh();
    await sam.rooms.send(room, LINK);
    clock += 30_000;
    await sam.rooms.send(room, ASK);
    await flush();
    await theo.rooms.refresh();
    expect(theo.rooms.state().mentions).toHaveLength(1);
    expect(theo.rooms.state().mentions[0]).toMatchObject({ roomId: room, by: sam.id, body: ASK });
    expect(sam.rooms.state().mentions).toEqual([]);
  });

  it('the same words in a group of three are not', async () => {
    const room = await sam.rooms.create({ name: 'Payments', kind: 'group', people: [sam.id, theo.id, lena.id] });
    await theo.rooms.refresh();
    await sam.rooms.send(room, ASK);
    await flush();
    await theo.rooms.refresh();
    expect(theo.rooms.state().mentions).toEqual([]);
  });
});
