// A FILE IN A GROUP GOES IN PARTS UP TO 200 MB, AND OPENS BIG WITH COMMENTS.
//
// A conversation took a 68 MB film in pieces, but the same film in a
// group chat was refused, and a PDF picked from the Desktop "could not be
// read". Measured: RoomChat read every file whole into base64 through the
// picture address (which serves only pictures and media), and the room's cloud
// refused anything over 10 MB. A file that did go opened in the old FileSheet,
// with no comments and no Approve, while the same file in a conversation opened
// in the big viewer with both.
//
// Now this Mac reads the file itself and sends it in 8 MB parts with a short
// list naming them, a teammate's Mac puts it back together on disk, and a room
// keeps comments on its files as a conversation keeps them on its own.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';
import { ROOM_PART_BYTES, ROOM_MAX_BYTES, partName, partsOf, readPartList, partList } from '../shared/room-file-parts.mjs';
import { marksOf } from '../shared/artifact-marks.mjs';

const MB = 1024 * 1024;
const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const timers = { setTimeout: (fn) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h) => { if (h) h.off = true; } };

describe('the parts', () => {
  it('a file up to one part goes whole', () => {
    expect(partsOf(ROOM_PART_BYTES)).toBe(1);
    expect(partsOf(5 * MB)).toBe(1);
  });
  it('a bigger one goes in as many parts as it fills', () => {
    expect(partsOf(ROOM_PART_BYTES + 1)).toBe(2);
    expect(partsOf(68 * MB)).toBe(9);
    expect(partsOf(ROOM_MAX_BYTES)).toBe(25);
  });
  it('200 MB is the most, and a byte more is refused', () => {
    expect(ROOM_MAX_BYTES).toBe(200 * MB);
    expect(partsOf(ROOM_MAX_BYTES + 1)).toBe(0);
  });
  it('the list of parts reads back, and a real file is never read as one', () => {
    expect(readPartList(partList(3, 20 * MB))).toEqual({ parts: 3, size: 20 * MB });
    expect(readPartList(Buffer.from('{"parts":3}').toString('base64'))).toBeNull();
    expect(readPartList(Buffer.from('PNG....').toString('base64'))).toBeNull();
  });
  it('a part keeps a name the room takes', () => {
    expect(partName('mvw6dnzy-ctt68z-launch-cut.mp4', 7)).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
  });
});

function world() {
  const cloud = createMemoryCloud();
  const mk = (name, email) => {
    const id = signUpMemory(cloud, { email, name });
    const backend = memoryBackend(cloud, id);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `room-parts-${name}-`));
    const p = { id, name, backend, dir, teamState: { team: null, people: [], cards: [] } };
    p.rooms = createRooms({
      backend: () => backend, me: () => ({ id, name }), team: () => p.teamState, enabled: () => true,
      device: () => 'abcdefabcdef', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }),
      prefsFile: roomPrefsFile(dir), filesDir: path.join(dir, 'room-files'), timers,
      onChange: () => { for (const [k, s] of Object.entries(p.rooms?.state().sending ?? {})) p.progress.push([k, s.done, s.total]); },
    });
    p.progress = [];
    return p;
  };
  return { cloud, maya: mk('Maya', 'maya@lumen.test'), dev: mk('Dev', 'dev@lumen.test'), jun: mk('Jun', 'jun@elsewhere.test') };
}

let w;
let room;
beforeEach(async () => {
  w = world();
  const team = await w.maya.backend.createTeam('Lumen');
  await w.maya.backend.invite(team.id, 'dev@lumen.test');
  await w.dev.backend.acceptInvite(team.id);
  const people = [{ id: w.maya.id, name: 'Maya' }, { id: w.dev.id, name: 'Dev' }];
  w.maya.teamState = { team, people, cards: [] };
  w.dev.teamState = { team, people, cards: [] };
  await w.maya.rooms.tick();
  await w.dev.rooms.tick();
  room = w.maya.rooms.state().rooms[0].id;
});

const fileOf = (dir, name, bytes) => {
  const f = path.join(dir, name);
  const b = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i += 4096) b[i] = (i / 4096) % 251;
  fs.writeFileSync(f, b);
  return f;
};

