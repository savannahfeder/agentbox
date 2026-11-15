// THE HIDDEN LINES BETWEEN TWO CHANGES OPEN IN PLACE.
//
// Found by the GPT-6.1-Sol tester on 2026-10-04: "139 lines not shown" was a
// sentence and not a control, so seeing the code around a change meant leaving
// the pane for an editor. Every diff view she compared it with (GitHub, VS
// Code, Cursor) opens the gap. Pressing it now reads the file and draws those
// lines where the sentence was.
//
// The lines come off the disk, which may have moved on since the change was
// made. So the two rows either side of the gap must still be where the change
// says they are, or nothing is drawn and she is told why: a confident wrong
// line in the middle of a diff is worse than a gap.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { hiddenLines } from '../renderer/src/code-artifact.ts';

const tsx = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');

// A twelve-line file; the change touched line 3 and line 10.
const FILE = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
const before = { rows: [['=', 'line 2'], ['+', 'line 3'], ['=', 'line 4']], nums: [[2, 2], [null, 3], [3, 4]] };
const after = { rows: [['=', 'line 9'], ['-', 'old 10'], ['+', 'line 10']], nums: [[8, 9], [9, null], [null, 10]] };

describe('the lines between two changes', () => {
  it('are the ones the gap stood for, numbered in the file as it is', () => {
    const r = hiddenLines(FILE, before, after);
    expect(r.ok).toBe(true);
    expect(r.from).toBe(5);
    expect(r.lines).toEqual(['line 5', 'line 6', 'line 7', 'line 8']);
  });

  it('are refused when the file has moved on since the change', () => {
    const moved = FILE.replace('line 9\n', 'line 9 edited later\n');
    const r = hiddenLines(moved, before, after);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/changed since/);
  });

  it('are refused when the change carries no line numbers', () => {
    const r = hiddenLines(FILE, { rows: before.rows }, { rows: after.rows });
    expect(r.ok).toBe(false);
  });

  it('are none when the two changes touch', () => {
    const next = { rows: [['=', 'line 5']], nums: [[4, 5]] };
    const r = hiddenLines(FILE, before, next);
    expect(r.ok).toBe(true);
    expect(r.lines).toEqual([]);
  });
});

describe('the pane', () => {
  it('makes the gap a button that reads the file', () => {
    expect(tsx).toMatch(/<button[^>]*className="code-skip"/);
    expect(tsx).toMatch(/hiddenLines\(/);
    expect(tsx).toMatch(/api\.codeFile\(/);
  });
});
