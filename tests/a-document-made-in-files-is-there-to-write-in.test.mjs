// A DOCUMENT MADE IN FILES IS THERE TO WRITE IN.
//
// Files could make folders but not files: the only way a file reached it was an
// agent naming one on a thread, so "I want to journal" meant asking an agent to
// make an empty document first (w-f7bf369d2f). Measured before this: appFilesPlace
// had no way to make a file at all.
//
// What must hold: the new document is listed in its project and in the folder it
// was made in, opens with an editable version, takes a name no other file in the
// project has, and starts no agent (its thread is made already closed).
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mjs';

let store; let place; let dir; let accountRoot; let storeRoot;

beforeEach(async () => {
  disk._internals.forgetFolds();
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'new-doc-'));
  accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'company');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'company', name: 'Company' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  place = appFilesPlace({ store, accountRoot, storeRoot });
});

const listed = async () => (await place.list()).files;

describe('a new document', () => {
  it('is listed in its project, under the name it was given', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    const files = await listed();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ key: out.key, project: 'Company', kind: 'markdown', name: 'journal.md', folder: null });
    expect(fs.readFileSync(files[0].opened, 'utf8')).toBe('');
  });

  it('lands in the folder it was made in', async () => {
    const folder = await place.makeFolder({ project: 'Company', name: 'Notes' });
    const out = await place.newDocument({ project: 'Company', name: 'Journal', folder: folder.id });
    const [file] = await listed();
    expect(file).toMatchObject({ key: out.key, folder: folder.id });
  });

  it('opens with a version that can be edited, and the edit is its next version', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    const view = await place.open(out.key);
    expect(view).not.toBeNull();
    const saved = await place.edit(out.key, 'Today I shipped the new menu.\n');
    expect(saved).toMatchObject({ ok: true });
    const [file] = await listed();
    expect(file).toMatchObject({ key: out.key, versions: 2 });
  });

  it('starts no agent: its thread is made closed, by the person', async () => {
    await place.newDocument({ project: 'Company', name: 'Journal' });
    const items = store.listItems().filter((i) => i.product === 'company');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'done', title: 'Journal' });
    expect(items[0].wrote.status.source).toBe('founder');
  });

  it('takes a name of its own when the project already has that one', async () => {
    const first = await place.newDocument({ project: 'Company', name: 'Journal' });
    const second = await place.newDocument({ project: 'Company', name: 'journal' });
    expect(second.key).not.toBe(first.key);
    const names = (await listed()).map((f) => f.name).sort();
    expect(names).toEqual(['journal-2.md', 'journal.md']);
    expect(fs.existsSync(path.join(dir, 'documents', 'journal.md'))).toBe(true);
  });

  it('keeps a name that is only like another one', async () => {
    await place.newDocument({ project: 'Company', name: 'Journal' });
    await place.newDocument({ project: 'Company', name: 'Journal ideas' });
    expect((await listed()).map((f) => f.name).sort()).toEqual(['journal-ideas.md', 'journal.md']);
  });

  it('is refused without a name, or in a project this computer does not hold', async () => {
    await expect(place.newDocument({ project: 'Company', name: '   ' })).rejects.toThrow(/name/);
    await expect(place.newDocument({ project: 'Lumen', name: 'Journal' })).rejects.toThrow(/project/);
    expect(store.listItems()).toHaveLength(0);
  });

  it('is refused in a folder of another project', async () => {
    fs.mkdirSync(path.join(accountRoot, 'lumen'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'lumen', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'lumen', name: 'Lumen' }));
    store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    place = appFilesPlace({ store, accountRoot, storeRoot });
    const folder = await place.makeFolder({ project: 'Lumen', name: 'Notes' });
    await expect(place.newDocument({ project: 'Company', name: 'Journal', folder: folder.id })).rejects.toThrow(/another project/);
  });

  it('is listed among the projects that can take one', async () => {
    expect((await place.list()).mine).toEqual(['Company']);
  });
});
