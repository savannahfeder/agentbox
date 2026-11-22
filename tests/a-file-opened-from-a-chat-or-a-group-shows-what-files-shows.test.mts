// A FILE OPENED FROM A CHAT OR A GROUP SHOWS WHAT FILES SHOWS.
//
// Two testers on one team (2026-11-11): the chat link to phone-unknown.png
// opened with an empty Notes panel, and the copy attached in a group from Files
// showed no v2, no Approved and no notes, while Files showed v2 with its
// comments and approval. Measured from the code: a chat's view took notes only
// from copies with the same bytes, matched by each thread's own version id, so a
// note on v1 and marks Files stored as `name@2` were dropped; the line that
// numbers versions answered only for a project thread; and a group's view read
// only the group's marks. Every door now reads the Files file the copy belongs to.
//
// What must NOT join: a file of the same name in another project.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFilesPlace } from '../main/files-place.mts';
import { filesInLines, lineAsThread, marksOnVersions, threadFiles } from '../shared/artifact-marks.mts';

const V1 = Buffer.from('89504e470d0a1a0a0000000d4948445200000010', 'hex');
const V2 = Buffer.from('89504e470d0a1a0a0000000d4948445200000020', 'hex');
const OTHER = Buffer.from('89504e470d0a1a0a0000000d4948445200000030', 'hex');
const ROOM = 'room-1';
const CHAT_COPY = 'attachments/mvwy0003-cccc-phone-unknown.png';
const ROOM_COPY = 'attachments/mvwy0004-dddd-phone-unknown.png';

let root: string;
let place: ReturnType<typeof appFilesPlace>;
let items: Array<{ product: string; id: string; title: string; updatedAt: string; lines: unknown[] }>;
let roomMarks: Array<{ id: string; at: number; by: string; mark: unknown }>;

const put = (dir: string, rel: string, bytes: Buffer): string => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), bytes);
  return rel;
};
const said = (ts: number, rel: string) => ({ id: `l${ts}`, ts, source: 'agent', patch: { note: `Here: [phone-unknown.png](${rel})` } });
const marked = (ts: number, mark: unknown, by = 'maya') => ({ id: `m${ts}`, ts, by, source: 'system', patch: { artifact: mark } });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-file-every-door-'));
  const dirOf = (slug: string): string => path.join(root, slug);
  const products = [
    { slug: 'website', name: 'Website', dir: dirOf('website') },
    { slug: 'billing', name: 'Billing', dir: dirOf('billing') },
    { slug: 'direct-1', name: 'Maya and Dev', dir: dirOf('direct-1'), team: { direct: true, people: ['dev'] } },
  ];
  for (const p of products) fs.mkdirSync(p.dir, { recursive: true });
  const roomFile = path.join(root, 'room-files', 'mvwy0004-dddd-phone-unknown.png');
  fs.mkdirSync(path.dirname(roomFile), { recursive: true });
  fs.writeFileSync(roomFile, V2);
  items = [
    {
      product: 'website', id: 'w-1', title: 'Phone screens', updatedAt: '1',
      lines: [
        said(1, put(dirOf('website'), 'attachments/mvwy0001-aaaa-phone-unknown.png', V1)),
        marked(2, { do: 'note', id: 'n-v1', file: 'phone-unknown.png', place: { kind: 'whole' }, text: 'The status bar is cut' }),
        said(3, put(dirOf('website'), 'attachments/mvwy0002-bbbb-phone-unknown.png', V2)),
        // Files writes a version the thread never named as `name@n`.
        marked(4, { do: 'note', id: 'n-v2', file: 'phone-unknown.png@2', place: { kind: 'whole' }, text: 'Better' }),
        marked(5, { do: 'approve', file: 'phone-unknown.png@2' }),
      ],
    },
    { product: 'billing', id: 'w-2', title: 'Billing', updatedAt: '1', lines: [said(1, put(dirOf('billing'), 'attachments/mvwy0009-zzzz-phone-unknown.png', OTHER)), marked(2, { do: 'note', id: 'n-billing', file: 'phone-unknown.png', place: { kind: 'whole' }, text: 'In billing' })] },
    { product: 'direct-1', id: 'c-1', title: 'Chat', updatedAt: '1', lines: [{ id: 'c1', ts: 10, by: 'maya', source: 'founder', patch: { body: `Look [phone-unknown.png](${put(dirOf('direct-1'), CHAT_COPY, V2)})` } }] },
  ];
  roomMarks = [];
  const store = {
    listProducts: () => products,
    listAllWorkItems: () => items,
    readHistory: (slug: string, id: string) => items.find((i) => i.product === slug && i.id === id)?.lines ?? [],
  };
  const team = {
    state: () => ({
      me: { id: 'maya' }, people: [{ id: 'dev', name: 'Dev' }], cards: [],
      rooms: { rooms: [{ id: ROOM, name: 'Team' }], messages: { [ROOM]: [{ id: 'r1', roomId: ROOM, by: 'maya', at: 20, deleted: false, body: `[phone-unknown.png](${ROOM_COPY})` }] }, fileMarks: { [ROOM]: roomMarks } },
    }),
    sharedThreads: () => [],
    sharedThreadProducts: () => [],
    rooms: {
      fileIfKept: (_r: string, name: string) => (name === 'mvwy0004-dddd-phone-unknown.png' ? roomFile : null),
      fileOnDisk: async (_r: string, name: string) => (name === 'mvwy0004-dddd-phone-unknown.png' ? roomFile : null),
    },
  };
  place = appFilesPlace({ store, team, accountRoot: root, storeRoot: root } as unknown as Parameters<typeof appFilesPlace>[0]);
});

