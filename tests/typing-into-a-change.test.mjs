// TYPING INTO A CHANGE AND PRESSING ⌘S.
//
// The requirement is that the edit is saved CORRECTLY, and that word carries
// the risk. What is on the screen is a few hunks out of a file of thousands of
// lines, so a save has to find the edited lines in the real bytes and change
// nothing else. These are the ways
// that can go wrong.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applySplices, postImage, editableRows, savedLine, unsavedIn } from '../renderer/src/code-edit.ts';
import { hunkViewAt, hunkView } from '../renderer/src/code-artifact.ts';
import { findFile, canWriteCode, writeCodeFile, readCodeFile } from '../main/code-file.mjs';
import { changeFromTranscript } from '../main/code-change.mjs';

const FILE = [
  'export function greet(name) {',
  '  const greeting = "hello";',
  '  return `${greeting}, ${name}`;',
  '}',
  '',
  'export const NAME = "world";',
].join('\n') + '\n';

/** The hunk the run wrote for the middle of that file. */
const hunk = () => ({
  rows: [
    ['=', 'export function greet(name) {'],
    ['-', '  const greeting = "hi";'],
    ['+', '  const greeting = "hello";'],
    ['=', '  return `${greeting}, ${name}`;'],
  ],
});

describe('what of a hunk she may type into', () => {
  it('is everything the run left behind, and not what it removed', () => {
    expect(postImage(hunk().rows)).toEqual([
      'export function greet(name) {',
      '  const greeting = "hello";',
      '  return `${greeting}, ${name}`;',
    ]);
    expect(editableRows(hunk().rows)).toEqual([0, 2, 3]);
  });
});

describe('a line she typed, put back into the file', () => {
  it('changes her line and leaves every other byte alone', () => {
    const out = applySplices(FILE, [{
      hunk: 0, rows: hunk().rows, edits: new Map([[2, '  const greeting = "howdy";']]),
    }]);
    expect(out.ok).toBe(true);
    expect(out.text).toBe(FILE.replace('"hello"', '"howdy"'));
    expect(out.lines).toBe(1);
  });

  it('keeps the file ending the way it found it', () => {
    const noNewline = FILE.slice(0, -1);
    const out = applySplices(noNewline, [{
      hunk: 0, rows: hunk().rows, edits: new Map([[2, '  const greeting = "howdy";']]),
    }]);
    expect(out.ok).toBe(true);
    expect(out.text.endsWith('\n')).toBe(false);
  });

  it('writes nothing at all when the file has moved on since the run', () => {
    const moved = FILE.replace('  const greeting = "hello";', '  const greeting = getGreeting();');
    const out = applySplices(moved, [{
      hunk: 0, rows: hunk().rows, edits: new Map([[2, '  const greeting = "howdy";']]),
    }]);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not in it any more/);
  });

  it('is a no-op when she typed nothing', () => {
    const out = applySplices(FILE, [{ hunk: 0, rows: hunk().rows, edits: new Map() }]);
    expect(out.ok).toBe(true);
    expect(out.text).toBe(FILE);
    expect(out.lines).toBe(0);
  });

  it('takes two edits in two hunks of the same file without one moving the other', () => {
    const rowsA = [['=', 'export function greet(name) {'], ['+', '  const greeting = "hello";']];
    const rowsB = [['=', ''], ['+', 'export const NAME = "world";']];
    const out = applySplices(FILE, [
      { hunk: 0, rows: rowsA, edits: new Map([[1, '  const greeting = "howdy";']]) },
      { hunk: 1, rows: rowsB, edits: new Map([[1, 'export const NAME = "earth";']]) },
    ]);
    expect(out.ok).toBe(true);
    expect(out.text).toContain('"howdy"');
    expect(out.text).toContain('"earth"');
    expect(out.lines).toBe(2);
  });

  it('refuses a hunk that only removed lines, rather than guessing where to put them', () => {
    const out = applySplices(FILE, [{
      hunk: 0, rows: [['-', 'gone']], edits: new Map([[0, 'back']]),
    }]);
    expect(out.ok).toBe(false);
  });

  it('takes the first place a repeated block sits, which is the same text either way', () => {
    const twice = 'a\nx\nb\na\nx\nb\n';
    const out = applySplices(twice, [{
      hunk: 0, rows: [['=', 'a'], ['+', 'x'], ['=', 'b']], edits: new Map([[1, 'y']]),
    }]);
    expect(out.ok).toBe(true);
    expect(out.text).toBe('a\ny\nb\na\nx\nb\n');
  });
});

// WHERE A ROW ON THE SCREEN SITS IN THE FILE. This is what stands between the
// user's words and the wrong line of somebody's source, so it stays tested even now
// that nothing is hidden and the answer is the row's own index. A fold coming
// back without this mapping following it is exactly the silent corruption the
// save path exists to make impossible.
describe('which row of the hunk a row on the screen is', () => {
  it('is itself on a short hunk', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ['+', `line ${i}`]);
    expect(hunkViewAt(rows)).toEqual([0, 1, 2, 3, 4]);
  });

  it('is itself on a long one too, and stays parallel to what is drawn', () => {
    const rows = Array.from({ length: 54 }, (_, i) => ['+', `line ${i}`]);
    const drawn = hunkView(rows);
    const at = hunkViewAt(rows);
    expect(at.length).toBe(drawn.rows.length);
    expect(at.length).toBe(rows.length);
    for (let i = 0; i < at.length; i++) expect(rows[at[i]][1]).toBe(drawn.rows[i][1]);
    expect(at[at.length - 1]).toBe(rows.length - 1);
  });
});

