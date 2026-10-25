// ROOMS ON A MAC FOLLOW THE CLOUD, AND ONLY WHILE SWITCHED ON (w-3d0fa23ffb, 2026-10-20).
//
// main/team/rooms.mjs keeps the rooms I am in, their walls and chat, and the
// presence row this Mac publishes. Rooms is an alpha feature: until it is
// switched on, this Mac must publish nothing at all, and switching it off
// must tell everyone this Mac has gone.
//
// Measured with three people on the in-memory cloud (Maya and Theo on
// Northwind, Jun on no team), each with their own throwaway prefs file, and
// a clock the test moves.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mjs';
import { GENERAL_ROOM } from '../main/team/rooms-memory.mjs';

const T0 = Date.parse('2026-10-22T15:00:00-07:00');
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: (fn) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h) => { if (h) h.off = true; } };

function world() {
  const cloud = createMemoryCloud();
  let clock = T0;
  cloud.now = () => clock;
  const mk = (name, email) => {
    const id = signUpMemory(cloud, { email, name });
    const real = memoryBackend(cloud, id);
    // `broken` stands for a cloud whose rooms tables are not there yet.
    const backend = new Proxy(real, { get: (t, k) => {
      const v = t[k];
      if (typeof v !== 'function') return v;
      return (...a) => (p.broken && /Room|Presence/.test(String(k)) ? Promise.reject(new Error('relation "public.room_profiles" does not exist')) : v.apply(t, a));
    } });
    const p = {
      id, name, backend, on: false, signedIn: true, running: [], items: [], teamState: { team: null, people: [], cards: [] }, changes: 0,
      summary: { total: 0, week: 0, weekStart: '2026-10-19', today: 0, day: '2026-10-22', streak: 0, activeDays: [], byMonth: [] },
    };
    p.rooms = createRooms({
      backend: () => (p.signedIn ? backend : null),
      me: () => (p.signedIn ? { id, name: p.nameKnown === false ? '' : name, avatarUrl: p.avatarUrl ?? null, status: p.status ?? null } : null),
      team: () => p.teamState,
      enabled: () => p.on,
      device: () => id.replace(/-/g, '').slice(0, 12).replace(/[^0-9a-f]/g, 'a'),
      presenceFacts: () => ({ running: p.running, items: p.items, products: [{ slug: 'nw', name: 'Northwind', team: { projectId: 'x' } }], summary: p.summary }),
      prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `rooms-${name.split(' ')[0]}-`))),
      now: () => clock,
      onChange: () => { p.changes += 1; },
      timers,
    });
    return p;
  };
  const maya = mk('Maya Costa', 'maya@northwind.test');
  const theo = mk('Theo Brandt', 'theo@northwind.test');
  const jun = mk('Jun Ota', 'jun@elsewhere.test');
  return { cloud, maya, theo, jun, tick: (ms) => { clock += ms; } };
}

async function northwind(w) {
  const team = await w.maya.backend.createTeam('Northwind');
  await w.maya.backend.invite(team.id, 'theo@northwind.test');
  await w.theo.backend.acceptInvite(team.id);
  const people = [{ id: w.maya.id, name: 'Maya Costa' }, { id: w.theo.id, name: 'Theo Brandt' }];
  w.maya.teamState = { team, people, cards: [] };
  w.theo.teamState = { team, people, cards: [] };
  return team;
}

describe('switched off', () => {
  it('publishes nothing and makes no profile', async () => {
    const w = world();
    await northwind(w);
    await w.maya.rooms.tick();
    expect(w.maya.rooms.state()).toMatchObject({ on: false, rooms: [] });
    expect(w.cloud.roomProfiles?.size ?? 0).toBe(0);
    expect(w.cloud.roomPresence?.size ?? 0).toBe(0);
  });
});