const filesKey = async () => (await place.list()).files.find((f) => f.project === 'Website')!.key;

/** What a door's big view puts on each version: the thread's own lines, numbered by the file's line, with the marks from Files. */
async function onEachVersion(ask: { product: string; id: string; room?: string }, lines: unknown[]) {
  const ownLines = lines as Parameters<typeof filesInLines>[0];
  const copies = threadFiles(filesInLines(ownLines)).flatMap((f) => f.versions.map((v) => ({ path: v.path, file: v.id })));
  const elsewhere = await place.sameFiles({ ...ask, copies });
  const numbered = lineAsThread(await place.lineFor(ask));
  const families = threadFiles(filesInLines([...ownLines, ...numbered.lines]), numbered.numbers);
  const marks = marksOnVersions({ notes: elsewhere.flatMap((e) => e.notes), approvals: elsewhere.flatMap((e) => e.approvals) }, families);
  const versions = families[0].versions;
  return {
    key: elsewhere[0].key,
    own: versions.find((v) => v.path === copies[0].path)?.n,
    count: versions.length,
    notes: marks.notes.map((n) => [n.id, versions.find((v) => v.id === n.file)?.n]),
    approved: marks.approvals.map((a) => versions.find((v) => v.id === a.file)?.n),
  };
}

describe('the file in Files', () => {
  it('is v2 of 2, its v1 note on v1, its v2 note and approval on v2', async () => {
    const view = (await place.open(await filesKey()))!;
    const n = (file: string) => view.versions.find((v) => v.id === file)?.n;
    expect(view.versions.map((v) => v.n)).toEqual([1, 2]);
    expect(view.marks.notes.map((x) => [x.id, n(x.file)])).toEqual([['n-v1', 1], ['n-v2', 2]]);
    expect(view.marks.approvals.map((a) => n(a.file))).toEqual([2]);
  });
});

describe('opened from a chat link', () => {
  it('is the same file, v2 of 2, with the v1 note, the v2 note and the approval where Files has them', async () => {
    const got = await onEachVersion({ product: 'direct-1', id: 'c-1' }, items[2].lines);
    expect(got.key).toBe(await filesKey());
    expect(got.own).toBe(2);
    expect(got.count).toBe(2);
    expect(got.notes).toEqual([['n-v1', 1], ['n-v2', 2]]);
    expect(got.approved).toEqual([2]);
  });
});

describe('opened as a group attachment', () => {
  const roomLines = () => [{ id: 'r1', ts: 20, by: 'maya', source: 'founder', patch: { body: `[phone-unknown.png](${ROOM_COPY})` } }];

  it('is the same file, v2 of 2, with the same notes and approval', async () => {
    const got = await onEachVersion({ product: '', id: '', room: ROOM }, roomLines());
    expect(got.key).toBe(await filesKey());
    expect(got.own).toBe(2);
    expect(got.count).toBe(2);
    expect(got.notes).toEqual([['n-v1', 1], ['n-v2', 2]]);
    expect(got.approved).toEqual([2]);
  });

  it("does not repeat the group's own comments", async () => {
    roomMarks.push({ id: 'g1', at: 30, by: 'dev', mark: { do: 'note', id: 'n-room', file: 'phone-unknown.png', place: { kind: 'whole' }, text: 'From the group' } });
    const got = await onEachVersion({ product: '', id: '', room: ROOM }, roomLines());
    expect(got.notes.map(([id]) => id)).toEqual(['n-v1', 'n-v2']);
  });
});

describe('what must not join', () => {
  it("a file of the same name in another project keeps its own notes", async () => {
    const chat = await onEachVersion({ product: 'direct-1', id: 'c-1' }, items[2].lines);
    expect(chat.notes.map(([id]) => id)).not.toContain('n-billing');
    const billing = (await place.list()).files.find((f) => f.project === 'Billing')!;
    const view = (await place.open(billing.key))!;
    expect(view.marks.notes.map((x) => x.id)).toEqual(['n-billing']);
  });
});

describe('the views', () => {
  const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
  it("a group's file view asks for the Files file's marks and numbers", () => {
    const view = read('renderer/src/team/rooms/RoomFileView.tsx');
    expect(view).toContain('api.fileElsewhere(');
    expect(view).toContain('api.fileLine(');
    expect(view).toContain('withElsewhere(');
  });
});
