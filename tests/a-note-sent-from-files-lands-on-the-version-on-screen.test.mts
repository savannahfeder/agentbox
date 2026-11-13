// A NOTE SENT FROM FILES LANDS ON THE VERSION ON SCREEN.
//
// A tester (2026-11-11, round three) opened her agent's revised design in Files,
// v2 of 2, and every note and approval she sent said "that version is gone".
// Measured with the Files place: when the agent wrote v2 over the same path,
// open() named the versions `landing.html@1` and `landing.html`, while the big
// view, which names versions from the paths it is given, called them
// `landing.html` and `landing.html#2`. mark() looked the view's id up among the
// line's ids and found nothing, and a v2 note was drawn on v1. Both now take a
// version's id from one function over the lines the view draws.
import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFilesPlace } from '../main/files-place.mts';
import { filesInLines, marksOnVersions, otherFilesInLines, threadFiles } from '../shared/artifact-marks.mts';
import type { ThreadLine } from '../shared/artifact-marks.mts';

let root: string;
let dir: string;
let lines: ThreadLine[];
const store = {
  listProducts: () => [{ slug: 'shop', name: 'Shop', dir }],
  listAllWorkItems: () => [{ product: 'shop', id: 'w-1', title: 'Landing', updatedAt: String(lines.length) }],
  readHistory: () => lines,
  fileMark: (_p: string, _id: string, mark: unknown) => { lines.push({ id: `m${lines.length}`, ts: 100 + lines.length, by: 'me', source: 'system', patch: { artifact: mark } } as ThreadLine); },
};
const make = () => appFilesPlace({ store, team: null, accountRoot: root, storeRoot: root } as unknown as Parameters<typeof appFilesPlace>[0]);
const write = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const agentSaid = (rel: string) => lines.push({ id: `a${lines.length}`, ts: lines.length + 1, source: 'agent', patch: { note: `Saved [${path.basename(rel)}](${rel})` } } as ThreadLine);

/** The versions as the big view names them: from the lines it is given, as ArtifactView reads them. */
function asTheViewNamesThem(view: { lines: unknown[] }) {
  const ls = view.lines as ThreadLine[];
  const reviewed = filesInLines(ls);
  return threadFiles(reviewed.length ? reviewed : otherFilesInLines(ls));
}

async function opened(place = make()) {
  const key = (await place.list()).files[0].key;
  const view = (await place.open(key))!;
  const families = asTheViewNamesThem(view);
  const marks = marksOnVersions(view.marks, families);
  const nOf = (file: string) => families[0].versions.find((v) => v.id === file)?.n;
  return { place, key, view, versions: families[0].versions, notes: marks.notes.map((n) => [n.id, nOf(n.file)]), approved: marks.approvals.map((a) => nOf(a.file)) };
}
const note = (id: string, file: string) => ({ do: 'note', id, file, place: { kind: 'whole' }, text: 'The button is too low' });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'note-from-files-'));
  dir = path.join(root, 'shop');
  lines = [];
});

describe('the agent revised the design over the same path', () => {
  beforeEach(async () => {
    write('designs/landing.html', '<h1>First</h1>');
    agentSaid('designs/landing.html');
    await make().list();
    write('designs/landing.html', '<h1>Revised</h1>');
    agentSaid('designs/landing.html');
  });

  it('a note on v2, the version on screen, is taken and lands on v2', async () => {
    const { place, key, versions } = await opened();
    expect(versions.map((v) => v.n)).toEqual([1, 2]);
    expect(await place.mark(key, note('n-2', versions[1].id))).toMatchObject({ ok: true });
    expect((await opened()).notes).toEqual([['n-2', 2]]);
  });

  it('a note on v1 lands on v1, not on v2', async () => {
    const { place, key, versions } = await opened();
    expect(await place.mark(key, note('n-1', versions[0].id))).toMatchObject({ ok: true });
    expect((await opened()).notes).toEqual([['n-1', 1]]);
  });

  it('approving v2 is taken and shows on v2', async () => {
    const { place, key, versions } = await opened();
    expect(await place.mark(key, { do: 'approve', file: versions[1].id })).toMatchObject({ ok: true });
    expect((await opened()).approved).toEqual([2]);
  });

  it('a version no view names is still refused', async () => {
    const { place, key } = await opened();
    expect(await place.mark(key, note('n-x', 'landing.html#7'))).toEqual({ ok: false, error: 'that version is gone' });
  });
});

describe('the agent saved v2 under a new name', () => {
  it('a note and an approval on v2 land on v2', async () => {
    write('designs/landing.html', '<h1>First</h1>');
    agentSaid('designs/landing.html');
    write('designs/landing-v2.html', '<h1>Revised</h1>');
    agentSaid('designs/landing-v2.html');
    const { place, key, versions } = await opened();
    expect(await place.mark(key, note('n-2', versions[1].id))).toMatchObject({ ok: true });
    expect(await place.mark(key, { do: 'approve', file: versions[1].id })).toMatchObject({ ok: true });
    const now = await opened();
    expect(now.notes).toEqual([['n-2', 2]]);
    expect(now.approved).toEqual([2]);
  });
});

describe('the newest version is not on this computer', () => {
  it('a note on it goes to the thread of the path it was written over, on v2', async () => {
    write('designs/landing.html', '<h1>First</h1>');
    agentSaid('designs/landing.html');
    await make().list();
    write('designs/landing.html', '<h1>Revised</h1>');
    await make().list();
    const hash = crypto.createHash('sha256').update('<h1>Revised</h1>').digest('hex');
    fs.rmSync(path.join(root, '.file-versions', 'version-bytes', hash), { recursive: true, force: true });
    write('designs/landing.html', '<h1>First</h1>');
    const { place, key, versions } = await opened();
    expect(versions.map((v) => v.n)).toEqual([1, 2]);
    expect(await place.mark(key, note('n-2', versions[1].id))).toEqual({ ok: true, wrote: { product: 'shop', id: 'w-1' } });
    expect((await opened()).notes).toEqual([['n-2', 2]]);
  });
});
