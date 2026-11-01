// A FILE KEEPS ITS PLACE AND ITS OWN NAME, WHOEVER NAMES IT.
//
// Round 5, read in the copies' stores:
// - Maya's Files had a tile "dc1bdc0f055d-mvwlg12b-oxe1xc-group-bookings-spec.md",
//   "Not on this computer yet". An agent had named the copy it read in
//   _team-threads/.../attachments as a bare word, outside any attachments path, so
//   it was a stranger with no file behind it, and Dev's copy said "could not be found".
// - Sofia saw two tiles onboarding-b-team-look.png, "You" and "Dev". Her agent's
//   thread held a relayed "Dev replied to your message" line with Dev's link in it,
//   stamped as hers and pointing at a file that thread never held.
// - A new file from an agent landed loose in Company while the thread's others had
//   been moved to a folder.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFilesPlace } from '../main/files-place.mjs';
import { familyOfName, shownName } from '../shared/artifact-marks.mjs';
import { writeFolderLog } from '../shared/file-folders.mjs';
import { foldersMatching, missingWords } from '../renderer/src/files/files-shown.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keeps-place-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function aPlace(threads) {
  const dir = fs.mkdtempSync(path.join(root, 'p-'));
  const product = { slug: 'company', name: 'Company', dir };
  const store = {
    listProducts: () => [product],
    listAllWorkItems: () => threads.map((t) => ({ id: t.id, product: 'company', title: t.id, updatedAt: t.lines.length })),
    readHistory: (_s, id) => threads.find((t) => t.id === id).lines,
    teammates: { dir: () => dir },
  };
  for (const t of threads) for (const l of t.lines) l.id = t.id;
  return { place: appFilesPlace({ store, team: null, accountRoot: dir, storeRoot: dir }), dir };
}
const said = (result, ts = 1) => ({ ts, source: 'agent', patch: { result } });
const made = (dir, ...names) => { for (const n of names) fs.writeFileSync(path.join(dir, n), 'x'); };
const folderIn = (dir, id, name = id) => writeFolderLog(dir, { op: 'folder', id, project: 'Company', name, parent: null, at: 1 });
const place = (dir, stem, kind, folder) => writeFolderLog(dir, { op: 'place', key: `company\0${stem}\0${kind}`, project: 'Company', family: `${stem}\0${kind}`, folder, at: 2 });

describe('a copy\'s machine name', () => {
  it('is the file\'s own name, attachment path or bare word', () => {
    expect(shownName('dc1bdc0f055d-mvwlg12b-oxe1xc-group-bookings-spec.md')).toBe('group-bookings-spec.md');
    expect(shownName('attachments/dc1bdc0f055d-group-bookings-spec.md')).toBe('group-bookings-spec.md');
    expect(familyOfName('dc1bdc0f055d-mvwlg12b-oxe1xc-group-bookings-spec.md')).toBe(familyOfName('group-bookings-spec.md'));
  });
  it('leaves a name that only looks like one: too short, not hex, or a saved mark alone', () => {
    expect(shownName('abc123-notes.md')).toBe('abc123-notes.md');
    expect(shownName('zzzzzzzzzzzz-notes.md')).toBe('zzzzzzzzzzzz-notes.md');
    expect(shownName('/s/company/mvx6zm5q-dep7ls-team-look.md')).toBe('mvx6zm5q-dep7ls-team-look.md');
  });
});

describe('a teammate\'s relayed words', () => {
  it('put no file on this thread', async () => {
    const { place: p } = aPlace([{ id: 'w-1', lines: [{ ts: 1, source: 'system', patch: { answer: 'Dev replied to your message:\n\n> ![a.png](attachments/mvxbbnh0-xnp522-a.png)', from: { teammate: 'dev', name: 'Dev' } } }] }]);
    expect((await p.list()).files).toEqual([]);
  });
  it('while the agent\'s own mention of a file still counts', async () => {
    const { place: p, dir } = aPlace([{ id: 'w-1', lines: [said('[a.md](a.md)')] }]);
    made(dir, 'a.md');
    expect((await p.list()).files.map((f) => f.name)).toEqual(['a.md']);
  });
});

