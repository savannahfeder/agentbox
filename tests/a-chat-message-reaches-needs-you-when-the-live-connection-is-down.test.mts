// A CHAT MESSAGE REACHES NEEDS YOU WHEN THE LIVE CONNECTION IS DOWN (w-f702d60afe, 2026-11-21).
//
// The founder's teammate sent her three messages in their one-to-one chat over
// a night and a morning, and none of them reached her Needs you; she found them
// only by opening his page. Read from the team cloud: a plain two-person chat,
// three messages from him before her reply, and her read marker set to his
// last message's time, written when she opened his page. The rule that makes
// the row was right (tests/a-direct-message-from-a-teammate-reaches-needs-you);
// her Mac never held the messages. The rooms engine learned of new messages
// only through the live connection, and the team's sync pass, every 5 seconds,
// never read them again: a connection that drops without a word (a Mac that
// slept) left Needs you deaf until something opened the chat, which asks the
// cloud directly. Each pass now reads the chats again once a minute.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile, ROOMS_RECHECK_MS } from '../main/team/rooms.mts';

const T = Date.UTC(2026, 10, 21, 5, 57);
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: (fn: () => void) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h: { off: boolean } | null) => { if (h) h.off = true; } };

describe('a teammate writes while your Mac hears nothing live', () => {
  let clock = T;
  type Mac = { id: string; name: string; backend: ReturnType<typeof memoryBackend>; rooms: ReturnType<typeof createRooms> };
  let tony: Mac; let sav: Mac;
  beforeEach(async () => {
    clock = T;
    const cloud = createMemoryCloud();
    cloud.now = () => clock;
    let teamState: { team: { id: string } | null; people: { id: string; name: string }[]; cards: [] } = { team: null, people: [], cards: [] };
    const mk = (name: string, deaf = false): Mac => {
      const id = signUpMemory(cloud, { email: `${name.split(' ')[0].toLowerCase()}@team.test`, name });
      const real = memoryBackend(cloud, id);
      // A socket that dropped without a word: subscribing works, nothing is ever heard.
      const backend = deaf ? { ...real, subscribeRooms: () => () => {} } : real;
      const rooms = createRooms({
        backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => teamState, enabled: () => true,
        device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }),
        prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `deaf-${name.split(' ')[0]}-`))), now: () => clock, timers,
      });
      return { id, name, backend: real, rooms };
    };
    sav = mk('Sav Founder', true);
    tony = mk('Tony Stark');
    const team = await sav.backend.createTeam('Agentbox Team');
    await sav.backend.invite(team.id, 'tony@team.test');
    await tony.backend.acceptInvite(team.id);
    teamState = { team: { id: team.id }, people: [sav, tony].map((m) => ({ id: m.id, name: m.name })), cards: [] };
    for (const m of [sav, tony]) await m.rooms.start();
  });

  it('reaches Needs you on a sync pass within a minute, the reported case', async () => {
    // He starts the chat with his first message, after her Mac last read the cloud.
    const room = await tony.rooms.create({ name: 'Sav Founder', kind: 'group', people: [tony.id, sav.id] });
    await tony.rooms.send(room, 'Disk keeper is waiting for your approval before deleting larger files.');
    await flush();
    await sav.rooms.tick();
    expect(sav.rooms.state().mentions).toEqual([]);
    clock += ROOMS_RECHECK_MS;
    await sav.rooms.tick();
    expect(sav.rooms.state().mentions).toHaveLength(1);
    expect(sav.rooms.state().mentions[0]).toMatchObject({ roomId: room, by: tony.id });
  });

  it('is read again at most once a minute, not on every five-second pass', async () => {
    const seen: number[] = [];
    const myRooms = sav.rooms;
    clock += ROOMS_RECHECK_MS;
    await myRooms.tick();
    const before = JSON.stringify(myRooms.state().rooms);
    await tony.rooms.create({ name: 'Sav Founder', kind: 'group', people: [tony.id, sav.id] });
    clock += 5_000;
    await myRooms.tick();
    seen.push(myRooms.state().rooms.length);
    expect(JSON.stringify(myRooms.state().rooms)).toBe(before);
    clock += ROOMS_RECHECK_MS;
    await myRooms.tick();
    expect(myRooms.state().rooms.length).toBeGreaterThan(seen[0]);
  });

  it('is once a minute', () => {
    expect(ROOMS_RECHECK_MS).toBe(60_000);
  });
});
