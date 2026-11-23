// FILES' FOLDERS HAVE THEIR OWN PAGES, AND THE ARROWS STEP THROUGH THEM.
//
// On the first Files home the person found "no breadcrumbs or an easy way to go
// back and forward", and kept clicking a section's name ("Not in a folder")
// expecting it to open. A section's name now opens that folder's own page, the
// page says where it is (All files › Agentbox), and the window's back and
// forward arrows step between a project's home and its folder pages, because a
// folder is part of where Files is.
//
// What must NOT happen: two folders of one project read as the same place, so
// Back skips one; or a project's home and its folder page told apart by nothing.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { sameStop, stopOnScreen } from '../renderer/src/back-and-forward';
import { crumbsFor, NOT_IN_A_FOLDER } from '../renderer/src/files/files-home';

const screen = (files) => ({ settings: null, thread: null, card: null, home: false, files, connections: false, group: null, teammate: null, teamPlace: null, unrecorded: false, view: 'inbox' });
const folders = [
  { id: 'cus', project: 'Agentbox', name: 'Customers', parent: null, at: 1 },
  { id: 'calls', project: 'Agentbox', name: 'Calls', parent: 'cus', at: 1 },
];

describe('the arrows', () => {
  it('tell two folders of one project apart', () => {
    expect(sameStop({ at: 'files', project: 'Agentbox', folder: 'cus' }, { at: 'files', project: 'Agentbox', folder: 'calls' })).toBe(false);
    expect(sameStop({ at: 'files', project: 'Agentbox', folder: 'cus' }, { at: 'files', project: 'Agentbox', folder: null })).toBe(false);
  });
  it('take a project\'s home with or without a folder word as one place', () => {
    expect(sameStop({ at: 'files', project: 'Agentbox', folder: null }, { at: 'files', project: 'Agentbox' })).toBe(true);
    expect(sameStop({ at: 'files', project: 'Agentbox', folder: 'cus' }, { at: 'files', project: 'Agentbox', folder: 'cus' })).toBe(true);
  });
  it('record the folder on screen', () => {
    expect(stopOnScreen(screen({ project: 'Agentbox', folder: 'cus' }))).toEqual({ at: 'files', project: 'Agentbox', folder: 'cus' });
    expect(stopOnScreen(screen({ project: null, folder: null }))).toEqual({ at: 'files', project: null, folder: null });
  });
  it('are what App opens Files with, folder and all', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/openFiles\(s\.project, s\.folder/);
    expect(app).toMatch(/folder=\{filesPage!\.folder/);
  });
});

describe('where a page says it is', () => {
  it('says nothing on All files itself', () => {
    expect(crumbsFor(folders, null, null)).toEqual([]);
  });
  it('leads back to All files from a project', () => {
    expect(crumbsFor(folders, 'Agentbox', null)).toEqual([{ name: 'All files', project: null, folder: null }]);
  });
  it('leads back through the project from a folder, and through its parent from a subfolder', () => {
    expect(crumbsFor(folders, 'Agentbox', 'cus').map((c) => c.name)).toEqual(['All files', 'Agentbox']);
    expect(crumbsFor(folders, 'Agentbox', 'calls')).toEqual([
      { name: 'All files', project: null, folder: null },
      { name: 'Agentbox', project: 'Agentbox', folder: null },
      { name: 'Customers', project: 'Agentbox', folder: 'cus' },
    ]);
  });
  it('leads back to the project from the files in no folder', () => {
    expect(crumbsFor(folders, 'Agentbox', NOT_IN_A_FOLDER).map((c) => c.name)).toEqual(['All files', 'Agentbox']);
  });
});
