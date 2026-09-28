// AN EDIT PRESSED AT A BLOCK OF LINES IS REFUSED, NOT HALF DONE.
//
// ROUND SIX. Round four gave the keyboard the ability to select a block of a
// change, and round five's rig then pressed the things a person presses AT a
// block, which had never been tried. Measured on the real pane
// (the harness, run of 2026-08-27):
//
//   four lines selected, one Backspace      changed 1 of the 4
//   four lines selected, typing a word      changed 1 of the 4, word landed in 1
//
// The change drew 833 lines before and 833 after in both. So what was left on
// her screen was not what a save would have written, the other three lines sat
// there still looking selected, and nothing anywhere said the press had reached
// a quarter of what she was pointing at. That is the silent half-edit, and it is
// the same fault this whole item was filed about in a different coat.
//
// THE ANSWER IS TO REFUSE THE PRESS, and the reason it is not to finish the
// delete is that finishing it has no meaning here. These are DIFF ROWS. A block
// can run across a removed line, which is not in the file at all, and across a
// hunk boundary, where the first line and the last are not neighbours in any
// file on disk. An edit across that boundary has no answer. Enter is already refused in this pane for the
// same reason: it does not add or remove whole lines.
//
// The selection is LEFT STANDING, because ⌘C over it is what round four built
// it for and is still the point of having it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editsAcrossLines, inputChangesText } from '../renderer/src/code-keys.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');
const codeArtifact = read('renderer/src/components/CodeArtifact.tsx');

describe('which keys would change the code', () => {
  it('refuses the two the rig caught: backspace and an ordinary letter', () => {
    expect(editsAcrossLines('Backspace')).toBe(true);
    expect(editsAcrossLines('a')).toBe(true);
  });

  it('refuses forward delete and Enter, which are the same edit by another key', () => {
    expect(editsAcrossLines('Delete')).toBe(true);
    expect(editsAcrossLines('Enter')).toBe(true);
  });

  it('lets every key that only moves her through', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'Tab', 'Shift']) {
      expect(editsAcrossLines(key)).toBe(false);
    }
  });

  it('lets ⌘C and ⌘S through, because the block is there to be copied and saved', () => {
    expect(editsAcrossLines('c', { meta: true })).toBe(false);
    expect(editsAcrossLines('s', { meta: true })).toBe(false);
  });

  it('names no key list it could fall out of date against', () => {
    // A printable character is one character long and every named key is
    // longer, which is the whole of the test and is why nothing here has to be
    // kept up with the keyboard.
    expect(editsAcrossLines('é')).toBe(true);
    expect(editsAcrossLines('MediaPlayPause')).toBe(false);
  });
});

describe('text that arrives without a key being pressed', () => {
  it('catches a paste, a cut and a drop, which never go through keydown', () => {
    expect(inputChangesText('insertFromPaste')).toBe(true);
    expect(inputChangesText('insertFromDrop')).toBe(true);
    expect(inputChangesText('deleteByCut')).toBe(true);
    expect(inputChangesText('deleteContentBackward')).toBe(true);
  });

  it('leaves the ones that change nothing', () => {
    expect(inputChangesText('historyUndo')).toBe(false);
    expect(inputChangesText('formatBold')).toBe(false);
  });
});

describe('the pane wires both of them up', () => {
  it('refuses the keystroke while more than one line is selected', () => {
    expect(codeArtifact).toMatch(/selectedLineCount\(\) > 1\s*\n?\s*&& editsAcrossLines\(/);
  });

  it('keeps the net under beforeinput too, since a paste is not a key', () => {
    expect(codeArtifact).toContain("window.addEventListener('beforeinput', onInput, true)");
    expect(codeArtifact).toMatch(/inputChangesText\(type\)/);
  });

  it('does not clear the selection on the way out, so ⌘C still has it', () => {
    // The guard returns before `keySel.current = null`, and it never touches
    // the DOM selection. If a session ever "tidies up" by collapsing it here,
    // copying a block after trying to delete one would quietly stop working.
    const guard = codeArtifact.slice(codeArtifact.indexOf('AN EDIT ACROSS LINES IS REFUSED'));
    const body = guard.slice(0, guard.indexOf('Anything else means the selection'));
    expect(body).not.toMatch(/removeAllRanges|collapse\(/);
  });
});
