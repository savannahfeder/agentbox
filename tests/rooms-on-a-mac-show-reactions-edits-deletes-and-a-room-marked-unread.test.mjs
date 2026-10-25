// ROOMS ON A MAC SHOW REACTIONS, EDITS, DELETES AND A ROOM MARKED UNREAD (2026-10-21).
//
// The rooms service (main/team/rooms.mjs) handed the app plain messages only:
// no reactions on them, no sign one was edited or deleted, no way to mark a
// room unread from a message, and no file to play a voice note from. This
// measures the state the app reads, with Maya and Theo on Northwind and Jun on
// no team, on the in-memory cloud with a clock the test moves.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mjs';

const T0 = Date.parse('2026-10-22T15:00:00-07:00');
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: (fn) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h) => { if (h) h.off = true; } };
const TEN_MB = 10 * 1024 * 1024;

function world() {
  const cloud = createMemoryCloud();
  let clock = T0;
  cloud.now = () => clock;
  const mk = (name, email) => {
    const id = signUpMemory(cloud, { email, name });
    const real = memoryBackend(cloud, id);
    const calls = {};
    const backend = new Proxy(real, { get: (t, k) => {
      const v = t[k];
      if (typeof v !== 'function') return v;
      return (...a) => { calls[k] = (calls[k] ?? 0) + 1; return v.apply(t, a); };
    } });
    const p = { id, name, backend, calls, on: true, teamState: { team: null, people: [], cards: [] } };
    p.prefsFile = roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `rooms-more-${name.split(' ')[0]}-`)));
    p.make = () => createRooms({
      backend: () => backend,
      me: () => ({ id, name }),
      team: () => p.teamState,
      enabled: () => p.on,
      device: () => id.replace(/-/g, '').slice(0, 12).replace(/[^0-9a-f]/g, 'a'),
      presenceFacts: () => ({ running: [], items: [], products: [], summary: null }),
      prefsFile: p.prefsFile,
      now: () => clock,
      timers,
    });
    p.rooms = p.make();
    return p;
  };
  const maya = mk('Maya Costa', 'maya@northwind.test');
  const theo = mk('Theo Brandt', 'theo@northwind.test');
  const jun = mk('Jun Ota', 'jun@elsewhere.test');
  return { cloud, maya, theo, jun, tick: (ms) => { clock += ms; }, now: () => clock };
}

let w;
let room;
const msgs = (p) => p.rooms.state().messages[room];
const msg = (p, id) => msgs(p).find((m) => m.id === id);
const roomOf = (p) => p.rooms.state().rooms.find((r) => r.id === room);

beforeEach(async () => {
  w = world();
  const team = await w.maya.backend.createTeam('Northwind');
  await w.maya.backend.invite(team.id, 'theo@northwind.test');
  await w.theo.backend.acceptInvite(team.id);
  const people = [{ id: w.maya.id, name: 'Maya Costa' }, { id: w.theo.id, name: 'Theo Brandt' }];
  w.maya.teamState = { team, people, cards: [] };
  w.theo.teamState = { team, people, cards: [] };
  await w.maya.rooms.tick();
  await w.theo.rooms.tick();
  room = w.maya.rooms.state().rooms[0].id;
});

describe('reactions', () => {
  it('show on the message as emoji to people, oldest first, and a turned-off one is gone', async () => {
    const m = await w.maya.rooms.send(room, 'shipped');
    const quiet = await w.maya.rooms.send(room, 'nobody reacts to this');
    await w.theo.rooms.react(room, m.id, '👍');
    w.tick(1000);
    await w.theo.rooms.react(room, m.id, '🎉', true);
    w.tick(1000);
    await w.maya.rooms.react(room, m.id, '👍');
    await flush();
    for (const p of [w.maya, w.theo]) {
      expect(msg(p, m.id).reactions).toEqual({ '👍': [w.theo.id, w.maya.id], '🎉': [w.theo.id] });
      expect(Object.keys(msg(p, m.id).reactions)).toEqual(['👍', '🎉']);
      expect(msg(p, quiet.id).reactions).toEqual({});
    }
    await w.theo.rooms.react(room, m.id, '🎉', false);
    await flush();
    expect(msg(w.maya, m.id).reactions).toEqual({ '👍': [w.theo.id, w.maya.id] });
    expect(msg(w.theo, m.id).reactions).toEqual({ '👍': [w.theo.id, w.maya.id] });
  });

  it('an emoji spelled like an object’s insides is just another reaction', async () => {
    const m = await w.maya.rooms.send(room, 'odd one');
    await w.theo.rooms.react(room, m.id, '__proto__');
    await flush();
    expect(Object.entries(msg(w.maya, m.id).reactions)).toEqual([['__proto__', [w.theo.id]]]);
  });

  it('are read with the messages when a Mac starts', async () => {
    const m = await w.maya.rooms.send(room, 'before you came');
    await w.theo.rooms.react(room, m.id, '👀');
    const fresh = w.maya.make();
    await fresh.tick();
    expect(fresh.state().messages[room].find((x) => x.id === m.id).reactions).toEqual({ '👀': [w.theo.id] });
  });

  it('someone outside the room cannot react, and nothing changes', async () => {
    const m = await w.maya.rooms.send(room, 'team only');
    await w.jun.rooms.tick();
    await expect(w.jun.rooms.react(room, m.id, '👍')).rejects.toThrow();
    await flush();
    expect(msg(w.maya, m.id).reactions).toEqual({});
  });
});

