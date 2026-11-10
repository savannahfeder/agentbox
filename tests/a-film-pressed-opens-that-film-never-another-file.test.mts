// A FILM PRESSED OPENS THAT FILM, NEVER ANOTHER FILE.
//
// Pressing agent-docs-cut3-v8.mp4 in a video thread opened film-rules.md, the
// first file that thread showed. Measured from the code: the big view opens
// with only the pressed path, so it holds place 0. Then the thread's files and
// their Files numbers arrive. The film's family was numbered, but the line did
// not know v8 yet, and threadFiles dropped every version the line did not
// know. The press found nothing and returned, and stillInHand fell back to
// the bare place 0, which now held film-rules.md.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadFiles, stillInHand, whereAPressLands, versionForPath } from '../shared/artifact-marks.mts';

const D = 'designs/w-1';
const rules = 'marketing/film-rules.md';
const v7 = `${D}/agent-docs-cut3-v7.mp4`;
const v8 = `${D}/agent-docs-cut3-v8.mp4`;
const said = [rules, v7, v8].map((path) => ({ path }));
// Files has numbered the notes and v7, and not yet v8.
const numbers = { [rules]: 1, [v7]: 1 };
const filmOf = (families) => families.find((f) => f.versions.some((v) => v.path === v7));
const pathAt = (families, place) => (place ? families[place.fi]?.versions[place.vi]?.path : undefined);

describe('a pressed version the line does not know yet', () => {
  it('is kept, after the numbered ones', () => {
    const film = filmOf(threadFiles(said, numbers, { keep: v8 }));
    expect(film.versions.map((v) => [v.path, v.n])).toEqual([[v7, 1], [v8, 2]]);
  });

  it('is kept when pressed by a shorter or longer form of its path', () => {
    expect(filmOf(threadFiles(said, numbers, { keep: 'agent-docs-cut3-v8.mp4' })).versions).toHaveLength(2);
    expect(filmOf(threadFiles(said, numbers, { keep: `./${v8}` })).versions).toHaveLength(2);
  });

  it('is where a press on it lands', () => {
    const families = threadFiles(said, numbers, { keep: v8 });
    expect(pathAt(families, whereAPressLands(families, { path: v8 }))).toBe(v8);
  });

  it('is still no version when it was only named, not pressed', () => {
    expect(filmOf(threadFiles(said, numbers)).versions.map((v) => v.path)).toEqual([v7]);
    expect(filmOf(threadFiles(said, numbers, { keep: v7 })).versions.map((v) => v.path)).toEqual([v7]);
  });

  it('leaves the numbered versions their numbers when the line knows them all', () => {
    const film = filmOf(threadFiles(said, { ...numbers, [v8]: 3 }, { keep: v8 }));
    expect(film.versions.map((v) => [v.path, v.n])).toEqual([[v7, 1], [v8, 3]]);
  });

  it('a copy of a numbered version still folds into it', () => {
    const film = filmOf(threadFiles([...said, { path: 'agent-docs-cut3-v7.mp4' }], numbers, { keep: v8 }));
    expect(film.versions).toHaveLength(2);
    expect(versionForPath([film], 'agent-docs-cut3-v7.mp4').path).toBe(v7);
  });
});

describe('the file in hand when its version goes', () => {
  it('is nothing rather than whatever file now sits at its old place', () => {
    const before = threadFiles([{ path: v8 }]);
    const held = { id: before[0].versions[0].id, path: v8 };
    const after = threadFiles([{ path: rules }, { path: v7 }]);
    expect(stillInHand(after, { fi: 0, vi: 0 }, held)).toBeNull();
  });

  it('the press, as the big view makes it, ends on the film', () => {
    const first = threadFiles([{ path: v8 }], null, { keep: v8 });
    const placed = whereAPressLands(first, { path: v8 });
    const held = { id: first[0].versions[0].id, path: v8 };
    const families = threadFiles(said, numbers, { keep: v8 });
    const now = whereAPressLands(families, { path: v8 }) ?? stillInHand(families, placed, held);
    expect(pathAt(families, now)).toBe(v8);
  });

  it('the big view keeps the path it was opened on', () => {
    const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(view).toContain('threadFiles(files, numbers, { keep: open.path })');
  });
});
