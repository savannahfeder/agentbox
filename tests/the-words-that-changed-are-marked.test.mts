// THE WORDS THAT CHANGED ARE MARKED, NOT ONLY THE LINE.
//
// Found by the GPT-6.1-Sol tester on 2026-10-04: a removed line and its
// replacement were drawn as two whole coloured lines, so seeing that the only
// change to
//   import { listSharedProjects, joinSharedProject, markShared, makeDirect } from './projects.mjs';
// was `, ensurePersonalProject` meant comparing two long lines by eye. GitHub,
// VS Code and Cursor all mark the changed span inside the pair. Now so does
// this: the part the two lines do not share, between their common start and
// common end, and only when that part is a minority of the line (when a whole
// line is different, marking all of it says nothing the line colour did not).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { changedSpan, wordChanges, marked } from '../renderer/src/code-artifact.ts';

const tsx = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');
const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'styles.css'), 'utf8');

const OLD = "import { listSharedProjects, joinSharedProject, markShared, makeDirect } from './projects.mjs';";
const NEW = "import { listSharedProjects, joinSharedProject, markShared, makeDirect, ensurePersonalProject } from './projects.mjs';";

describe('the span two lines do not share', () => {
  it('finds the inserted words in the reported pair', () => {
    const s = changedSpan(OLD, NEW);
    expect(NEW.slice(...s.plus)).toBe(', ensurePersonalProject');
    expect(s.minus[0]).toBe(s.minus[1]);
  });

  it('finds a changed value in the middle of a line', () => {
    const s = changedSpan('const MAX_ROWS = 600;', 'const MAX_ROWS = 1200;');
    expect('const MAX_ROWS = 600;'.slice(...s.minus)).toBe('6');
    expect('const MAX_ROWS = 1200;'.slice(...s.plus)).toBe('12');
  });

  it('marks nothing when the lines are the same', () => {
    expect(changedSpan('a = 1;', 'a = 1;')).toBeNull();
  });

  it('marks nothing when most of the line is different', () => {
    expect(changedSpan('return foo(bar);', 'const x = await y.z();')).toBeNull();
  });
});

describe('which rows of a hunk get a span', () => {
  it('pairs a run of removed rows with the run of added rows after it, in order', () => {
    const rows = [['=', 'a'], ['-', OLD], ['+', NEW], ['=', 'b']];
    const w = wordChanges(rows);
    expect(w[0]).toBeNull();
    expect(w[3]).toBeNull();
    expect(NEW.slice(...w[2])).toBe(', ensurePersonalProject');
    expect(w[1]).toEqual([w[1][0], w[1][0]]);
  });

  it('leaves an added row with no partner alone', () => {
    const rows = [['-', 'let a = 1;'], ['+', 'let a = 2;'], ['+', 'let b = 3;']];
    const w = wordChanges(rows);
    expect(w[1]).not.toBeNull();
    expect(w[2]).toBeNull();
  });

  it('does not pair across a context row', () => {
    const rows = [['-', 'let a = 1;'], ['=', 'x'], ['+', 'let a = 2;']];
    expect(wordChanges(rows)).toEqual([null, null, null]);
  });
});

describe('the marked span is drawn over the colours, not instead of them', () => {
  it('splits the tokens at the span and flags the ones inside', () => {
    const toks = [{ c: 'kw', s: 'const' }, { c: '', s: ' x = ' }, { c: 'num', s: '600' }, { c: '', s: ';' }];
    const out = marked(toks, [10, 12]);
    expect(out.map((t) => t.s).join('')).toBe('const x = 600;');
    expect(out.filter((t) => t.hl).map((t) => t.s).join('')).toBe('60');
    expect(out.find((t) => t.hl).c).toBe('num');
  });

  it('is the identity with no span', () => {
    const toks = [{ c: '', s: 'abc' }];
    expect(marked(toks, null)).toEqual(toks);
  });

  it('is drawn by the pane and styled by the sheet', () => {
    expect(tsx).toMatch(/wordChanges\(/);
    expect(css).toMatch(/^\.cr-plus \.w-chg \{/m);
    expect(css).toMatch(/^\.cr-minus \.w-chg \{/m);
  });
});
