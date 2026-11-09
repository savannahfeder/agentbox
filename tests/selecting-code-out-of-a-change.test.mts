// SELECTING CODE OUT OF A CHANGE, WITH THE KEYBOARD AND WITH A SHIFTED CLICK.
//
// ROUND FOUR, 2026-08-27. Round three gave the mouse DRAG the ability to take a
// block out of a change. It left the two other ways a person selects code, and
// both were still broken. Measured on the real pane through
// The harness before any of this existed:
//
//   holding shift and pressing down twice     reached 0 lines of the change
//   holding shift and pressing up twice       reached 1 line, the one she was in
//   clicking line one, shift-clicking line 7  reached 1 line
//   copying any of the above                  wrote NOTHING to the clipboard
//
// So a person who does not reach for a mouse could not copy two lines out of a
// diff, and neither could a person who uses click-then-shift-click, which is
// how most people take a long block.
//
// It is the same cause a fourth time, and it is worth writing down once more
// because every round has run into it: EVERY LINE IS ITS OWN one-line
// contentEditable, and a browser will not grow a selection out of the editing
// host it started in — not with a drag, not with a shifted arrow, not with a
// shifted click. `setBaseAndExtent` DOES cross one, which is what round three
// found and what all three gestures now use.
//
// AND ONE MORE, FOUND BY READING A COMMENT AGAINST A MEASUREMENT. code-copy.ts
// has said since it was written that the removed lines of a hunk are skipped
// "by the caller". Nothing skipped them: dragging across a deleted line and
// pasting handed back `const MAX_ROWS = 600;`, a line that is not in the file
// any more. A copy out of a diff is made to be pasted into code.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extendHead, extendsSelection } from '../renderer/src/code-keys.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');
const codeArtifact = read('renderer/src/components/CodeArtifact.tsx');

// Four lines of a change, as their lengths, which is all the rule needs.
const lens = [10, 4, 20, 7];

describe('the head of a selection, one shifted key at a time', () => {
  it('goes down into the next line, keeping the column she was in', () => {
    expect(extendHead('ArrowDown', { line: 0, col: 3 }, lens)).toEqual({ line: 1, col: 3 });
  });

  it('goes up into the line above', () => {
    expect(extendHead('ArrowUp', { line: 2, col: 5 }, lens)).toEqual({ line: 1, col: 4 });
  });

  it('clips the column to a shorter line rather than pointing past its end', () => {
    // Line 1 is four characters. A head at column 9 has to land at 4, not 9,
    // or setBaseAndExtent is handed an offset the node does not have.
    expect(extendHead('ArrowDown', { line: 0, col: 9 }, lens)).toEqual({ line: 1, col: 4 });
  });

  it('stops at the last line rather than wrapping round to the first', () => {
    // walkFiles stops at the ends for the same reason: a list that wraps sends
    // her somewhere she did not ask to go and reads as the pane losing her.
    expect(extendHead('ArrowDown', { line: 3, col: 2 }, lens)).toEqual({ line: 3, col: 7 });
    expect(extendHead('ArrowUp', { line: 0, col: 5 }, lens)).toEqual({ line: 0, col: 0 });
  });

  it('runs off the end of a line onto the front of the next, and back', () => {
    expect(extendHead('ArrowRight', { line: 0, col: 10 }, lens)).toEqual({ line: 1, col: 0 });
    expect(extendHead('ArrowLeft', { line: 1, col: 0 }, lens)).toEqual({ line: 0, col: 10 });
  });

  it('moves one character at a time inside a line', () => {
    expect(extendHead('ArrowRight', { line: 2, col: 4 }, lens)).toEqual({ line: 2, col: 5 });
    expect(extendHead('ArrowLeft', { line: 2, col: 4 }, lens)).toEqual({ line: 2, col: 3 });
  });

  it('takes the whole line with shift and home or end', () => {
    expect(extendHead('Home', { line: 2, col: 11 }, lens)).toEqual({ line: 2, col: 0 });
    expect(extendHead('End', { line: 2, col: 3 }, lens)).toEqual({ line: 2, col: 20 });
  });

  it('has nothing to say about a key that does not extend a selection', () => {
    expect(extendHead('PageDown', { line: 1, col: 0 }, lens)).toBe(null);
    expect(extendHead('a', { line: 1, col: 0 }, lens)).toBe(null);
    expect(extendsSelection('PageDown')).toBe(false);
    expect(extendsSelection('ArrowDown')).toBe(true);
  });

  it('answers nothing at all when there are no lines drawn', () => {
    expect(extendHead('ArrowDown', { line: 0, col: 0 }, [])).toBe(null);
  });
});

describe('the pane, where the rule meets the DOM', () => {
  it('extends the selection with the one call that crosses an editing host', () => {
    // Three gestures, one mechanism. If this ever goes back to letting the
    // browser do it, all three break together and silently.
    expect(codeArtifact).toContain('setBaseAndExtent');
    expect(codeArtifact).toContain('extendHead(');
    expect(codeArtifact).toContain('extendsSelection(');
  });

  it('hands the keyboard back once a selection leaves the line it started in', () => {
    // The line she started in is an editing host and still has focus, so a
    // keystroke would land inside it while six lines are selected.
    expect(codeArtifact).toMatch(/if \(to\.line !== anchor\.line\) \(document\.activeElement/);
  });

  it('remembers where a plain click landed, which is what a shifted one extends from', () => {
    expect(codeArtifact).toContain('clickAnchor');
    expect(codeArtifact).toMatch(/if \(e\.shiftKey && clickAnchor\.current && line\)/);
  });

  it('forgets the selection she was making the moment she presses something else', () => {
    expect(codeArtifact).toMatch(/if \(!e\.shiftKey\) keySel\.current = null;/);
  });

  it('keeps the removed lines of a hunk off her clipboard', () => {
    // A red line is not in the file any more, so it may not be pasted into one.
    expect(codeArtifact).toMatch(/classList\.contains\('cr-minus'\)/);
  });
});

describe('what she typed and has not saved, when the change is closed', () => {
  it('is kept outside the component, so unmounting the pane does not take it', () => {
    expect(codeArtifact).toContain('const KEPT = new Map');
    expect(codeArtifact).toContain('keepFor(product, src)');
  });

  it('never reaches disk, because an edit kept across a restart is measured against a file that moved', () => {
    expect(codeArtifact).not.toMatch(/localStorage[^\n]*(edit|kept|KEPT)/i);
  });

  it('is what the rows are drawn from when the change is opened again', () => {
    expect(codeArtifact).toMatch(/pending\?\.get\(at\[i\]\)/);
    expect(codeArtifact).toContain('seeded.current.get(file.path)');
  });
});