describe('switched on', () => {
  let w;
  beforeEach(async () => {
    w = world();
    await northwind(w);
    w.maya.on = true;
    w.theo.on = true;
    w.maya.running = [{ itemId: 'w-a', product: 'nw', startedAt: T0 - 60_000 }, { itemId: 'w-b', product: 'nw', startedAt: T0 - 120_000 }];
    w.maya.items = [{ id: 'w-a', product: 'nw', label: 'Cloud launch video', title: 'x' }];
    await w.maya.rooms.tick();
    await w.theo.rooms.tick();
  });

  it('makes my card as First L., puts me in my team’s room and pins it', async () => {
    const s = w.maya.rooms.state();
    // Thread names reach people outside the team only once she turns that on (w-64116bb761).
    expect(s.me).toMatchObject({ display_name: 'Maya C.', show_working: 'team' });
    expect(s.rooms).toHaveLength(1);
    expect(s.rooms[0]).toMatchObject({ name: 'Northwind', pinned: true, muted: false, unread: 0 });
  });

  it('a teammate’s wall shows my agents and, from my team card, what I am on', async () => {
    w.theo.teamState = { ...w.theo.teamState, cards: [{ personId: w.maya.id, threadId: 'w-a', title: 'Cloud launch video', state: 'running', visible: true, updatedAt: T0 }] };
    await w.theo.rooms.refresh();
    const maya = w.theo.rooms.state().rooms[0].wall.find((c) => c.id === w.maya.id);
    expect(maya).toMatchObject({ name: 'Maya C.', agents: 2, workingOn: 'Cloud launch video' });
    expect(w.theo.rooms.state().rooms[0].agents).toBe(2);
  });

  it('someone with no team starts in General, pinned', async () => {
    w.jun.on = true;
    await w.jun.rooms.tick();
    expect(w.jun.rooms.state().rooms.map((r) => [r.id, r.pinned])).toEqual([[GENERAL_ROOM, true]]);
  });

  it('a message reaches the room at once, counts as unread, and a mention of me is a row of its own', async () => {
    const room = w.maya.rooms.state().rooms[0].id;
    await w.maya.rooms.send(room, 'hi @Theo', { mentions: [w.theo.id] });
    await flush();
    const s = w.theo.rooms.state();
    expect(s.messages[room].map((m) => m.body)).toEqual(['hi @Theo']);
    expect(s.rooms[0].unread).toBe(1);
    expect(s.mentions).toEqual([expect.objectContaining({ id: expect.stringMatching(/^room-mention:/), roomId: room, roomName: 'Northwind', byName: 'Maya C.', body: 'hi @Theo' })]);
    expect(w.maya.rooms.state().rooms[0].unread).toBe(0);
    await w.theo.rooms.markRead(room);
    expect(w.theo.rooms.state().rooms[0].unread).toBe(0);
    expect(w.theo.rooms.state().mentions).toEqual([]);
    await w.theo.rooms.refresh();
    expect(w.theo.rooms.state().rooms[0].unread).toBe(0);
  });

  // Codex's review of the build: mentions were read only from the newest 200
  // messages held, so a busy room buried an older one out of Needs you.
  it('a mention stays in Needs you under two hundred newer messages, until read', async () => {
    const room = w.maya.rooms.state().rooms[0].id;
    await w.maya.rooms.send(room, '@Theo B. can you look at this?', { mentions: [w.theo.id] });
    for (let i = 0; i < 210; i += 1) {
      if (i % 20 === 0) w.tick(61_000);
      await w.maya.backend.sendRoomMessage(room, { body: `note ${i}` });
    }
    await w.theo.rooms.refresh();
    expect(w.theo.rooms.state().mentions.map((m) => m.body)).toEqual(['@Theo B. can you look at this?']);
    await w.theo.rooms.markRead(room);
    await w.theo.rooms.refresh();
    expect(w.theo.rooms.state().mentions).toEqual([]);
  });

  it('presence goes up only when it changes, and again after five quiet minutes', async () => {
    expect(await w.maya.rooms.publish()).toBe(false);
    w.tick(4 * 60_000);
    expect(await w.maya.rooms.publish()).toBe(false);
    w.tick(60_000);
    expect(await w.maya.rooms.publish()).toBe(true);
    w.maya.running = [];
    expect(await w.maya.rooms.publish()).toBe(true);
  });

  it('switched off: this Mac says it has gone, and teammates stop counting its agents', async () => {
    w.maya.on = false;
    await w.maya.rooms.tick();
    expect(w.maya.rooms.state()).toMatchObject({ on: false, rooms: [] });
    await w.theo.rooms.refresh();
    expect(w.theo.rooms.state().rooms[0].wall.find((c) => c.id === w.maya.id)).toMatchObject({ agents: 0 });
  });

  it('signed out: the same', async () => {
    w.maya.signedIn = false;
    await w.maya.rooms.tick();
    expect(w.maya.rooms.state().rooms).toEqual([]);
    const rows = [...w.cloud.roomPresence.values()].filter((r) => r.person_id === w.maya.id);
    expect(rows.every((r) => r.gone)).toBe(true);
  });

  it('going invisible takes me off a teammate’s wall, and coming back puts me on it', async () => {
    await w.maya.rooms.goInvisible(30);
    await flush();
    expect(w.theo.rooms.state().rooms[0].wall.map((c) => c.id)).toEqual([w.theo.id]);
    expect(w.maya.rooms.state().me.invisible_until).toBe(new Date(T0 + 30 * 60_000).toISOString());
    expect(w.maya.rooms.state().rooms[0].wall.map((c) => c.id)).not.toContain(w.maya.id);
    await w.maya.rooms.comeBack();
    await flush();
    expect(w.theo.rooms.state().rooms[0].wall.map((c) => c.id).sort()).toEqual([w.maya.id, w.theo.id].sort());
  });

  it('the full-name choice rewrites my name, and "what I am on: everyone" names my thread to everyone', async () => {
    await w.maya.rooms.saveProfile({ fullName: true, show_working: 'everyone' });
    expect(w.maya.rooms.state().me.display_name).toBe('Maya Costa');
    const row = [...w.cloud.roomPresence.values()].find((r) => r.person_id === w.maya.id);
    expect(row.working_on).toBe('Cloud launch video');
    await w.maya.rooms.saveProfile({ show_working: 'team' });
    expect([...w.cloud.roomPresence.values()].find((r) => r.person_id === w.maya.id).working_on).toBeNull();
  });

  it('the status I set for my team shows on my room card, and clears with it', async () => {
    w.maya.status = { text: 'Heads down today', until: T0 + 3_600_000 };
    await w.maya.rooms.tick();
    expect(w.cloud.roomProfiles.get(w.maya.id)).toMatchObject({ status_text: 'Heads down today', status_until: new Date(T0 + 3_600_000).toISOString() });
    w.maya.status = null;
    await w.maya.rooms.tick();
    expect(w.cloud.roomProfiles.get(w.maya.id)).toMatchObject({ status_text: null, status_until: null });
  });

  // Codex's review of the build, 2026-10-20: a switch turned off only hid
  // the value on screen, while the cloud still held it for anyone to query.
  it('a switch turned off keeps that value off the cloud, not just off the screen', async () => {
    w.maya.summary = { ...w.maya.summary, total: 1240, week: 20, today: 3, streak: 5, activeDays: ['2026-10-22'], byMonth: [{ month: '2026-10', hours: 20 }] };
    w.maya.status = { text: 'Heads down', until: null };
    await w.maya.rooms.tick();
    const row = () => [...w.cloud.roomPresence.values()].find((r) => r.person_id === w.maya.id);
    expect(row()).toMatchObject({ agents_running: 2, hours_total: 1240 });
    await w.maya.rooms.saveProfile({ show_agents: false, show_level: false, show_status: false });
    await w.maya.rooms.tick();
    expect(row()).toMatchObject({ agents_running: 0, hours_total: 0, hours_week: 0, hours_today: 0, streak_days: 0, active_days: [], hours_by_month: [] });
    expect(w.cloud.roomProfiles.get(w.maya.id)).toMatchObject({ status_text: null });
    await w.maya.rooms.saveProfile({ show_agents: true, show_level: true, show_status: true });
    await w.maya.rooms.tick();
    expect(row()).toMatchObject({ agents_running: 2, hours_total: 1240 });
    expect(w.cloud.roomProfiles.get(w.maya.id)).toMatchObject({ status_text: 'Heads down' });
  });

  it('pins and mutes are mine, kept, and leaving a room drops them', async () => {
    const room = await w.maya.rooms.create({ name: 'Launch' });
    expect(w.maya.rooms.state().rooms.find((r) => r.id === room)).toMatchObject({ pinned: true });
    w.maya.rooms.pin(room, false);
    w.maya.rooms.mute(room, true);
    expect(w.maya.rooms.state().rooms.find((r) => r.id === room)).toMatchObject({ pinned: false, muted: true });
    w.maya.rooms.pin(room, true);
    await w.maya.rooms.leave(room);
    expect(w.maya.rooms.state().rooms.map((r) => r.id)).not.toContain(room);
  });

  it('joining by a link brings the room in, and someone new on the wall', async () => {
    w.jun.on = true;
    await w.jun.rooms.tick();
    const room = w.maya.rooms.state().rooms[0].id;
    const token = await w.maya.rooms.link(room);
    await w.jun.rooms.joinByLink(token);
    await flush();
    expect(w.jun.rooms.state().rooms.map((r) => r.id)).toContain(room);
    expect(w.maya.rooms.state().rooms[0].wall.map((c) => c.name)).toEqual(['Jun O.', 'Maya C.', 'Theo B.']);
  });
});

