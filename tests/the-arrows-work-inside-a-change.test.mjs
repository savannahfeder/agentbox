// THE ARROWS WORK INSIDE A CHANGE.
//
// She was right, and the QA rig she asked for is the harness,
// which builds this renderer, opens her real change in the real pane and
// presses real keys through Chromium's input pipeline. Measured there on
// 2026-08-26 before anything was touched: 17 of 25 actions passed and every one
// of the eight failures was an arrow key. ArrowUp, ArrowDown, ArrowRight,
// PageUp and PageDown did nothing at all, anywhere in the pane.
//
// That script is the end-to-end half and it is not in the suite, because it
// wants Chrome, a build and her store. THIS file is the part that runs every
// time, and it guards the rules themselves — which live in one module on
// purpose, since three copies of a key rule disagreeing is exactly what caused.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caretStep, codeScroll, fileOnScreen, walkFiles, whereIsShe } from '../renderer/src/code-keys.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const codeArtifact = read('renderer', 'src', 'components', 'CodeArtifact.tsx');

describe('where her keyboard is decides what an arrow means', () => {
  it('is the line when the caret is in one', () => {
    expect(whereIsShe({ inLine: true, isContentEditable: true })).toBe('line');
  });

  it('is the tree when she has pressed a file', () => {
    expect(whereIsShe({ inTree: true })).toBe('tree');
  });

  it('is the code the rest of the time, including with nothing focused', () => {
    expect(whereIsShe(null)).toBe('code');
    expect(whereIsShe({})).toBe('code');
  });

  it('puts a line first, because a line inside the tree is not a thing', () => {
    expect(whereIsShe({ inLine: true, inTree: true })).toBe('line');
  });
});

describe('the arrows scroll the code', () => {
  const view = { row: 20, view: 800, top: 0, max: 5000 };

  it('moves one row down and one row up', () => {
    expect(codeScroll('ArrowDown', view)).toBe(20);
    expect(codeScroll('ArrowUp', { ...view, top: 100 })).toBe(80);
  });

  it('moves a screenful less two rows for a page, so her place is not lost', () => {
    expect(codeScroll('PageDown', view)).toBe(760);
    expect(codeScroll('PageUp', { ...view, top: 1000 })).toBe(240);
  });

  it('reaches both ends, and ⌘ up and down mean the same thing on a Mac', () => {
    expect(codeScroll('Home', { ...view, top: 900 })).toBe(0);
    expect(codeScroll('End', view)).toBe(5000);
    expect(codeScroll('ArrowDown', view, { meta: true })).toBe(5000);
    expect(codeScroll('ArrowUp', { ...view, top: 900 }, { meta: true })).toBe(0);
  });

  it('never scrolls off either end', () => {
    expect(codeScroll('ArrowUp', { ...view, top: 0 })).toBe(0);
    expect(codeScroll('ArrowDown', { ...view, top: 5000 })).toBe(5000);
    expect(codeScroll('PageDown', { ...view, top: 4990 })).toBe(5000);
  });

  it('survives a change short enough not to scroll at all', () => {
    expect(codeScroll('PageDown', { row: 20, view: 800, top: 0, max: 0 })).toBe(0);
    expect(codeScroll('End', { row: 20, view: 800, top: 0, max: -4 })).toBe(0);
  });

  it('falls back to a sane row height rather than dividing by nothing', () => {
    expect(codeScroll('ArrowDown', { row: 0, view: 800, top: 0, max: 5000 })).toBe(19);
  });

  it('answers nothing for a key that is not its business', () => {
    expect(codeScroll('j', view)).toBe(null);
    expect(codeScroll('ArrowLeft', view)).toBe(null);
    expect(codeScroll('Escape', view)).toBe(null);
  });
});

describe('the arrows walk the files when she is on the tree', () => {
  it('goes down one and up one', () => {
    expect(walkFiles('ArrowDown', 3, 18)).toBe(4);
    expect(walkFiles('ArrowUp', 3, 18)).toBe(2);
  });

  it('answers nothing at all for J and K', () => {
    expect(walkFiles('j', 3, 18)).toBe(null);
    expect(walkFiles('k', 3, 18)).toBe(null);
    expect(walkFiles('J', 3, 18)).toBe(null);
    expect(walkFiles('K', 3, 18)).toBe(null);
  });

  it('STOPS at both ends rather than wrapping round', () => {
    // A wrap sends her from the last file of eighteen to the first without her
    // asking, and that reads as the pane losing her place.
    expect(walkFiles('ArrowDown', 17, 18)).toBe(17);
    expect(walkFiles('ArrowUp', 0, 18)).toBe(0);
  });

  it('reaches the first and last file directly', () => {
    expect(walkFiles('Home', 9, 18)).toBe(0);
    expect(walkFiles('End', 9, 18)).toBe(17);
  });

  it('answers nothing when there are no files, rather than -1', () => {
    expect(walkFiles('ArrowDown', 0, 0)).toBe(null);
  });
});

