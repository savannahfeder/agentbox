// THE CHANGED FILES ARE FOLDERS, NOT A FLAT LIST —, 2026-08-23.
//
// A flat list is what all three of Cursor, the Codex app and Claude Code's
// desktop app draw. This is the one place v1 goes past them, on her word, so
// the tree's arithmetic is pinned here: the chain-folding that keeps it
// shallow, the order, and the counts a shut folder carries.
import { describe, it, expect } from 'vitest';
import {
  changeSummary, fileCount, filesInTreeOrder, hunkView, isChangePath, saidLine, tokenize, tookLabel,
  treeRows, visibleRows,
} from '../renderer/src/code-artifact.ts';

// The real change the drawings are made of: 48 edits over 11 files in one of
// her own conversations (designs//changes.json).
const FILES = [
  'renderer/src/App.tsx', 'renderer/src/components/Rail.tsx', 'main/main.mjs',
  'renderer/src/components/Browser.tsx', 'renderer/src/main.tsx',
  'renderer/src/components/Focus.tsx', 'renderer/src/components/Palette.tsx',
  'main/ipc.mjs', 'main/supervisor.mjs', 'renderer/src/format.ts', 'renderer/src/types.ts',
].map((path) => ({ path, hunks: [], plus: 3, minus: 1 }));

describe('a change is a kind of artifact', () => {
  it('opens a .change and nothing else', () => {
    expect(isChangePath('runs/w-c1d09f0638/the-change-it-made.change')).toBe(true);
    expect(isChangePath('STATE.md')).toBe(false);
    expect(isChangePath('designs/w-1/index.html')).toBe(false);
    expect(isChangePath(null)).toBe(false);
  });
});

describe('the changed files as folders', () => {
  const rows = treeRows(FILES);

  it('folds a chain of single-child folders into one row', () => {
    // `renderer` holds only `src`, so it never gets a line of its own.
    const labels = rows.filter((r) => r.kind === 'folder').map((r) => r.label);
    expect(labels).toContain('renderer/src');
    expect(labels).not.toContain('renderer');
  });

  it('stays 14 rows and two folders deep on a real eleven-file change', () => {
    // The naive tree is 15 rows and nests three folders deep, because
    // `renderer` and `src` each take a line to hold one child.
    expect(rows.length).toBe(14);
    expect(rows.filter((r) => r.kind === 'folder').length).toBe(3);
    expect(Math.max(...rows.map((r) => r.depth))).toBe(2);
  });

  it('puts folders before files and sorts both', () => {
    const top = rows.filter((r) => r.depth === 0);
    expect(top.map((r) => r.label)).toEqual(['main', 'renderer/src']);
    const main = rows.filter((r) => r.kind === 'file' && r.path.startsWith('main/'));
    expect(main.map((r) => r.label)).toEqual(['ipc.mjs', 'main.mjs', 'supervisor.mjs']);
  });

  it('carries the count and the totals of everything under a folder', () => {
    const src = rows.find((r) => r.kind === 'folder' && r.label === 'renderer/src');
    expect(src.files).toBe(8);
    expect(src.plus).toBe(24);
    expect(src.minus).toBe(8);
  });

  it('hides everything under a folder that is shut, and nothing beside it', () => {
    const shut = new Set(['renderer/src/']);
    const shown = visibleRows(rows, shut);
    expect(shown.some((r) => r.label === 'renderer/src')).toBe(true);
    expect(shown.some((r) => r.path === 'renderer/src/App.tsx')).toBe(false);
    expect(shown.some((r) => r.path === 'main/ipc.mjs')).toBe(true);
  });
});

describe('the running column and the tree agree', () => {
  it('draws the files in the order the tree lists them', () => {
    // J and K walk the tree; the column has to be the same order or the
    // keystroke jumps somewhere she is not looking.
    const inColumn = filesInTreeOrder(FILES).map((f) => f.path);
    const inTree = treeRows(FILES).filter((r) => r.kind === 'file').map((r) => r.path);
    expect(inColumn).toEqual(inTree);
  });

  // A run over 34 rows used to be cut to a head of 18, a tail of 6 and a button
  // in the gap. This is the test that fails if it comes back.
  it('draws a long run whole, with nothing behind a button', () => {
    const rows = Array.from({ length: 362 }, (_, i) => ['+', `line ${i}`]);
    const drawn = hunkView(rows);
    expect(drawn.rows.length).toBe(362);
    expect(drawn.hidden).toBe(0);
    expect(drawn.rows[0][1]).toBe('line 0');
    expect(drawn.rows[drawn.rows.length - 1][1]).toBe('line 361');
  });

  it('leaves an ordinary hunk whole', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ['=', `line ${i}`]);
    expect(hunkView(rows)).toEqual({ rows, hidden: 0 });
  });
});

describe('the words on the change', () => {
  it('never prints a bare number with no noun on it', () => {
    expect(fileCount(1)).toBe('1 file');
    expect(fileCount(11)).toBe('11 files');
  });

  it('says the whole change in one line', () => {
    expect(changeSummary({ files: FILES, plus: 287, minus: 74 })).toBe('11 files +287 −74');
  });

  it('says how long the run took, or says nothing', () => {
    expect(tookLabel({ files: [], plus: 0, minus: 0, startedAt: 0, endedAt: 0 })).toBe('');
    expect(tookLabel({ files: [], plus: 0, minus: 0, startedAt: 0, endedAt: 60_000 })).toBe('');
    const from = 1_785_706_116_205;
    expect(tookLabel({ files: [], plus: 0, minus: 0, startedAt: from, endedAt: from + 2_227_279 })).toBe('37 minutes');
  });

  it('keeps the agent sentence to one line and never cuts mid-word', () => {
    const long = `${'word '.repeat(60)}end`;
    const out = saidLine(long);
    expect(out.length).toBeLessThanOrEqual(151);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('wor…');
    expect(saidLine('Reading how the palette hands a command off.')).toBe('Reading how the palette hands a command off.');
  });
});

describe('the five code colours', () => {
  it('finds a comment, a string, a keyword, a number and a capitalised name', () => {
    const kinds = (line) => tokenize(line).filter((t) => t.c).map((t) => `${t.c}:${t.s}`);
    expect(kinds('// the way back')).toEqual(['com:// the way back']);
    // The name being made is coloured too since 2026-10-05
    // (tests/function-calls-and-new-names-are-coloured.test.mjs).
    expect(kinds("const x = 'hi'")).toEqual(['kw:const', 'def:x', "str:'hi'"]);
    expect(kinds('let n = 42')).toEqual(['kw:let', 'def:n', 'num:42']);
    expect(kinds('new Focus()')).toEqual(['kw:new', 'typ:Focus']);
  });

  it('never loses a character of the line', () => {
    for (const line of [
      "  const ref = useRef<HTMLTextAreaElement>(null); // keep it",
      '{modal === \'reply\' && focused && (',
      '',
      '\t\tif (!live) return;',
    ]) expect(tokenize(line).map((t) => t.s).join('')).toBe(line);
  });

  it('does not guess across lines', () => {
    // A line that opens a block comment and never closes it keeps its ink
    // rather than turning the rest of the file grey.
    expect(tokenize('const a = 1').every((t) => t.c !== 'com')).toBe(true);
  });
});