describe('editing', () => {
  it('the author’s edit reaches the room with the time it was made', async () => {
    const m = await w.maya.rooms.send(room, 'teh launch');
    expect(msg(w.maya, m.id)).toMatchObject({ editedAt: null, deleted: false });
    w.tick(5000);
    const edited = await w.maya.rooms.edit(room, m.id, '  the launch @Theo  ', { mentions: [w.theo.id] });
    expect(edited).toMatchObject({ id: m.id, body: 'the launch @Theo', editedAt: w.now(), deleted: false, mentions: [w.theo.id] });
    await flush();
    for (const p of [w.maya, w.theo]) expect(msg(p, m.id)).toMatchObject({ body: 'the launch @Theo', editedAt: w.now(), at: m.at });
    expect(w.theo.rooms.state().mentions.map((x) => x.body)).toEqual(['the launch @Theo']);
  });

  it('a teammate’s edit is refused and the words stay', async () => {
    const m = await w.maya.rooms.send(room, 'mine');
    await flush();
    await expect(w.theo.rooms.edit(room, m.id, 'theirs')).rejects.toThrow();
    expect(msg(w.theo, m.id)).toMatchObject({ body: 'mine', editedAt: null });
  });
});

describe('deleting', () => {
  it('leaves the message in its place, empty, with no reactions and no mention of me', async () => {
    const m = await w.maya.rooms.send(room, 'oops @Theo', { mentions: [w.theo.id] });
    w.tick(1000);
    const after = await w.maya.rooms.send(room, 'next');
    await w.theo.rooms.react(room, m.id, '👍');
    await flush();
    expect(w.theo.rooms.state().mentions).toHaveLength(1);
    await w.maya.rooms.deleteMessage(room, m.id);
    await flush();
    for (const p of [w.maya, w.theo]) {
      expect(msgs(p).map((x) => x.id)).toEqual([m.id, after.id]);
      expect(msg(p, m.id)).toMatchObject({ id: m.id, by: w.maya.id, at: m.at, body: '', deleted: true, reactions: {} });
    }
    expect(w.theo.rooms.state().mentions).toEqual([]);
    expect(roomOf(w.theo).unread).toBe(1);
  });

  it('a teammate cannot delete my message', async () => {
    const m = await w.maya.rooms.send(room, 'stays');
    await flush();
    await expect(w.theo.rooms.deleteMessage(room, m.id)).rejects.toThrow();
    expect(msg(w.maya, m.id)).toMatchObject({ body: 'stays', deleted: false });
  });
});

