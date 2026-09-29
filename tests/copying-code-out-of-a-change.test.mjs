// WHAT SHE GETS WHEN SHE COPIES SOME OF A CHANGE.
//
// Rounds one and two were the keyboard. Round three pressed the mouse, and
// taking code out of the pane was broken in two ways at once.
//
// MEASURED ON THE REAL PANE, 2026-08-27: dragging
// down seven lines selected ONE line, fifteen characters, because a browser will
// not let a mouse selection leave the editing host it started in and every line
// of the change is its own. And what did reach the clipboard carried the diff's
// gutter — a bare "+" on a line of its own between code lines — which
// `user-select: none` does not stop.
//
// The drag is taken over in CodeArtifact.tsx; the text is built here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copiedText } from '../renderer/src/code-copy.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

describe('the text a copy puts on her clipboard', () => {
  it('joins the lines with newlines and nothing else', () => {
    expect(copiedText(['const a = 1;', 'const b = 2;', 'const c = 3;'], 0, 12))
      .toBe('const a = 1;\nconst b = 2;\nconst c = 3;');
  });

  it('clips the first line where the selection started', () => {
    expect(copiedText(['const a = 1;', 'const b = 2;'], 6, 12)).toBe('a = 1;\nconst b = 2;');
  });

  it('clips the last line where the selection ended', () => {
    expect(copiedText(['const a = 1;', 'const b = 2;'], 0, 5)).toBe('const a = 1;\nconst');
  });

  it('is one clip of one line when the selection never left it', () => {
    expect(copiedText(['const alpha = 1;'], 6, 11)).toBe('alpha');
  });

  it('carries no gutter mark, because the marks are not lines', () => {
    // The caller hands over the LINES the selection touched. The "+" and "−"
    // beside them live in a sibling element and never reach this.
    const out = copiedText(['import fs from "fs";', 'import path from "path";'], 0, 24);
    expect(out).not.toMatch(/[+−]/);
  });

  it('holds its nerve when the offsets are past the ends', () => {
    expect(copiedText(['abc', 'de'], 99, 99)).toBe('\nde');
    expect(copiedText(['abc', 'de'], -5, -5)).toBe('abc\n');
    expect(copiedText([], 0, 0)).toBe('');
  });

  it('keeps an empty line in the middle of a run', () => {
    expect(copiedText(['a', '', 'b'], 0, 1)).toBe('a\n\nb');
  });
});

describe('the pane hands the copy to this rule', () => {
  const pane = read('renderer', 'src', 'components', 'CodeArtifact.tsx');

  it('owns the copy event rather than leaving it to the browser', () => {
    expect(pane).toMatch(/addEventListener\('copy'/);
    expect(pane).toMatch(/copiedText\(/);
    expect(pane).toMatch(/setData\('text\/plain'/);
  });

  it('leaves a selection inside one line alone', () => {
    // A single line has no gutter and no header in it, so there is nothing to
    // improve and every reason not to interfere with a double click.
    expect(pane).toMatch(/lines\.length < 2\) return;/);
  });

  it('does not take over a double or triple click', () => {
    expect(pane).toMatch(/e\.detail > 1\) return;/);
  });
});

describe('folding a folder does not move her', () => {
  const pane = read('renderer', 'src', 'components', 'CodeArtifact.tsx');

  it('finds her file again by its path after the tree shortens', () => {
    // Measured 2026-08-27: standing on Rail.tsx, folding a folder she was not
    // in moved the tree to Shelf.tsx, because `at` is an index into the file
    // rows that are drawn and folding takes rows out of that list.
    expect(pane).toMatch(/const wasPath = current\?\.path \?\? null;/);
    expect(pane).toMatch(/findIndex\(\(f\) => f\.path === wasPath\)/);
  });
});
