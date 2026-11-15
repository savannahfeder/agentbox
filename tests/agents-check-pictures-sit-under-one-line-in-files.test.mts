// AGENTS' CHECK PICTURES SIT UNDER ONE LINE IN FILES, AND A PICTURE'S TILE
// SHOWS ALL OF IT.
//
// Maya and Sofia found Files filling with page-2026-10-31T17-42-40-037Z.png,
// v2-check.png and v3-check.png, the screenshots agents take to check their own
// work, between the real files; Dev's agent alone left five. Sofia also saw
// every picture tile cut at the left ("et up your clinic in three steps"):
// measured in files-place.css, a picture filled its 4:3 tile with object-fit
// cover, so a 16:10 screenshot lost about a twelfth of its width each side.
//
// A check picture is one an agent made, named as a page shot or a check, that
// nobody has commented on, approved or made a second version of. One a person
// is reviewing stays a tile.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { apartScratch, isScratch, scratchLine } from '../renderer/src/files/files-shown.ts';

const file = (name, over = {}) => ({ key: name, project: 'Lumen', name, kind: name.endsWith('.png') ? 'image' : name.endsWith('.mp4') ? 'film' : 'markdown', versions: 1, at: 1, by: 'dev', agent: '', open: 0, approvedBy: [], sentIn: [], opened: null, ...over });

describe('a check picture', () => {
  it('is an agent\'s page shot or check sheet nobody has looked at', () => {
    for (const name of ['page-2026-10-31T17-42-40-037Z.png', 'v2-check.png', 'launch-teaser-v3-check.png', 'contact-sheet.png', 'teaser-checks.png']) {
      expect([name, isScratch(file(name))]).toEqual([name, true]);
    }
  });
  it('is not one a person made', () => {
    const { agent: _a, ...person } = file('page-2026-10-31T17-42-40-037Z.png');
    expect(isScratch(person)).toBe(false);
  });
  it('is not one with a comment, an approval or a second version', () => {
    expect(isScratch(file('v2-check.png', { open: 1 }))).toBe(false);
    expect(isScratch(file('v2-check.png', { approvedBy: ['maya'] }))).toBe(false);
    expect(isScratch(file('page-2026-10-31T17-42-40-037Z-v2.png', { versions: 2 }))).toBe(false);
  });
  it('is not a real file whose name only contains the word', () => {
    for (const name of ['checkout.png', 'onboarding-b-v2.png', 'checklist.md', 'launch-cut-v1.mp4', 'page-one.png']) {
      expect([name, isScratch(file(name))]).toEqual([name, false]);
    }
  });
});

describe('the page', () => {
  const files = [file('onboarding-b.png', { agent: undefined }), file('v2-check.png'), file('page-2026-10-31T17-42-40-037Z.png'), file('spec.md')];
  it('keeps the real files as tiles and the check pictures apart, in order', () => {
    const { files: tiles, scratch } = apartScratch(files);
    expect(tiles.map((f) => f.name)).toEqual(['onboarding-b.png', 'spec.md']);
    expect(scratch.map((f) => f.name)).toEqual(['v2-check.png', 'page-2026-10-31T17-42-40-037Z.png']);
  });
  it('says how many in plain words', () => {
    expect(scratchLine(2)).toBe('2 check pictures agents took');
    expect(scratchLine(1)).toBe('1 check picture an agent took');
  });
});

// The owner then asked for no bars above and below, so a tile is now a screenshot's
// shape and fills from the top: a 16:10 page loses nothing, a taller one its foot.
it('a picture tile keeps a screenshot\'s sides', () => {
  const css = fs.readFileSync(new URL('../renderer/src/files/files-place.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.fp-face-image img \{[^}]*object-fit: cover/);
  expect(css).toMatch(/\.fp-face \{[^}]*aspect-ratio: 16 \/ 10/);
});

it('the page draws the line, and the tiles under it when it is pressed', () => {
  const page = fs.readFileSync(new URL('../renderer/src/files/FilesPlace.tsx', import.meta.url), 'utf8');
  expect(page).toMatch(/apartScratch\(/);
  expect(page).toMatch(/scratchLine\(/);
});
