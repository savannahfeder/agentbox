// A CHANGE MADE IN FILES SHOWS AT ONCE.
//
// Renaming a folder on the Files home "took like a few seconds to show the
// change. should have been immediate". The page drew a change only once the
// app had made the whole list of files again, which takes seconds on a store
// of 3,348 files (files-opens-at-once-on-the-list-it-made-last). A rename, a
// move, a file's name or icon, a deleted folder and a new one are now drawn
// over the list the moment they are made, until a list made after them comes.
//
// What must NOT happen: a change drawn over a list that already has it twice,
// a failed change left on screen, a deleted folder's files left inside it, or
// a change to one file or folder reaching another.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { withChanges } from '../renderer/src/files/files-changes';

const folder = (id, name, over = {}) => ({ id, project: 'Agentbox', name, parent: null, at: 1, ...over });
const file = (key, over = {}) => ({ key, project: 'Agentbox', name: `${key}.md`, kind: 'markdown', versions: 1, at: 1, by: null, open: 0, approvedBy: [], sentIn: [], opened: null, folder: null, ...over });
const list = {
  files: [file('quotes', { folder: 'res' }), file('notes', { folder: 'calls' }), file('plan', { icon: 'tag', title: 'The plan' })],
  projects: ['Agentbox'],
  folders: [folder('res', 'Research'), folder('calls', 'Calls', { parent: 'res' }), folder('brand', 'Brand kit')],
};
const names = (l) => l.folders.map((f) => f.name);
const at = (l, key) => l.files.find((f) => f.key === key);

describe('a folder', () => {
  it('takes its new name at once, written as the app keeps it, and no other folder does', () => {
    const shown = withChanges(list, [{ do: 'rename', id: 'res', name: '  User   research ' }]);
    expect(names(shown)).toEqual(['User research', 'Calls', 'Brand kit']);
  });
  it('keeps its name when the new one is blank', () => {
    expect(names(withChanges(list, [{ do: 'rename', id: 'res', name: '   ' }]))).toEqual(['Research', 'Calls', 'Brand kit']);
  });
  it('is there at once when made, and once only when the list has it too', () => {
    const made = { do: 'made', folder: folder('new', 'Pricing') };
    expect(names(withChanges(list, [made]))).toEqual(['Research', 'Calls', 'Brand kit', 'Pricing']);
    const after = { ...list, folders: [...list.folders, folder('new', 'Pricing')] };
    expect(names(withChanges(after, [made]))).toEqual(['Research', 'Calls', 'Brand kit', 'Pricing']);
  });
  it('goes with the folders under it when deleted, and their files go to no folder', () => {
    const shown = withChanges(list, [{ do: 'remove', id: 'res' }]);
    expect(names(shown)).toEqual(['Brand kit']);
    expect(at(shown, 'quotes').folder).toBeNull();
    expect(at(shown, 'notes').folder).toBeNull();
  });
});

describe('a file', () => {
  it('sits in the folder it was moved to at once, and stops following its thread', () => {
    const follows = { ...list, files: [file('quotes', { folder: 'res', folderFollows: true }), ...list.files.slice(1)] };
    const shown = at(withChanges(follows, [{ do: 'move', key: 'quotes', folder: 'brand' }]), 'quotes');
    expect(shown.folder).toBe('brand');
    expect(shown.folderFollows).toBeUndefined();
    expect(at(withChanges(list, [{ do: 'move', key: 'quotes', folder: null }]), 'quotes').folder).toBeNull();
  });
  it('takes the name and the icon given to it, and Automatic takes the icon off', () => {
    const shown = withChanges(list, [{ do: 'name', key: 'quotes', name: ' Human agent teams quotes ' }, { do: 'icon', key: 'plan', icon: '' }]);
    expect(at(shown, 'quotes').title).toBe('Human agent teams quotes');
    expect(at(shown, 'plan').icon).toBeUndefined();
    expect(at(shown, 'plan').title).toBe('The plan');
    expect(at(withChanges(list, [{ do: 'icon', key: 'quotes', icon: 'book' }]), 'quotes').icon).toBe('book');
  });
  it('leaves every other file as it was', () => {
    const shown = withChanges(list, [{ do: 'move', key: 'quotes', folder: 'brand' }, { do: 'name', key: 'quotes', name: 'Quotes' }]);
    expect(at(shown, 'notes')).toBe(list.files[1]);
    expect(at(shown, 'plan')).toBe(list.files[2]);
  });
});

describe('the page', () => {
  const place = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
  it('draws every change it makes over the list, an undo included, and takes a failed one back off', () => {
    expect(place).toMatch(/const act = \(p: FileFolderAct\) => actNow\(p\)/);
    expect(place).not.toMatch(/await api\.filesPlaceFolder\(p\)/);
    expect(place).toMatch(/if \(!r\.ok\) pending = pending\.filter\(\(q\) => q !== mine\)/);
  });
  it('keeps a change until a list asked for after the app wrote it arrives', () => {
    expect(place).toMatch(/pending = pending\.filter\(\(p\) => p\.done === null \|\| p\.done > asked\)/);
  });
});
