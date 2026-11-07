// A COMMENT ON A GROUP'S FILE REACHES NEEDS YOU, FOR THE PERSON IT CONCERNS.
//
// In a conversation a comment on your file waits in Needs you (fileNewsFor). In a
// group it never did: Dev pinned Maya's picture and Maya heard nothing unless she
// happened to open the file. Measured through the real rooms over the in-memory
// cloud: after markFile, rooms.state().mentions on Maya's Mac stayed empty,
// because groupRow only reads messages.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';
import { groupFileRow } from '../shared/room-needs-you.mts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const timers = { setTimeout: (fn) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h) => { if (h) h.off = true; } };

describe('the row', () => {
  const FILE = 'slots.png';
  const note = (over = {}) => ({ id: 'm1', by: 'dev', at: 10, mark: { do: 'note', id: 'n1', file: FILE, place: { kind: 'whole' }, text: 'Add slot is hidden', owner: 'maya', ...over } });
  const row = (marks, over = {}) => groupFileRow({ roomId: 'r', roomName: 'Design', marks, me: 'maya', nameOf: (id) => id, ...over });

  it('reaches the person whose file it is, saying who, which file and what', () => {
    expect(row([note()])).toMatchObject({
      id: 'room-mention:r', roomId: 'r', roomName: 'Design', by: 'dev', byName: 'dev', at: 10, note: 'n1',
      body: 'commented on slots.png: Add slot is hidden', unread: true,
    });
  });
  it('reaches someone it names, though the file is not theirs', () => {
    expect(row([note({ owner: 'sofia', mentions: ['maya'] })])?.body).toBe('named you on slots.png: Add slot is hidden');
  });
  it('does not reach someone else in the group', () => {
    expect(row([note({ owner: 'sofia' })])).toBeNull();
  });
  it('does not reach the person who said it', () => {
    expect(row([note()], { me: 'dev' })).toBeNull();
  });
  it('a reply reaches who spoke on that comment, and opens on the comment', () => {
    const marks = [
      { id: 'm1', by: 'maya', at: 5, mark: { do: 'note', id: 'n1', file: FILE, place: { kind: 'whole' }, text: 'Too dark', owner: 'sofia' } },
      { id: 'm2', by: 'dev', at: 10, mark: { do: 'reply', id: 'r1', on: 'n1', file: FILE, text: 'Agreed' } },
    ];
    expect(row(marks)).toMatchObject({ body: 'replied on slots.png: Agreed', note: 'n1', at: 10 });
  });
  it('an approval of your file reaches you', () => {
    expect(row([{ id: 'm1', by: 'dev', at: 10, mark: { do: 'approve', file: FILE, owner: 'maya' } }])).toMatchObject({ body: 'approved slots.png', file: FILE });
  });
  it('ends once it has been seen', () => {
    expect(row([note(), { id: 'm2', by: 'maya', at: 11, mark: { do: 'seen', on: ['n1'] } }])).toBeNull();
  });
  it('ends with Mark done, and only for what came before', () => {
    expect(row([note()], { doneAt: 10 })).toBeNull();
    expect(row([note()], { doneAt: 9 })).not.toBeNull();
  });
  it('a resolved comment waits on nobody', () => {
    expect(row([note(), { id: 'm2', by: 'dev', at: 11, mark: { do: 'resolve', on: 'n1' } }])).toBeNull();
  });
  it('no marks, no row', () => {
    expect(row([])).toBeNull();
  });
});

describe('over the rooms', () => {
  let maya, dev, sofia, room;
  beforeEach(async () => {
    const cloud = createMemoryCloud();
    const mk = (name, email) => {
      const id = signUpMemory(cloud, { email, name });
      const backend = memoryBackend(cloud, id);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `group-file-${name}-`));
      const p = { id, name, backend, teamState: { team: null, people: [], cards: [] } };
      p.rooms = createRooms({
        backend: () => backend, me: () => ({ id, name }), team: () => p.teamState, enabled: () => true, device: () => 'abcdefabcdef',
        presenceFacts: () => ({ running: [], items: [], products: [], summary: null }), prefsFile: roomPrefsFile(dir), filesDir: path.join(dir, 'f'), timers,
      });
      return p;
    };
    maya = mk('Maya', 'maya@lumen.test'); dev = mk('Dev', 'dev@lumen.test'); sofia = mk('Sofia', 'sofia@lumen.test');
    const team = await maya.backend.createTeam('Lumen');
    for (const p of [dev, sofia]) { await maya.backend.invite(team.id, `${p.name.toLowerCase()}@lumen.test`); await p.backend.acceptInvite(team.id); }
    const people = [maya, dev, sofia].map((p) => ({ id: p.id, name: p.name }));
    for (const p of [maya, dev, sofia]) { p.teamState = { team, people, cards: [] }; await p.rooms.tick(); }
    room = maya.rooms.state().rooms[0].id;
  });
  const comment = () => dev.rooms.markFile(room, { do: 'note', id: 'n1', file: 'slots.png', place: { kind: 'pin', x: 0.4, y: 0.2 }, text: 'Add slot is hidden', owner: maya.id });
  const rowsOf = async (p) => { await p.rooms.refresh(); return p.rooms.state().mentions.filter((m) => m.note); };

  it('the comment is on the owner\'s Mac and on nobody else\'s', async () => {
    await comment();
    expect((await rowsOf(maya)).map((m) => [m.by, m.body])).toEqual([[dev.id, 'commented on slots.png: Add slot is hidden']]);
    expect(await rowsOf(sofia)).toEqual([]);
    expect(await rowsOf(dev)).toEqual([]);
  });
  it('opening the file, which writes it seen, takes the row away', async () => {
    await comment();
    await maya.rooms.markFile(room, { do: 'seen', on: ['n1'] });
    expect(await rowsOf(maya)).toEqual([]);
  });
});

describe('the wiring', () => {
  it('a press on the row opens the file at the comment', () => {
    const rooms = read('renderer/src/team/rooms/useRooms.tsx');
    expect(rooms).toMatch(/setOpeningFile\(/);
    expect(read('renderer/src/team/rooms/RoomChat.tsx')).toMatch(/opening\?\.at/);
    expect(read('renderer/src/team/rooms/RoomFileView.tsx')).toMatch(/note: opening\.note/);
  });
  it('Today opens it the same way', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/l\.mention\) roomsUi\.openMention\(l\.mention\)/);
  });
});