describe('the caret crossing out of a one-line editable', () => {
  const mid = { col: 4, len: 20 };

  it('carries her column into the line above and below', () => {
    expect(caretStep('ArrowDown', mid)).toEqual({ move: 1, col: 4 });
    expect(caretStep('ArrowUp', mid)).toEqual({ move: -1, col: 4 });
  });

  it('runs off the front of a line onto the END of the one above', () => {
    expect(caretStep('ArrowLeft', { col: 0, len: 20 })).toEqual({ move: -1, col: Infinity });
  });

  it('runs off the end of a line onto the START of the one below', () => {
    expect(caretStep('ArrowRight', { col: 20, len: 20 })).toEqual({ move: 1, col: 0 });
  });

  it('LEAVES THE MIDDLE OF A LINE TO THE BROWSER, which is the whole point', () => {
    // Reimplementing left and right inside a line would mean reimplementing
    // accented characters, selection and right-to-left text with them.
    expect(caretStep('ArrowLeft', mid)).toBe(null);
    expect(caretStep('ArrowRight', mid)).toBe(null);
  });

  it('does not take a shifted arrow, because that is a selection and not a move', () => {
    // A SELECTION MAY CROSS LINES — round four built it, and it is `extendHead`
    // in the same module, tested in
    // tests/selecting-code-out-of-a-change.test.mjs. This line used to say a
    // selection may NOT cross lines, which was true of the code and false of
    // what she needed: measured 2026-08-27, shift and two downs reached zero
    // lines of the change. What stays true is that the CARET must not move
    // while a selection is being made, which is all this null means.
    expect(caretStep('ArrowDown', mid, { shift: true })).toBe(null);
    expect(caretStep('ArrowLeft', { col: 0, len: 20 }, { shift: true })).toBe(null);
  });

  it('leaves ⌘ arrows to the browser, which is where line-start and line-end live', () => {
    expect(caretStep('ArrowUp', mid, { meta: true })).toBe(null);
    expect(caretStep('ArrowLeft', { col: 0, len: 20 }, { meta: true })).toBe(null);
  });

  it('answers nothing for an empty line pressed left, other than stepping up', () => {
    expect(caretStep('ArrowRight', { col: 0, len: 0 })).toEqual({ move: 1, col: 0 });
    expect(caretStep('ArrowLeft', { col: 0, len: 0 })).toEqual({ move: -1, col: Infinity });
  });
});

describe('which file the code on screen belongs to', () => {
  const offsets = [0, 400, 1200, 3000];

  it('is the first file before anything has scrolled', () => {
    expect(fileOnScreen(offsets, 0)).toBe(0);
  });

  it('is the last file whose header has passed the top', () => {
    expect(fileOnScreen(offsets, 500)).toBe(1);
    expect(fileOnScreen(offsets, 1300)).toBe(2);
    expect(fileOnScreen(offsets, 9000)).toBe(3);
  });

  it('does not jump to the next file until its header is nearly at the top', () => {
    // There is 12px of slack, and it is deliberate: the header row has padding
    // above it, so a file whose title is a few pixels below the edge is the
    // file she is reading. Outside the slack it is still the file before.
    expect(fileOnScreen(offsets, 380)).toBe(0);
    expect(fileOnScreen(offsets, 389)).toBe(1);
  });

  it('never falls off the front when the column is scrolled above the first head', () => {
    expect(fileOnScreen(offsets, -50)).toBe(0);
    expect(fileOnScreen([], 100)).toBe(0);
  });

  it('ignores a file whose header has not been drawn yet', () => {
    // heads.current holds null for a file React has not mounted, and the
    // component hands Infinity down for those rather than skipping them.
    expect(fileOnScreen([0, Number.POSITIVE_INFINITY, 1200], 1300)).toBe(2);
  });
});

describe('the component reads the rules rather than writing its own', () => {
  it('asks code-keys.ts what an arrow means', () => {
    expect(codeArtifact).toContain("from '../code-keys'");
    expect(codeArtifact).toContain('caretStep(');
    expect(codeArtifact).toContain('codeScroll(');
    // The tree walk goes through stepInTree since 2026-10-04, which asks
    // walkFiles itself (tests/folding-the-tree-never-moves-the-code.test.mjs).
    expect(codeArtifact).toContain('stepInTree(');
    expect(codeArtifact).toContain('nextChange(');
    expect(codeArtifact).toContain('fileOnScreen(');
  });

  it('still lets ⌘S through before any guard, which is how it was found dead once already', () => {
    expect(codeArtifact).toMatch(/metaKey \|\| e\.ctrlKey\) && \(e\.key === 's'/);
  });

  it('does not pull the column when the tree moved because SHE scrolled', () => {
    // Without this the screen is yanked to the top of a file the instant her
    // scrolling crosses into it, which is a worse bug than the one it fixes.
    //
    // ASSERTED AS BEHAVIOUR, NOT AS ONE LINE OF SOURCE. This read the exact
    // early-return character for character until 2026-08-27, when needed the
    // effect to carry on past that point to scroll the TREE — which has to
    // happen however she got to the file. The guard is still here and still
    // does the same thing; only its shape moved, and a test that fails on a
    // shape is a test that has to be edited to let a correct change land.
    expect(codeArtifact).toContain('fromScroll');
    const walk = codeArtifact.slice(codeArtifact.indexOf('const cameFromScroll'));
    expect(walk).toContain('if (cameFromScroll) fromScroll.current = false;');
    // The pull is INSIDE the guard: it runs only when she did not scroll here.
    const guard = walk.indexOf('if (!cameFromScroll)');
    const pull = walk.indexOf('body.scrollTop = Math.max(0, Math.min(max, body.scrollTop + delta))');
    expect(guard).toBeGreaterThan(-1);
    expect(pull).toBeGreaterThan(guard);
  });

  it('leaves every other field in the app alone', () => {
    // The composer is a contentEditable too. Only a `.code-line` is ours.
    expect(codeArtifact).toMatch(/closest\?\.\('\.code-line'\)/);
    expect(codeArtifact).toContain("tag === 'INPUT' || tag === 'TEXTAREA'");
  });
});