describe('finding the file a short path in a change belongs to', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'change-edit-'));
  const checkout = path.join(tmp, 'checkout');
  fs.mkdirSync(path.join(checkout, 'renderer', 'src'), { recursive: true });
  const real = path.join(checkout, 'renderer', 'src', 'api.ts');
  fs.writeFileSync(real, FILE);
  const product = { dir: path.join(tmp, 'docs'), repoPath: null };
  fs.mkdirSync(product.dir, { recursive: true });

  it('takes the absolute path the run recorded', () => {
    const change = { roots: [checkout], files: [{ path: 'renderer/src/api.ts', abs: real }] };
    expect(findFile({ change, product, filePath: 'renderer/src/api.ts' })).toEqual({ ok: true, path: real });
  });

  it('falls back to the roots when an older change has no absolute path', () => {
    const change = { roots: [checkout], files: [{ path: 'renderer/src/api.ts' }] };
    expect(findFile({ change, product, filePath: 'renderer/src/api.ts' })).toEqual({ ok: true, path: real });
  });

  it('says so plainly when the change has neither', () => {
    const change = { files: [{ path: 'renderer/src/api.ts' }] };
    const found = findFile({ change, product, filePath: 'renderer/src/api.ts' });
    expect(found.ok).toBe(false);
    expect(found.error).toMatch(/could not be found/);
  });

  it('will not open a file that is not part of the change', () => {
    const change = { roots: [checkout], files: [{ path: 'renderer/src/api.ts', abs: real }] };
    expect(findFile({ change, product, filePath: '../../../etc/passwd' }).ok).toBe(false);
  });

  it('will not write outside the folders the run worked in', () => {
    const change = { roots: [checkout], files: [] };
    const out = canWriteCode({ file: path.join(tmp, 'elsewhere.ts'), change, product });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/outside the folders/);
  });

  it('writes her text onto the file, and refuses once something else has moved it', () => {
    const change = { roots: [checkout], files: [{ path: 'renderer/src/api.ts', abs: real }] };
    const before = readCodeFile({ file: real });
    expect(before.ok).toBe(true);

    const wrote = writeCodeFile({ file: real, change, product, text: 'first\n', mtime: before.mtime });
    expect(wrote.ok).toBe(true);
    expect(fs.readFileSync(real, 'utf8')).toBe('first\n');

    // Somebody else's write lands, and hers is refused rather than winning.
    const stamp = Date.now() + 5000;
    fs.writeFileSync(real, 'somebody else\n');
    fs.utimesSync(real, new Date(stamp), new Date(stamp));
    const stale = writeCodeFile({ file: real, change, product, text: 'second\n', mtime: before.mtime });
    expect(stale.ok).toBe(false);
    expect(stale.stale).toBe(true);
    expect(fs.readFileSync(real, 'utf8')).toBe('somebody else\n');
  });
});

// The two fields a save needs are written by the run itself, so a change made
// tonight is editable tomorrow without anything else being remembered.
describe('what a run records so its change can be edited later', () => {
  const transcript = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-24T02:00:00.000Z',
    message: {
      content: [
        { type: 'text', text: 'Renaming the greeting.' },
        {
          type: 'tool_use',
          name: 'Edit',
          input: {
            file_path: '/work/checkout/renderer/src/api.ts',
            old_string: 'const greeting = "hi";',
            new_string: 'const greeting = "hello";',
          },
        },
      ],
    },
  });

  it('keeps the absolute path beside the short one', () => {
    const change = changeFromTranscript(transcript, { roots: ['/work/checkout'] });
    expect(change.files[0].path).toBe('renderer/src/api.ts');
    expect(change.files[0].abs).toBe('/work/checkout/renderer/src/api.ts');
  });

  it('keeps the folders the run worked in', () => {
    const change = changeFromTranscript(transcript, { roots: ['/work/checkout', '/docs'] });
    expect(change.roots).toEqual(['/work/checkout', '/docs']);
  });
});

describe('what it says once it worked', () => {
  it('names the file rather than saying only that it saved', () => {
    expect(savedLine('renderer/src/api.ts', 1)).toBe('Saved api.ts, 1 line.');
    expect(savedLine('renderer/src/api.ts', 3)).toBe('Saved api.ts, 3 lines.');
  });
});

// WHICH FILE SAYS "Unsaved" ON ITS OWN BAR, and when.
describe('which files have something unsaved in them', () => {
  const typed = (file, hunk, row, text) => {
    const byFile = new Map();
    byFile.set(hunk, new Map([[row, text]]));
    return [file, byFile];
  };

  it('is nothing at all until she types', () => {
    expect(unsavedIn(new Map())).toEqual([]);
  });

  it('is the file she typed in, and only that one', () => {
    const edits = new Map([
      typed('renderer/src/api.ts', 0, 2, '  const greeting = "howdy";'),
    ]);
    expect(unsavedIn(edits)).toEqual(['renderer/src/api.ts']);
  });

  it('is every file she typed in when there are several', () => {
    const edits = new Map([
      typed('renderer/src/api.ts', 0, 2, 'one'),
      typed('main/code-file.mjs', 1, 0, 'two'),
    ]);
    expect(unsavedIn(edits)).toEqual(['renderer/src/api.ts', 'main/code-file.mjs']);
  });

  it('is not a file whose edits were cleared by a save', () => {
    const edits = new Map([typed('renderer/src/api.ts', 0, 2, 'one')]);
    edits.delete('renderer/src/api.ts');
    expect(unsavedIn(edits)).toEqual([]);
  });

  it('is not a file that was opened and left alone', () => {
    const edits = new Map([['renderer/src/api.ts', new Map([[0, new Map()]])]]);
    expect(unsavedIn(edits)).toEqual([]);
  });
});
