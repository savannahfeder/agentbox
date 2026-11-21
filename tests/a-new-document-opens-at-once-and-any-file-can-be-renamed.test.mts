// A NEW DOCUMENT OPENS AT ONCE, AND ANY FILE CAN BE RENAMED.
//
// "Creating it was an awful process because I had to go through several steps
// and even name it without opening the document. I couldn't rename it."
// (w-a1c984116b). Measured before this: newDocument threw "a document needs a
// name" without one, so New showed a name box before anything opened, and
// nothing in Files could change a file's name once it was made.
//
// What must hold: New makes "Untitled document" (or "Untitled table") with no
// name asked for; a file shows the name it was given rather than its name on
// disk; a rename reaches the list and the open view, holds for every later
// version, and leaves the file on disk where every thread finds it.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { foldFolders } from '../shared/file-folders.mts';
import { shownName } from '../renderer/src/files/files-shown.ts';

let store; let place; let dir; let accountRoot; let storeRoot;

beforeEach(async () => {
  disk._internals.forgetFolds();
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-'));
  accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'company');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'company', name: 'Company' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  place = appFilesPlace({ store, accountRoot, storeRoot });
});

const listed = async () => (await place.list()).files;

describe('New', () => {
  it('makes an untitled document without asking for a name', async () => {
    const out = await place.newDocument({ project: 'Company' });
    const [file] = await listed();
    expect(file).toMatchObject({ key: out.key, kind: 'markdown', name: 'untitled-document.md', title: 'Untitled document' });
    expect(out.title).toBe('Untitled document');
    expect((await place.open(out.key)).editsTo).not.toBeNull();
  });

  it('takes a blank name as no name', async () => {
    await place.newDocument({ project: 'Company', name: '   ' });
    expect((await listed())[0]).toMatchObject({ title: 'Untitled document' });
  });

  it('makes an untitled table the same way', async () => {
    await place.newDocument({ project: 'Company', kind: 'table' });
    expect((await listed())[0]).toMatchObject({ kind: 'table', name: 'untitled-table.csv', title: 'Untitled table' });
  });

  it('gives a second untitled document a file of its own', async () => {
    const a = await place.newDocument({ project: 'Company' });
    const b = await place.newDocument({ project: 'Company' });
    expect(b.key).not.toBe(a.key);
    expect((await listed()).map((f) => f.name).sort()).toEqual(['untitled-document-2.md', 'untitled-document.md']);
  });

  it('shows a name it was given as typed, not as its name on disk', async () => {
    await place.newDocument({ project: 'Company', name: 'Launch plan' });
    expect((await listed())[0]).toMatchObject({ name: 'launch-plan.md', title: 'Launch plan' });
  });
});

describe('a rename', () => {
  it('changes the name Files shows and leaves the file on disk as it was', async () => {
    const out = await place.newDocument({ project: 'Company' });
    await place.edit(out.key, 'Notes from the call\n');
    expect(await place.renameFile({ key: out.key, name: '  Call   notes ' })).toMatchObject({ ok: true, title: 'Call notes' });
    const [file] = await listed();
    expect(file).toMatchObject({ key: out.key, name: 'untitled-document.md', title: 'Call notes' });
    expect(fs.readFileSync(path.join(dir, 'documents', 'untitled-document.md'), 'utf8')).toBe('Notes from the call\n');
    expect((await place.open(out.key)).title).toBe('Call notes');
  });

  it('holds for the versions that come after it', async () => {
    const out = await place.newDocument({ project: 'Company' });
    await place.edit(out.key, 'one\n');
    await place.renameFile({ key: out.key, name: 'Journal' });
    await place.edit(out.key, 'two\n');
    expect((await listed())[0]).toMatchObject({ key: out.key, versions: 2, title: 'Journal' });
  });

  it('is the newest name when renamed twice', async () => {
    const out = await place.newDocument({ project: 'Company' });
    await place.renameFile({ key: out.key, name: 'First' });
    await place.renameFile({ key: out.key, name: 'Second' });
    expect((await listed())[0].title).toBe('Second');
  });

  it('works on a file an agent made, which had no name of its own until then', async () => {
    fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'reports', 'q3-plan.md'), 'plan');
    const t = disk.createWorkItem(dir, { title: 'Plan', status: 'done' }, { source: 'founder' });
    disk.updateWorkItem(dir, t.id, { result: 'Saved [q3-plan.md](reports/q3-plan.md).' }, { source: 'agent' });
    const [before] = await listed();
    expect(before.title).toBeUndefined();
    await place.renameFile({ key: before.key, name: 'Q3 plan' });
    const [after] = await listed();
    expect(after).toMatchObject({ key: before.key, name: 'q3-plan.md', title: 'Q3 plan' });
    expect(fs.existsSync(path.join(dir, 'reports', 'q3-plan.md'))).toBe(true);
  });

  it('renames only the file it was asked to', async () => {
    const a = await place.newDocument({ project: 'Company', name: 'Alpha' });
    await place.newDocument({ project: 'Company', name: 'Beta' });
    await place.renameFile({ key: a.key, name: 'Gamma' });
    expect((await listed()).map((f) => f.title).sort()).toEqual(['Beta', 'Gamma']);
  });

  it('is refused with no name, or for a file that is gone', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    await expect(place.renameFile({ key: out.key, name: '  ' })).rejects.toThrow(/name/);
    await expect(place.renameFile({ key: 'company\0nothing', name: 'X' })).rejects.toThrow(/gone/);
    expect((await listed())[0].title).toBe('Journal');
  });
});

describe('the folder log', () => {
  it('keeps the newest name by its time, whatever order the lines came in', () => {
    const shelf = foldFolders([
      { op: 'name', key: 'k', name: 'Newer', at: 20 },
      { op: 'name', key: 'k', name: 'Older', at: 10 },
    ]);
    expect(shelf.titleOf('k')).toBe('Newer');
    expect(shelf.titleOf('other')).toBeNull();
  });
});

describe('a tile', () => {
  const file = { name: 'untitled-document.md', sentIn: [] };
  it('shows the given name over the name on disk', () => {
    expect(shownName({ ...file, title: 'Call notes' })).toBe('Call notes');
  });
  it('shows the name on disk when it was given none', () => {
    expect(shownName(file)).toBe('untitled-document.md');
  });
});
