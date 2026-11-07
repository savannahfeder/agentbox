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
//
// Two synthetic testers then used it for 34 minutes (2026-11-05) and both met
// the same two things: every new document read "v2", and its holder thread
// showed in Done, search and Sent in. Those cases are below.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mjs';
import { filesInLines, sharedByWords, threadFiles } from '../shared/artifact-marks.mjs';
import { isFileHome, withoutFileHomes } from '../shared/file-home.mjs';

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

  it('opens with a version that can be edited', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    const view = await place.open(out.key);
    expect(view.versions).toHaveLength(1);
    expect(view.editsTo).not.toBeNull();
  });

  // Both testers on 2026-11-05: every new document read "v2 of 2", named -v2,
  // with an empty v1 to restore. The empty start is not a version.
  it('takes its first words as version 1, in the same file', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    expect(await place.edit(out.key, 'Today I shipped the new menu.\n')).toMatchObject({ ok: true });
    const [file] = await listed();
    expect(file).toMatchObject({ key: out.key, name: 'journal.md', versions: 1 });
    expect(fs.readFileSync(path.join(dir, 'documents', 'journal.md'), 'utf8')).toBe('Today I shipped the new menu.\n');
    expect(fs.existsSync(path.join(dir, 'documents', 'journal-v2.md'))).toBe(false);
  });

  it('makes its next version from the second save on', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    await place.edit(out.key, 'one\n');
    await place.edit(out.key, 'two\n');
    const [file] = await listed();
    expect(file).toMatchObject({ key: out.key, versions: 2 });
    expect(fs.readFileSync(path.join(dir, 'documents', 'journal.md'), 'utf8')).toBe('one\n');
  });

  it('numbers an empty file an agent names with words already beside it as before', async () => {
    fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'reports', 'notes.md'), 'words');
    const t = disk.createWorkItem(dir, { title: 'Notes', status: 'done' }, { source: 'founder' });
    disk.updateWorkItem(dir, t.id, { result: 'Saved [notes.md](reports/notes.md).' }, { source: 'agent' });
    await listed();
    fs.writeFileSync(path.join(dir, 'reports', 'notes-v2.md'), '');
    disk.updateWorkItem(dir, t.id, { result: 'Saved [notes-v2.md](reports/notes-v2.md).' }, { source: 'agent' });
    expect((await listed()).find((f) => f.name.startsWith('notes'))).toMatchObject({ versions: 2 });
  });

  // The thread that holds it is the app's, not the person's: both testers met it
  // in Done, in search and under Sent in, with a raw link as "their" message.
  it('is not sent in any thread, and its holder is marked as only holding it', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    const [file] = await listed();
    expect(file.sentIn).toEqual([]);
    expect((await place.open(out.key)).sentIn).toEqual([]);
    const [holder] = store.listItems().filter((i) => i.product === 'company');
    expect(isFileHome(holder)).toBe(true);
    expect(withoutFileHomes(store.listItems())).toEqual([]);
  });

  it('says it was made by you, not shared', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    await place.edit(out.key, 'words\n');
    const view = await place.open(out.key);
    const [family] = threadFiles(filesInLines(view.lines));
    expect(sharedByWords(family.versions[0], { me: null, nameOf: () => 'Maya' })).toBe('Made by you');
    await place.edit(out.key, 'more words\n');
    const [again] = threadFiles(filesInLines((await place.open(out.key)).lines));
    expect(sharedByWords(again.versions[1], { me: null, nameOf: () => 'Maya' })).toBe('Edited by you');
  });

  it('leaves a thread that only names a file it did not make as it was', async () => {
    fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'reports', 'plan.md'), 'plan');
    const t = disk.createWorkItem(dir, { title: 'Plan', status: 'done' }, { source: 'founder' });
    disk.updateWorkItem(dir, t.id, { result: 'Saved [plan.md](reports/plan.md).' }, { source: 'agent' });
    const [file] = await listed();
    expect(file.sentIn).toHaveLength(1);
    expect(withoutFileHomes(store.listItems())).toHaveLength(1);
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

