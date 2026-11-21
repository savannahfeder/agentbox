// A FILE ARRIVING DOES NOT MOVE THE TILE YOU ARE ABOUT TO CLICK.
//
// Both synthetic testers on 2026-11-21 (w-a1c984116b) went for one file's menu
// in Files as an agent's new document arrived. The new file took the top
// place, every tile moved one along, and the click opened a different file.
// Files sorts newest first and reads its list again on every change, so
// nothing held a tile still under the pointer.
//
// What must hold: while the pointer moves over the files, they keep the order
// they had, and a new one waits after them; with the pointer still, the sort
// is as before.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { inOrderOf } from '../renderer/src/files/files-shown.ts';

const key = (f: { key: string }) => f.key;
const files = (...keys: string[]) => keys.map((k) => ({ key: k }));

describe('the order held under the pointer', () => {
  it('keeps the tiles where they were, and puts a new one after them', () => {
    expect(inOrderOf(files('new', 'a', 'b', 'c'), ['a', 'b', 'c'], key).map(key)).toEqual(['a', 'b', 'c', 'new']);
  });

  it('keeps several new ones in the order they came', () => {
    expect(inOrderOf(files('n1', 'n2', 'a'), ['a'], key).map(key)).toEqual(['a', 'n1', 'n2']);
  });

  it('closes up a gap where a file went, without moving the rest past it', () => {
    expect(inOrderOf(files('a', 'c'), ['a', 'b', 'c'], key).map(key)).toEqual(['a', 'c']);
  });

  it('leaves the order alone when nothing was held', () => {
    expect(inOrderOf(files('c', 'a', 'b'), [], key).map(key)).toEqual(['c', 'a', 'b']);
  });

  // Round two: a tester's click opened a file's menu, a new file then arrived
  // with the pointer still, and the menu slid away with its tile.
  it('also holds while a file\'s menu or a rename box is open', () => {
    const src = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/const holding = [^;]*HOLD_STILL_MS[^;]*\|\| busy\(\)/);
    expect(src).toMatch(/\.fp-more-box\.is-open/);
    expect(src).toMatch(/\.fp-name > \.fp-name-box/);
  });

  it('is what the Files page uses for its tiles and its project cards, only while the pointer moves', () => {
    const src = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/holding \? inOrderOf\(sorted, held\.current\.tiles/);
    expect(src).toMatch(/holding \? inOrderOf\(all\.projects, held\.current\.projects/);
    expect(src.match(/onPointerMove=\{pointerMoved\}/g)).toHaveLength(2);
  });
});
