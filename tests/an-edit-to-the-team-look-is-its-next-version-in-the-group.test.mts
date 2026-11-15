// AN EDIT TO THE TEAM LOOK IS ITS NEXT VERSION IN THE GROUP, AT ONCE.
//
// Sofia: she edited team-look.md from Files at 19:56 ("Body: a
// clean sans at 15px"), Done said "Sent to Dev. It shows as the next version once
// their computer has it", and at 20:18 it was still v3 of 3 without her words.
// Measured by reading where Files sent the edit: the Team look lives in the
// team's group, but Dev's agent had linked team-look.md on his thread, and an
// edit goes to a teammate's thread before a group. So her words went to Dev's
// computer as an edit of his thread's copy, which the group never reads and
// which writes nothing agents read. A file the group made is edited in the group.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { appFilesPlace } from '../main/files-place.mts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-look-edit-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const ROOM = 'room-1';
for (const name of ['team-look.md', 'a1-b2-team-look.md', 'seat-copy.md']) fs.writeFileSync(path.join(dir, name), `# ${name}`);
const projectDir = path.join(dir, 'lumen');
fs.mkdirSync(projectDir, { recursive: true });
fs.writeFileSync(path.join(projectDir, 'team-look.md'), '# Team look, as the project keeps it');
fs.writeFileSync(path.join(projectDir, 'seat-copy.md'), '# Seat copy');

const inRoom = (id, name, at, by = 'maya') => ({ id, roomId: ROOM, by, body: `Updated it.\n\n[${name}](attachments/${name})`, at, deleted: false });
const agentSaid = (ts, name) => ({ id: 't', ts, source: 'agent', patch: { result: `Read [${name}](${name}).` } });

function place({ room = [], devLines = [], ownLines = [] }) {
  const calls = { put: [], sent: [], shared: [] };
  const team = {
    state: () => ({
      me: { id: 'sofia' }, people: [{ id: 'dev', name: 'Dev' }, { id: 'maya', name: 'Maya' }],
      cards: devLines.length ? [{ personId: 'dev', threadId: 'd-1', title: 'Seat picker', project: 'Lumen' }] : [],
      rooms: { rooms: [{ id: ROOM, name: 'Lumen' }], messages: { [ROOM]: room }, fileMarks: { [ROOM]: [] } },
    }),
    sharedThreads: () => (devLines.length ? [{ ownerId: 'dev', threadId: 'd-1' }] : []),
    sharedThreadProducts: () => [],
    threadWork: () => ({ shared: true, product: 'lumen', lines: devLines }),
    markSharedFile: async (owner, threadId, mark) => { calls.shared.push({ owner, threadId, mark }); },
    rooms: {
      fileIfKept: (_r, name) => (fs.existsSync(path.join(dir, name)) ? path.join(dir, name) : null),
      fileOnDisk: async (_r, name) => (fs.existsSync(path.join(dir, name)) ? path.join(dir, name) : null),
      putFile: async (roomId, file) => { calls.put.push({ roomId, ...file }); return { ok: true }; },
      send: async (roomId, body) => { calls.sent.push({ roomId, body }); return { id: 'm' }; },
      markFile: async () => 'id',
    },
  };
  const product = { slug: 'lumen', name: 'Lumen', dir: projectDir };
  const item = { product: 'lumen', id: 'w-1', title: 'My look pass', updatedAt: 1 };
  const store = {
    listProducts: () => [product],
    listAllWorkItems: () => (ownLines.length ? [item] : []),
    readHistory: () => ownLines,
    readItem: () => item,
  };
  return { files: appFilesPlace({ store, team, accountRoot: dir, storeRoot: dir }), calls };
}

const theFile = async (files, name) => (await files.list()).files.find((f) => f.name === name);

describe('the Team look, made in the group and linked on a teammate\'s thread', () => {
  const room = [inRoom('a', 'team-look.md', 100), inRoom('b', 'a1-b2-team-look.md', 200, 'sofia')];
  const devLines = [agentSaid(300, 'team-look.md')];

  it('is one file that names both places', async () => {
    const { files } = place({ room, devLines });
    const look = await theFile(files, 'team-look.md');
    expect(look.sentIn.map((s) => s.kind).sort()).toEqual(['room', 'shared']);
  });

  it('takes the edit in the group, as a version straight away, and sends nothing to Dev', async () => {
    const { files, calls } = place({ room, devLines });
    const look = await theFile(files, 'team-look.md');
    const out = await files.edit(look.key, '# Team look\n\n- Body: a clean sans at 15px\n');
    expect(out).toEqual({ ok: true });
    expect(calls.shared).toEqual([]);
    expect(calls.put).toHaveLength(1);
    expect(calls.put[0].roomId).toBe(ROOM);
    expect(Buffer.from(calls.put[0].dataBase64, 'base64').toString()).toContain('15px');
    expect(calls.sent[0].body).toMatch(/\]\(attachments\/[^)]*team-look\.md\)/);
  });

  it('opens saying the group is where an edit goes, so the view never says "Sent to Dev"', async () => {
    const { files } = place({ room, devLines });
    const view = await files.open((await theFile(files, 'team-look.md')).key);
    expect(view.editsTo).toMatchObject({ kind: 'room', roomId: ROOM });
  });

  it('goes to the group even when her own thread links it too', async () => {
    const { files, calls } = place({ room, devLines, ownLines: [agentSaid(400, 'team-look.md')] });
    const look = await theFile(files, 'team-look.md');
    expect(look.sentIn.map((s) => s.kind)).toContain('thread');
    await files.edit(look.key, 'new words');
    expect(calls.put).toHaveLength(1);
    expect(fs.existsSync(path.join(projectDir, 'team-look-v2.md'))).toBe(false);
  });
});

describe('a file made on a thread and only later posted in the group', () => {
  it('still goes to the teammate whose thread made it', async () => {
    const { files, calls } = place({ room: [inRoom('c', 'seat-copy.md', 500, 'dev')], devLines: [agentSaid(400, 'seat-copy.md')] });
    const copy = await theFile(files, 'seat-copy.md');
    const out = await files.edit(copy.key, 'new seat words');
    expect(out).toMatchObject({ ok: true, goes: 'sent', to: 'dev' });
    expect(calls.put).toEqual([]);
    expect((await files.open(copy.key)).editsTo).toMatchObject({ kind: 'shared', ownerId: 'dev' });
  });
});