// "What about tables and other stuff?" (2026-11-06): New made documents only.
describe('a new table', () => {
  it('is a table with a header row to type under', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Clients', kind: 'table' });
    const [file] = await listed();
    expect(file).toMatchObject({ key: out.key, name: 'clients.csv', kind: 'table', versions: 1, sentIn: [] });
    // A blank row is not drawn, so the table view offers "New row" under the header.
    expect(fs.readFileSync(path.join(dir, 'documents', 'clients.csv'), 'utf8')).toBe('Name,Notes\n');
  });

  it('takes its first rows as version 1, the way the table view saves them', async () => {
    await place.newDocument({ project: 'Company', name: 'Clients', kind: 'table' });
    fs.writeFileSync(path.join(dir, 'documents', 'clients.csv'), 'Name,Notes\nRamp,call Friday\n');
    expect((await listed())[0]).toMatchObject({ name: 'clients.csv', versions: 1 });
    fs.writeFileSync(path.join(dir, 'documents', 'clients.csv'), 'Name,Notes\nRamp,call Friday\nBrex,sent deck\n');
    expect((await listed())[0]).toMatchObject({ name: 'clients.csv', versions: 2 });
  });

  it('does not take a document\'s name for a table of the same words', async () => {
    await place.newDocument({ project: 'Company', name: 'Clients' });
    await place.newDocument({ project: 'Company', name: 'Clients', kind: 'table' });
    expect((await listed()).map((f) => f.name).sort()).toEqual(['clients.csv', 'clients.md']);
  });

  it('is refused for a kind it cannot make', async () => {
    await expect(place.newDocument({ project: 'Company', name: 'Deck', kind: 'deck' })).rejects.toThrow(/document or a table/);
  });
});

describe('files uploaded from the computer', () => {
  let from;
  beforeEach(() => {
    from = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-from-'));
    fs.writeFileSync(path.join(from, 'Logo.png'), 'png bytes');
    fs.writeFileSync(path.join(from, 'Q3 report.pdf'), 'pdf bytes');
    fs.writeFileSync(path.join(from, 'backup.zip'), 'zip bytes');
  });

  it('are copied into the project and listed in Files, in the folder they were added to', async () => {
    const folder = await place.makeFolder({ project: 'Company', name: 'Brand kit' });
    const out = await place.addFiles({ project: 'Company', folder: folder.id, paths: [path.join(from, 'Logo.png'), path.join(from, 'Q3 report.pdf')] });
    expect(out.refused).toEqual([]);
    const files = await listed();
    expect(files.map((f) => [f.name, f.kind, f.folder]).sort()).toEqual([['Q3-report.pdf', 'pdf', folder.id], ['Logo.png', 'image', folder.id]].sort());
    expect(fs.readFileSync(path.join(from, 'Logo.png'), 'utf8')).toBe('png bytes');
    expect(files.every((f) => f.sentIn.length === 0)).toBe(true);
    expect(withoutFileHomes(store.listItems())).toEqual([]);
  });

  it('refuses a kind Files cannot show, by name, and adds the rest', async () => {
    const out = await place.addFiles({ project: 'Company', paths: [path.join(from, 'backup.zip'), path.join(from, 'Logo.png')] });
    expect(out.refused).toEqual(['backup.zip']);
    expect((await listed()).map((f) => f.name)).toEqual(['Logo.png']);
  });

  it('adds nothing and makes no thread when nothing it was given can be shown', async () => {
    const out = await place.addFiles({ project: 'Company', paths: [path.join(from, 'backup.zip')] });
    expect(out).toMatchObject({ added: 0, refused: ['backup.zip'] });
    expect(store.listItems()).toHaveLength(0);
  });

  it('keeps a file already there under its own name', async () => {
    await place.addFiles({ project: 'Company', paths: [path.join(from, 'Logo.png')] });
    await place.addFiles({ project: 'Company', paths: [path.join(from, 'Logo.png')] });
    expect((await listed()).map((f) => f.name).sort()).toEqual(['Logo-2.png', 'Logo.png']);
  });
});

describe('the projects', () => {
  it('lists only this computer\'s own as ones a new file can go in', async () => {
    expect((await place.list()).mine).toEqual(['Company']);
  });
});