// The founder, 2026-10-21, on the first real cloud: her messages read
// "Someone", her own card was missing and Settings had no Rooms page. Rooms
// was switched on before the cloud had its rooms tables; the one try at
// making her profile failed, and nothing tried again.
describe('a first start that fails', () => {
  it('is tried again on the next pass: my card, my name and live messages come back', async () => {
    const w = world();
    await northwind(w);
    w.maya.on = true;
    w.theo.on = true;
    w.maya.broken = true;
    await w.maya.rooms.tick();
    expect(w.maya.rooms.state().me).toBeNull();
    w.maya.broken = false;
    await w.maya.rooms.tick();
    await w.theo.rooms.tick();
    expect(w.maya.rooms.state().me).toMatchObject({ display_name: 'Maya C.' });
    const room = w.maya.rooms.state().rooms[0];
    expect(room.wall.map((c) => c.name)).toEqual(['Maya C.', 'Theo B.']);
    await w.theo.rooms.send(room.id, 'are you there');
    await flush();
    expect(w.maya.rooms.state().messages[room.id].map((m) => m.body)).toEqual(['are you there']);
  });

  it('a face the cloud cannot keep is left off rather than losing the whole card', async () => {
    const w = world();
    await northwind(w);
    w.maya.on = true;
    w.maya.avatarUrl = `data:image/png;base64,${'A'.repeat(2000)}`;
    await w.maya.rooms.tick();
    expect(w.maya.rooms.state().me).toMatchObject({ display_name: 'Maya C.', avatar_url: null });
    w.theo.on = true;
    w.theo.avatarUrl = 'https://lh3.example.com/a/theo=s96-c';
    await w.theo.rooms.tick();
    expect(w.theo.rooms.state().me).toMatchObject({ avatar_url: 'https://lh3.example.com/a/theo=s96-c' });
  });
});

describe('a card made before my name was known', () => {
  it('takes my name once it is known, and leaves a name I chose alone', async () => {
    const w = world();
    await northwind(w);
    w.maya.on = true;
    w.maya.nameKnown = false;
    await w.maya.rooms.tick();
    expect(w.maya.rooms.state().me.display_name).toBe('Someone');
    w.maya.nameKnown = true;
    await w.maya.rooms.tick();
    expect(w.maya.rooms.state().me.display_name).toBe('Maya C.');
    await w.maya.rooms.saveProfile({ fullName: true });
    await w.maya.rooms.tick();
    expect(w.maya.rooms.state().me.display_name).toBe('Maya Costa');
  });
});
