// THE FILES PAGE SORTS, FILTERS AND NAMES A FILE FOR A PERSON, AND A PICTURE FILLS ITS TILE.
//
// Seen on the page: a flat grid with one order, a tile called
// page-2026-10-31T17-42-40-037Z-v5.png, a picture sitting as a band with empty
// bars above and below (object-fit contain in a 4:3 tile, measured in
// files-place.css), and a square search box beside soft tiles.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { crumbsTo, filesInPlace, foldersInPlace, needsReview, shownName, sortFiles } from '../renderer/src/files/files-shown';

const file = (over) => ({ key: over.name, project: 'Lumen app', name: 'a.png', kind: 'image', versions: 1, at: 1, by: null, open: 0, approvedBy: [], sentIn: [], opened: null, folder: null, ...over });
const css = fs.readFileSync(new URL('../renderer/src/files/files-place.css', import.meta.url), 'utf8');

describe('a tile\'s name', () => {
  const inThread = { sentIn: [{ kind: 'thread', title: 'Onboarding page' }] };
  it('is the thread\'s title for a machine-looking name', () => {
    expect(shownName(file({ name: 'page-2026-10-31T17-42-40-037Z-v5.png', ...inThread }))).toBe('Onboarding page');
    expect(shownName(file({ name: 'page-2026-10-31T17-42-40-037Z.png', ...inThread }))).toBe('Onboarding page');
    expect(shownName(file({ name: 'Screenshot 2026-10-31 at 17.42.40.png', ...inThread }))).toBe('Onboarding page');
  });
  it('is the file\'s own name for anything a person would name', () => {
    expect(shownName(file({ name: 'onboarding-b-v2-built-v2.png', ...inThread }))).toBe('onboarding-b-v2-built-v2.png');
    expect(shownName(file({ name: 'page-two.png', ...inThread }))).toBe('page-two.png');
    expect(shownName(file({ name: 'plan-2026-10-31.md', ...inThread }))).toBe('plan-2026-10-31.md');
  });
  it('stays the machine name when no thread can name it', () => {
    expect(shownName(file({ name: 'page-2026-10-31T17-42-40-037Z.png' }))).toBe('page-2026-10-31T17-42-40-037Z.png');
  });
});

describe('Needs review', () => {
  it('is an open comment on a file nobody approved', () => {
    expect(needsReview(file({ open: 2 }))).toBe(true);
    expect(needsReview(file({ open: 2, approvedBy: ['m'] }))).toBe(false);
    expect(needsReview(file({ open: 0 }))).toBe(false);
  });
});

describe('sorting', () => {
  const list = [file({ name: 'b.png', at: 3 }), file({ name: 'C.png', at: 1 }), file({ name: 'a.png', at: 2 })];
  it('puts the newest first on Recent', () => expect(sortFiles(list, 'recent').map((f) => f.name)).toEqual(['b.png', 'a.png', 'C.png']));
  it('goes by the name a person reads on Name, whatever its capitals', () => expect(sortFiles(list, 'name').map((f) => f.name)).toEqual(['a.png', 'b.png', 'C.png']));
  it('leaves the list it was given alone', () => { sortFiles(list, 'name'); expect(list[0].name).toBe('b.png'); });
});

describe('the place on the page', () => {
  const folders = [
    { id: 'f1', project: 'Lumen app', name: 'Launch', parent: null, at: 1 },
    { id: 'f2', project: 'Lumen app', name: 'Assets', parent: 'f1', at: 1 },
    { id: 'f3', project: 'Plans', name: 'Launch', parent: null, at: 1 },
  ];
  const files = [file({ name: 'top.png' }), file({ name: 'in.png', folder: 'f1' }), file({ name: 'deep.png', folder: 'f2' }), file({ name: 'gone.png', folder: 'not-here' })];

  it('at a project\'s top shows its folders and the files in no folder', () => {
    expect(foldersInPlace(folders, { project: 'Lumen app', folder: null }).map((f) => f.id)).toEqual(['f1']);
    expect(filesInPlace(files, folders, { project: 'Lumen app', folder: null }).map((f) => f.name)).toEqual(['top.png', 'gone.png']);
  });
  it('inside a folder shows what is inside, and no other project\'s folder of the name', () => {
    expect(foldersInPlace(folders, { project: 'Lumen app', folder: 'f1' }).map((f) => f.id)).toEqual(['f2']);
    expect(filesInPlace(files, folders, { project: 'Lumen app', folder: 'f1' }).map((f) => f.name)).toEqual(['in.png']);
  });
  it('on All files shows every file wherever it sits', () => {
    expect(filesInPlace(files, folders, { project: null, folder: null })).toHaveLength(4);
  });
  it('spells the way back', () => {
    expect(crumbsTo(folders, { project: 'Lumen app', folder: 'f2' }).map((c) => c.name)).toEqual(['All files', 'Lumen app', 'Launch', 'Assets']);
    expect(crumbsTo(folders, { project: null, folder: null }).map((c) => c.name)).toEqual(['All files']);
  });
});

describe('the page\'s look', () => {
  it('fills the tile from the top of the picture, at the shape of a screenshot so its sides are not cut', () => {
    expect(css).toMatch(/\.fp-face-image img \{[^}]*object-fit: cover[^}]*object-position: top/);
    expect(css).toMatch(/\.fp-face \{[^}]*aspect-ratio: 16 \/ 10/);
    expect(css).toMatch(/\.fp-face \{[^}]*overflow: hidden/);
  });
  it('softens the search box and the filters like the tiles', () => {
    expect(css).toMatch(/\.fp-find \{[^}]*border-radius: var\(--artifact-corner-small\)/);
    expect(css).toMatch(/\.fp-kind \{[^}]*border-radius: var\(--artifact-corner-small\)/);
  });
});
