// FILES' FOLDERS HAVE THEIR OWN PAGES, AND A PATH BACK.
//
// On the first Files home the person found "no breadcrumbs or an easy way to go
// back and forward", and kept clicking a section's name ("Not in a folder")
// expecting it to open. A section's name now opens that folder's own page, and
// the page says where it is (All files › Agentbox), each step of it a way back.
// The window's arrows walk only the inbox page, so this path is Files' own back.
//
// What must NOT happen: a subfolder's path skipping its parent, a project's page
// leading nowhere, or All files offering a way back to itself.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { crumbsFor, NOT_IN_A_FOLDER } from '../renderer/src/files/files-home';

const folders = [
  { id: 'cus', project: 'Agentbox', name: 'Customers', parent: null, at: 1 },
  { id: 'calls', project: 'Agentbox', name: 'Calls', parent: 'cus', at: 1 },
];

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

describe('the page', () => {
  it('draws the path on a folder\'s page and on the files in no folder', () => {
    const place = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
    expect(place).toMatch(/crumbsFor\(folders, project, /);
  });
});