describe('a new file on a thread', () => {
  it('lands in the folder its thread\'s other files sit in', async () => {
    const { place: p, dir } = aPlace([{ id: 'w-1', lines: [said('[plan.md](plan.md)'), said('[notes.md](notes.md)', 3)] }]);
    made(dir, 'plan.md', 'notes.md');
    folderIn(dir, 'f-1');
    place(dir, 'plan', 'markdown', 'f-1');
    const { files } = await p.list();
    expect(files.find((f) => f.name === 'notes.md').folder).toBe('f-1');
  });
  it('leaves the thread\'s older files where they were: tidying one must not move the rest', async () => {
    const { place: p, dir } = aPlace([{ id: 'w-1', lines: [said('[plan.md](plan.md)', 0.5), said('[old.md](old.md)', 1)] }]);
    made(dir, 'plan.md', 'old.md');
    folderIn(dir, 'f-1');
    place(dir, 'plan', 'markdown', 'f-1');
    expect((await p.list()).files.find((f) => f.name === 'old.md').folder).toBeNull();
  });
  it('lands at the top when they sit in two folders', async () => {
    const { place: p, dir } = aPlace([{ id: 'w-1', lines: [said('[a.md](a.md)'), said('[b.md](b.md)', 2), said('[c.md](c.md)', 5)] }]);
    made(dir, 'a.md', 'b.md', 'c.md');
    folderIn(dir, 'f-1'); folderIn(dir, 'f-2');
    place(dir, 'a', 'markdown', 'f-1');
    place(dir, 'b', 'markdown', 'f-2');
    expect((await p.list()).files.find((f) => f.name === 'c.md').folder).toBeNull();
  });
  it('lands at the top when nothing on the thread has a folder', async () => {
    const { place: p, dir } = aPlace([{ id: 'w-1', lines: [said('[a.md](a.md)')] }]);
    made(dir, 'a.md');
    expect((await p.list()).files[0].folder).toBeNull();
  });
  it('stays where a person put it, even at the top', async () => {
    const { place: p, dir } = aPlace([{ id: 'w-1', lines: [said('[a.md](a.md)'), said('[b.md](b.md)', 2)] }]);
    made(dir, 'a.md', 'b.md');
    folderIn(dir, 'f-1');
    place(dir, 'a', 'markdown', 'f-1');
    place(dir, 'b', 'markdown', null);
    expect((await p.list()).files.find((f) => f.name === 'b.md').folder).toBeNull();
  });
  it('does not follow a file on another thread', async () => {
    const { place: p, dir } = aPlace([{ id: 'w-1', lines: [said('[a.md](a.md)')] }, { id: 'w-2', lines: [said('[b.md](b.md)')] }]);
    made(dir, 'a.md', 'b.md');
    folderIn(dir, 'f-1');
    place(dir, 'a', 'markdown', 'f-1');
    expect((await p.list()).files.find((f) => f.name === 'b.md').folder).toBeNull();
  });
});

describe('the Move menu\'s search', () => {
  const folders = [
    { id: '1', project: 'C', name: 'Launch', parent: null, at: 1 },
    { id: '2', project: 'C', name: 'Design', parent: null, at: 1 },
    { id: '3', project: 'C', name: 'Launch films', parent: '2', at: 1 },
  ];
  it('finds by any part of the name, any case', () => {
    expect(foldersMatching(folders, 'LAUN').map((f) => f.id)).toEqual(['1', '3']);
  });
  it('shows all with nothing typed', () => {
    expect(foldersMatching(folders, '  ')).toHaveLength(3);
  });
  it('finds nothing for what is not there', () => {
    expect(foldersMatching(folders, 'zzz')).toEqual([]);
  });
});

describe('a file that has not reached this computer', () => {
  it('says whose computer has it', () => {
    expect(missingWords('Dev')).toBe('On Dev\'s computer. It opens here once it comes across.');
  });
  it('says so plainly when nobody is known', () => {
    expect(missingWords(null)).toBe('Not on this computer yet. It opens here once it comes across.');
  });
});
