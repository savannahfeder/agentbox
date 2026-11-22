// FILES LOADS ONLY THE TILES NEAR THE SCREEN.
//
// w-eb02c5f8f9: opening Files on a store of about 2,400 files lagged the whole
// app, and the first pictures took ages to show. FilesPlace.tsx drew every
// tile at once, and only a picture's face waited until it was near the screen.
// Every page tile mounted an iframe of the whole page, every document and code
// tile read its file over IPC, every PDF was fetched and parsed and every deck
// unzipped, all at once, so the pictures on screen queued behind hundreds of
// reads in the main process. Counted in the source on 9abfc4db: `shown.map(tile)`
// with no limit, and `<Face>` mounted in every Tile.
//
// Now the page draws TILES_AT_ONCE and more as you scroll toward its end, and a
// tile's face mounts only once the tile comes near the screen.
// No jsdom here, so the rules run on stand-ins and the wiring is read from source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { drawnOf, moreTiles, TILES_AT_ONCE } from '../renderer/src/files/files-shown.ts';

const source = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
const files = (n: number, tag = 'f') => Array.from({ length: n }, (_, i) => `${tag}${i}`);

describe('how many tiles are drawn', () => {
  it('starts at a screenful or two, not every file', () => {
    expect(TILES_AT_ONCE).toBeGreaterThanOrEqual(30);
    expect(TILES_AT_ONCE).toBeLessThanOrEqual(100);
    const out = drawnOf(files(2400), [], TILES_AT_ONCE);
    expect(out.shown).toHaveLength(TILES_AT_ONCE);
  });

  it('draws every file when there are fewer than that', () => {
    expect(drawnOf(files(12), [], TILES_AT_ONCE).shown).toHaveLength(12);
    expect(drawnOf(files(TILES_AT_ONCE), [], TILES_AT_ONCE).shown).toHaveLength(TILES_AT_ONCE);
  });

  it('gives the check pictures only what the files above them leave', () => {
    const below = drawnOf(files(TILES_AT_ONCE - 5), files(40, 's'), TILES_AT_ONCE);
    expect(below.shown).toHaveLength(TILES_AT_ONCE - 5);
    expect(below.scratch).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(drawnOf(files(200), files(40, 's'), TILES_AT_ONCE).scratch).toEqual([]);
  });

  it('grows by the same step, and stops at the last file', () => {
    expect(moreTiles(TILES_AT_ONCE, 2400)).toBe(2 * TILES_AT_ONCE);
    expect(moreTiles(TILES_AT_ONCE, TILES_AT_ONCE + 1)).toBe(TILES_AT_ONCE + 1);
    expect(moreTiles(TILES_AT_ONCE, TILES_AT_ONCE)).toBe(TILES_AT_ONCE);
    expect(moreTiles(TILES_AT_ONCE, 3)).toBe(TILES_AT_ONCE);
  });
});

describe('the page', () => {
  it('maps only the drawn files, never the whole list', () => {
    expect(source).not.toMatch(/\{shown\.map\(tile\)\}/);
    expect(source).not.toMatch(/\{scratch\.map\(tile\)\}/);
    expect(source).toMatch(/drawnOf\(/);
  });

  it('asks for more as the end of the page comes near', () => {
    expect(source).toMatch(/moreTiles\(/);
    expect(source).toMatch(/IntersectionObserver/);
  });

  it('goes back to the first tiles when what is shown changes', () => {
    expect(source).toMatch(/setDrawn\(TILES_AT_ONCE\)/);
  });

  it('mounts a tile\'s face only once the tile is near the screen', () => {
    const tile = source.slice(source.indexOf('function Tile('), source.indexOf('function FolderCard('));
    expect(tile).toMatch(/useNear(<\w+>)?\(/);
    for (const face of tile.match(/<Face [^>]*\/>/g) ?? []) {
      const at = tile.indexOf(face);
      expect(tile.slice(Math.max(0, at - 20), at)).toMatch(/near && $/);
    }
    expect(tile.match(/<Face [^>]*\/>/g)?.length).toBe(2);
  });
});
