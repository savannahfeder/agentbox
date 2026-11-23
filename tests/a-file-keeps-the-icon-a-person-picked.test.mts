// A FILE KEEPS THE ICON A PERSON PICKED, AND A PICTURE SHOWS ITSELF.
//
// On the first Files home every tile in a project of 562 pictures wore the same
// picture icon, and the person asked "Can I change my icons?". A picture's tile
// now shows the picture, a document's icon comes from the words of its title, and
// Change icon in a tile's menu keeps a choice in the folder log beside the name
// a person gave the file, where every version and thread that names it finds it.
//
// What must NOT happen: an older choice beating a newer one, Automatic leaving
// the old choice behind, or a name the app does not draw breaking the tile.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { foldFolders } from '../shared/file-folders.mts';
import { GLYPH_NAMES, glyphFor, markOf } from '../renderer/src/files/files-home';

const file = (over) => ({ key: 'k', project: 'Agentbox', name: 'a.md', kind: 'markdown', versions: 1, at: 1, by: null, open: 0, approvedBy: [], sentIn: [], opened: 'a.md', folder: null, ...over });

describe('the choice in the folder log', () => {
  it('is the newest one, and Automatic clears it', () => {
    const shelf = foldFolders([
      { op: 'icon', key: 'k', icon: 'tag', at: 2 },
      { op: 'icon', key: 'k', icon: 'compass', at: 1 },
      { op: 'icon', key: 'other', icon: 'book', at: 1 },
    ]);
    expect(shelf.iconOf('k')).toBe('tag');
    expect(shelf.iconOf('other')).toBe('book');
    expect(shelf.iconOf('none')).toBeNull();
    expect(foldFolders([{ op: 'icon', key: 'k', icon: 'tag', at: 1 }, { op: 'icon', key: 'k', icon: '', at: 2 }]).iconOf('k')).toBeNull();
  });
  it('reaches Files and the app the way a file\'s name does', () => {
    const place = fs.readFileSync(new URL('../main/files-place.mts', import.meta.url), 'utf8');
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    expect(place).toMatch(/op: 'icon'/);
    expect(place).toMatch(/lib\.iconOf\(/);
    expect(ipc).toMatch(/what === 'icon' \? await place\.setIcon\(/);
  });
});

describe('what a tile wears', () => {
  it('is the icon a person picked, over any word', () => {
    expect(glyphFor(file({ name: 'pricing.md', icon: 'book' }))).toBe('book');
  });
  it('is drawn as if none was picked when the name is not one the app draws', () => {
    expect(glyphFor(file({ name: 'pricing.md', icon: 'unicorn' }))).toBe('tag');
  });
  it('takes a word from a document\'s title when its file name has none', () => {
    expect(glyphFor(file({ name: 'notes-2026-11-20.md' }), null, 'Pricing questions from calls')).toBe('tag');
  });
  it('is the picture itself for a picture on this computer, unless an icon was picked', () => {
    expect(markOf(file({ name: 'after.png', kind: 'image', opened: 'designs/after.png' }))).toBe('picture');
    expect(markOf(file({ name: 'after.png', kind: 'image', opened: null }))).toBe('icon');
    expect(markOf(file({ name: 'after.png', kind: 'image', opened: 'designs/after.png', icon: 'palette' }))).toBe('icon');
    expect(markOf(file({ name: 'a.md' }))).toBe('icon');
  });
  it('offers every drawing it has', () => {
    expect(GLYPH_NAMES).toEqual(expect.arrayContaining(['page', 'tag', 'compass', 'people', 'chart', 'book', 'image']));
    expect(new Set(GLYPH_NAMES).size).toBe(GLYPH_NAMES.length);
  });
});