describe('sending from this Mac', () => {
  it('a 20 MB film goes in parts and opens whole on a teammate\'s Mac', async () => {
    const src = fileOf(w.maya.dir, 'cut.mp4', 20 * MB);
    expect(await w.maya.rooms.putFileFrom(room, { name: 'k1-ab12-cut.mp4', srcPath: src })).toBe('k1-ab12-cut.mp4');
    expect(await w.maya.backend.roomFile(room, partName('k1-ab12-cut.mp4', 3))).toBeTruthy();
    const there = await w.dev.rooms.fileOnDisk(room, 'k1-ab12-cut.mp4');
    expect(there.startsWith(w.dev.dir)).toBe(true);
    expect(fs.readFileSync(there).equals(fs.readFileSync(src))).toBe(true);
  });
  it('a small file goes whole, read from its path, whatever kind it is', async () => {
    const src = path.join(w.maya.dir, 'spec.pdf');
    fs.writeFileSync(src, '%PDF-1.4 small');
    await w.maya.rooms.putFileFrom(room, { name: 'k2-ab12-spec.pdf', srcPath: src });
    expect(Buffer.from(await w.dev.rooms.file(room, 'k2-ab12-spec.pdf'), 'base64').toString()).toBe('%PDF-1.4 small');
    expect(await w.maya.backend.roomFile(room, partName('k2-ab12-spec.pdf', 1))).toBeNull();
  });
  it('over 200 MB is refused before a byte leaves the Mac', async () => {
    const src = path.join(w.maya.dir, 'huge.mov');
    fs.writeFileSync(src, '');
    fs.truncateSync(src, ROOM_MAX_BYTES + 1);
    await expect(w.maya.rooms.putFileFrom(room, { name: 'k3-ab12-huge.mov', srcPath: src })).rejects.toThrow(/200 MB/);
    expect(await w.maya.backend.roomFile(room, 'k3-ab12-huge.mov')).toBeNull();
  });
  it('says how far it has got while it goes', async () => {
    const src = fileOf(w.maya.dir, 'cut2.mp4', 17 * MB);
    await w.maya.rooms.putFileFrom(room, { name: 'k4-ab12-cut2.mp4', srcPath: src });
    const key = `${room}/k4-ab12-cut2.mp4`;
    expect(w.maya.progress.filter(([k]) => k === key).map(([, done, total]) => `${done}/${total}`)).toEqual(['0/3', '1/3', '2/3']);
    expect(w.maya.rooms.state().sending?.[key]).toBeUndefined();
  });
});

describe('comments on a group\'s files', () => {
  const note = { do: 'note', id: 'n1', file: 'slots.png', place: { kind: 'pin', x: 0.4, y: 0.2 }, text: 'Add slot is hidden' };
  it('a comment made by one person is read by the other, as the viewer folds it', async () => {
    await w.maya.rooms.markFile(room, note);
    await w.dev.rooms.refresh();
    const rows = w.dev.rooms.state().fileMarks[room];
    const marks = marksOf(rows.map((r) => ({ ...r.mark, by: r.by, ts: r.at })));
    expect(marks.notes.map((n) => [n.id, n.by, n.text])).toEqual([['n1', w.maya.id, 'Add slot is hidden']]);
  });
  it('an approval and a reply land the same way', async () => {
    await w.maya.rooms.markFile(room, note);
    await w.dev.rooms.markFile(room, { do: 'reply', id: 'r1', on: 'n1', file: 'slots.png', text: 'Agreed' });
    await w.dev.rooms.markFile(room, { do: 'approve', file: 'slots.png' });
    await w.maya.rooms.refresh();
    const marks = marksOf(w.maya.rooms.state().fileMarks[room].map((r) => ({ ...r.mark, by: r.by, ts: r.at })));
    expect(marks.notes[0].replies.map((r) => r.text)).toEqual(['Agreed']);
    expect(marks.approvals.map((a) => a.by)).toEqual([w.dev.id]);
  });
  it('a mark that is not one is refused, and someone outside the room can neither write nor read them', async () => {
    await expect(w.maya.rooms.markFile(room, { do: 'note', id: 'x', file: '../a', place: { kind: 'whole' }, text: 'x' })).rejects.toThrow();
    await w.maya.rooms.markFile(room, note);
    await expect(w.jun.backend.markRoomFile(room, { id: 'j1', mark: note })).rejects.toThrow();
    await expect(w.jun.backend.roomFileMarks(room)).rejects.toThrow();
  });
});

describe('the wiring', () => {
  it('the cloud keeps the marks, lets only the room read them, and takes the parts of a film within its limit', () => {
    const sql = read('cloud/supabase/migrations/20261101120000_a_group_file_goes_in_parts_and_carries_comments.sql');
    expect(sql).toMatch(/create table if not exists public\.room_file_marks/);
    expect(sql).toMatch(/for select using \(public\.in_room\(room_id\)\)/);
    expect(sql).toMatch(/by_person = auth\.uid\(\)\s+and public\.in_room\(room_id\)/);
    expect(sql).toMatch(/room_limit\('files', 80, interval '10 minutes'\)/);
  });
  it('the app may call the new room calls', () => {
    const ipc = read('main/ipc.mts');
    for (const op of ['putFileFrom', 'fileOnDisk', 'fileText', 'markFile']) expect(ipc).toMatch(new RegExp(`ROOM_OPS = new Set\\([^)]*'${op}'`));
  });
  it('a file with a path goes from this Mac, and a reviewable file opens in the big viewer', () => {
    const chat = read('renderer/src/team/rooms/RoomChat.tsx');
    expect(chat).toMatch(/onPutFileFrom\(name, a\.srcPath\)/);
    expect(chat).toContain('<RoomFileView');
    expect(read('renderer/src/team/rooms/RoomFileView.tsx')).toContain('<ArtifactView');
  });
});