describe('marking a room unread', () => {
  let first;
  let second;
  let mine;
  beforeEach(async () => {
    first = await w.maya.rooms.send(room, 'one');
    w.tick(1000);
    second = await w.maya.rooms.send(room, 'two');
    w.tick(1000);
    const third = await w.maya.rooms.send(room, 'three');
    w.tick(1000);
    mine = await w.theo.rooms.send(room, 'mine, last');
    await flush();
    await w.theo.rooms.markRead(room);
    expect(roomOf(w.theo)).toMatchObject({ unread: 0, readAt: mine.at, markedUnread: false });
    expect(third.at).toBeLessThan(mine.at);
  });

  it('from a message: the read point is just before it, and everything by others from it counts', async () => {
    await w.theo.rooms.markUnread(room, second.at);
    expect(roomOf(w.theo)).toMatchObject({ readAt: second.at - 1, markedUnread: true, unread: 2 });
    await w.theo.rooms.refresh();
    expect(roomOf(w.theo)).toMatchObject({ readAt: second.at - 1, markedUnread: true, unread: 2 });
    expect(roomOf(w.maya)).toMatchObject({ markedUnread: false, unread: 1 });
  });

  it('from my own last message, the room still reads as unread', async () => {
    await w.theo.rooms.markUnread(room, mine.at);
    expect(roomOf(w.theo)).toMatchObject({ readAt: mine.at - 1, markedUnread: true, unread: 1 });
  });

  it('is kept on this Mac across a restart, and is mine alone', async () => {
    await w.theo.rooms.markUnread(room, first.at);
    const again = w.theo.make();
    await again.tick();
    expect(again.state().rooms.find((r) => r.id === room)).toMatchObject({ markedUnread: true, unread: 3 });
    expect(JSON.parse(fs.readFileSync(w.theo.prefsFile, 'utf8'))[w.theo.id]).toBeTruthy();
  });

  it('reading it clears the mark, even when the read point is already at the newest message', async () => {
    await w.theo.rooms.markUnread(room, mine.at);
    await w.theo.backend.markRoomRead(room, mine.at);
    await w.theo.rooms.refresh();
    expect(roomOf(w.theo)).toMatchObject({ readAt: mine.at, markedUnread: true, unread: 1 });
    await w.theo.rooms.markRead(room);
    expect(roomOf(w.theo)).toMatchObject({ readAt: mine.at, markedUnread: false, unread: 0 });
  });

  it('reading it after marking it unread moves the read point back up to the newest', async () => {
    await w.theo.rooms.markUnread(room, first.at);
    await w.theo.rooms.markRead(room);
    expect(roomOf(w.theo)).toMatchObject({ readAt: mine.at, markedUnread: false, unread: 0 });
    await w.theo.rooms.refresh();
    expect(roomOf(w.theo)).toMatchObject({ readAt: mine.at, unread: 0 });
  });

  it('a room never read has a read point of 0', async () => {
    await w.jun.rooms.tick();
    expect(w.jun.rooms.state().rooms[0]).toMatchObject({ readAt: 0, markedUnread: false });
  });
});

describe('files', () => {
  it('a file goes up under its name and comes back to a teammate, fetched once', async () => {
    expect(await w.maya.rooms.putFile(room, { name: 'voice-1.webm', dataBase64: 'QUJD' })).toBe('voice-1.webm');
    expect(await w.theo.rooms.file(room, 'voice-1.webm')).toBe('QUJD');
    expect(await w.theo.rooms.file(room, 'voice-1.webm')).toBe('QUJD');
    expect(w.theo.calls.roomFile).toBe(1);
    expect(await w.theo.rooms.file(room, 'missing.webm')).toBeNull();
  });

  it('a name already there is taken as sent', async () => {
    await w.maya.rooms.putFile(room, { name: 'same.png', dataBase64: 'QUJD' });
    expect(await w.maya.rooms.putFile(room, { name: 'same.png', dataBase64: 'QUJD' })).toBe('same.png');
  });

  it('ten megabytes goes; a byte more is refused in plain words before it leaves the Mac', async () => {
    const exactly = Buffer.alloc(TEN_MB).toString('base64');
    expect(await w.maya.rooms.putFile(room, { name: 'big.bin', dataBase64: exactly })).toBe('big.bin');
    const over = Buffer.alloc(TEN_MB + 1).toString('base64');
    const before = w.maya.calls.putRoomFile;
    await expect(w.maya.rooms.putFile(room, { name: 'bigger.bin', dataBase64: over })).rejects.toThrow(/10 MB/);
    expect(w.maya.calls.putRoomFile).toBe(before);
  });

  it('a name with a path or a leading dot is refused', async () => {
    for (const name of ['../x.png', '.hidden', 'a/b.png', '']) {
      await expect(w.maya.rooms.putFile(room, { name, dataBase64: 'QUJD' }), name).rejects.toThrow(/name/);
    }
  });

  it('someone outside the room can neither add nor read one', async () => {
    await w.maya.rooms.putFile(room, { name: 'team.png', dataBase64: 'QUJD' });
    await w.jun.rooms.tick();
    await expect(w.jun.rooms.putFile(room, { name: 'in.png', dataBase64: 'QUJD' })).rejects.toThrow();
    expect(await w.jun.rooms.file(room, 'team.png')).toBeNull();
  });

  it('holds the last forty fetched, and fetches an older one again', async () => {
    for (let i = 0; i < 41; i += 1) {
      if (i % 25 === 24) w.tick(10 * 60_000);
      await w.maya.backend.putRoomFile(room, `f${i}.png`, 'QUJD');
    }
    for (let i = 0; i < 41; i += 1) await w.theo.rooms.file(room, `f${i}.png`);
    expect(w.theo.calls.roomFile).toBe(41);
    await w.theo.rooms.file(room, 'f40.png');
    expect(w.theo.calls.roomFile).toBe(41);
    await w.theo.rooms.file(room, 'f0.png');
    expect(w.theo.calls.roomFile).toBe(42);
  });
});
