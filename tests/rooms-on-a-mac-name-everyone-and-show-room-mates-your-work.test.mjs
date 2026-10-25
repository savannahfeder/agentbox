// ROOMS ON A MAC NAME EVERYONE AND SHOW ROOM-MATES YOUR WORK (w-3d0fa23ffb, 2026-10-22).
//
// What an hour with a test account in the founder's room turned up, end to end
// through main/team/rooms.mjs: the founder could not see what a room-mate from
// outside the team was working on; while she was invisible every message she
// had sent read "Someone"; and the room said five people while the wall showed
// two, because teammates who had not turned Rooms on had no card.
//
// Three people on the in-memory cloud: Maya and Theo on Northwind, Jun on no
// team and invited into Northwind's room. Theo never turns Rooms on. Since
// 2026-10-24 (w-64116bb761) Jun's work reaches Maya only once he turns it on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mjs';

const T0 = Date.parse('2026-10-22T15:00:00-07:00');
const timers = { setTimeout: (fn) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h) => { if (h) h.off = true; } };

function world({ oldCloud = false } = {}) {
  const cloud = createMemoryCloud();
  let clock = T0;
  cloud.now = () => clock;
  const mk = (name, email) => {
    const id = signUpMemory(cloud, { email, name });
    const real = memoryBackend(cloud, id);
    // A cloud without room_names answers as if the call were not there.
    const backend = oldCloud ? new Proxy(real, { get: (t, k) => (k === 'roomNames' ? undefined : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }) : real;
    const p = { id, name, backend, on: false, running: [], items: [], cards: [], teamState: { team: null, people: [], cards: [] } };
    p.rooms = createRooms({
      backend: () => backend,
      me: () => ({ id, name, avatarUrl: null }),
      team: () => p.teamState,
      enabled: () => p.on,
      device: () => id.replace(/-/g, '').slice(0, 12).replace(/[^0-9a-f]/g, 'a'),
      presenceFacts: () => ({ running: p.running, items: p.items, products: [{ slug: 'web', name: 'Web' }], cards: p.cards, summary: { total: 1, week: 1, weekStart: '2026-10-19', today: 1, day: '2026-10-22', streak: 1, activeDays: [], byMonth: [] } }),
      prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `rooms-${name.split(' ')[0]}-`))),
      now: () => clock,
      timers,
    });
    return p;
  };
  const maya = mk('Maya Costa', 'maya@northwind.test');
  const theo = mk('Theo Brandt', 'theo@northwind.test');
  const jun = mk('Jun Ota', 'jun@elsewhere.test');
  return { maya, theo, jun };
}

async function together(w, { shows = true } = {}) {
  const team = await w.maya.backend.createTeam('Northwind');
  await w.maya.backend.invite(team.id, 'theo@northwind.test');
  await w.theo.backend.acceptInvite(team.id);
  const people = [{ id: w.maya.id, name: 'Maya Costa' }, { id: w.theo.id, name: 'Theo Brandt' }];
  w.maya.teamState = { team, people, cards: [] };
  w.theo.teamState = { team, people, cards: [] };
  const room = (await w.maya.backend.myRooms()).find((r) => r.teamId === team.id);
  await w.maya.backend.inviteToRoom(room.id, 'jun@elsewhere.test');
  await w.jun.backend.acceptRoomInvite(room.id);
  w.jun.items = [{ id: 'w-1', product: 'web', title: 'Make the checkout faster' }];
  w.jun.running = [{ itemId: 'w-1', product: 'web', startedAt: T0 - 60_000 }];
  w.jun.cards = [
    { threadId: 'w-1', title: 'Make the checkout faster', project: 'Web', state: 'running', people: null, updatedAt: T0 - 60_000 },
    { threadId: 'w-2', title: 'Pick a font for the receipts', project: 'Web', state: 'waiting', people: null, updatedAt: T0 - 120_000 },
  ];
  for (const p of [w.maya, w.jun]) { p.on = true; await p.rooms.tick(); }
  if (shows) await w.jun.rooms.saveProfile({ show_working: 'everyone' });
  await w.maya.rooms.refresh();
  const mine = () => w.maya.rooms.state().rooms.find((r) => r.id === room.id);
  return { room, mine };
}

describe('everyone in the room', () => {
  it('a teammate who has not turned Rooms on is on the wall, named, as away', async () => {
    const w = world();
    const { mine } = await together(w);
    expect(mine().wall.find((c) => c.id === w.theo.id)).toMatchObject({ name: 'Theo B.', away: true, agents: null });
    expect(mine().wall).toHaveLength(3);
  });

  it('a room-mate who goes invisible leaves the wall and keeps her name in the chat', async () => {
    const w = world();
    const { room, mine } = await together(w);
    await w.jun.rooms.send(room.id, 'hello from Jun');
    await w.jun.rooms.goInvisible(60);
    await w.maya.rooms.refresh();
    expect(mine().wall.some((c) => c.id === w.jun.id)).toBe(false);
    expect(mine().people).toContainEqual({ id: w.jun.id, name: 'Jun O.', avatarUrl: null });
  });
});

describe("a room-mate's work", () => {
  it('until Jun turns it on, Maya sees his agents and no thread name or activity', async () => {
    const w = world();
    const { mine } = await together(w, { shows: false });
    expect(mine().wall.find((c) => c.id === w.jun.id)).toMatchObject({ agents: 1, workingOn: null, workingPrivate: true, activity: null });
  });

  // His list of threads reaches nobody since 2026-10-25 (tests/a-persons-page-shows-none-of-their-threads).
  it("Jun, on no team, shows Maya what he is working on and none of his other threads", async () => {
    const w = world();
    const { mine } = await together(w);
    const jun = mine().wall.find((c) => c.id === w.jun.id);
    expect(jun.workingOn).toBe('Make the checkout faster');
    expect(jun.activity).toBeNull();
  });

  it('turning off his activity takes it off his card for Maya', async () => {
    const w = world();
    const { mine } = await together(w);
    await w.jun.rooms.saveProfile({ show_activity: false });
    await w.jun.rooms.tick();
    await w.maya.rooms.refresh();
    expect(mine().wall.find((c) => c.id === w.jun.id).activity).toBeNull();
  });
});

describe('coming back', () => {
  // The tester pressed Come back and for one to three seconds the wall had no
  // card at all: the notice had gone and her card waited for the next read.
  it('puts my card straight back on my own wall, before anything is read again', async () => {
    const w = world();
    const { room } = await together(w);
    await w.jun.rooms.goInvisible(60);
    const mine = () => w.jun.rooms.state().rooms.find((r) => r.id === room.id);
    expect(mine().wall.some((c) => c.id === w.jun.id)).toBe(false);
    await w.jun.rooms.comeBack();
    expect(mine().wall.some((c) => c.id === w.jun.id)).toBe(true);
  });

  it('my Mac puts no list of threads on the cloud, with my activity on or off', async () => {
    const w = world();
    await together(w);
    const rows = async () => (await w.maya.backend.roomPresence([w.jun.id])).map((r) => r.activity.length);
    expect(await rows()).toEqual([0]);
    await w.jun.rooms.saveProfile({ show_activity: false });
    expect(await rows()).toEqual([0]);
  });
});

describe('on a cloud without the names call', () => {
  it('the wall is the cards and the chat names from them, as before', async () => {
    const w = world({ oldCloud: true });
    const { mine } = await together(w);
    expect(mine().people).toBeNull();
    expect(mine().wall.map((c) => c.id).sort()).toEqual([w.maya.id, w.jun.id].sort());
  });
});
