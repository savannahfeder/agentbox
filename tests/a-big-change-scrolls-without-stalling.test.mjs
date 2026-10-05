// A BIG CHANGE SCROLLS WITHOUT STALLING, AND OPENS WITHOUT FREEZING THE WINDOW.
//
// "It feels laggy" (2026-10-04). Measured in the app's own Electron with the
// processor slowed four times, on the largest change in a real store (279 files,
// 28,103 rows; 13 of 649 real changes are over 5,000 rows):
//
// - 386,310 elements in the window.
// - Opening it froze the window for one 4,701ms frame.
// - Sixty wheel ticks dropped 21 frames past 50ms, the worst 250ms.
//
// Two causes, and these tests hold the fix for each.
//
// THE BROWSER SKIPPED OFF-SCREEN CODE ONE HUNK AT A TIME, and a hunk can be a
// whole new file: that change had hunks of 808, 608 and 440 rows. Scrolling one
// pixel into such a hunk made the browser style and lay out every row of it in
// one frame. Skipping now happens in slices of at most SLICE_ROWS rows.
//
// EVERY PLAIN WORD WAS ITS OWN <span>. A token with no colour is drawn as bare
// text now, which is the same text in the same place with one element fewer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { ROW_PX, SLICE_ROWS, rowSlices, sliceGuessPx, firstBatch, fillNext } from '../renderer/src/code-artifact.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer', 'src', 'styles.css'), 'utf8');
const tsx = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');

describe('off-screen code is skipped in small slices', () => {
  it('cuts a hunk into slices no longer than SLICE_ROWS', () => {
    expect(SLICE_ROWS).toBeLessThanOrEqual(64);
    expect(rowSlices(808)).toHaveLength(Math.ceil(808 / SLICE_ROWS));
    for (const [a, b] of rowSlices(808)) expect(b - a).toBeLessThanOrEqual(SLICE_ROWS);
  });

  it('covers every row exactly once, in order', () => {
    for (const n of [1, SLICE_ROWS - 1, SLICE_ROWS, SLICE_ROWS + 1, 808]) {
      const s = rowSlices(n);
      expect(s[0][0]).toBe(0);
      expect(s[s.length - 1][1]).toBe(n);
      for (let i = 1; i < s.length; i++) expect(s[i][0]).toBe(s[i - 1][1]);
    }
  });

  it('keeps a short hunk as one slice, and an empty one as none', () => {
    expect(rowSlices(3)).toEqual([[0, 3]]);
    expect(rowSlices(0)).toEqual([]);
  });

  it('stands a skipped slice at the height its rows will have', () => {
    expect(sliceGuessPx(10)).toBe(Math.round(10 * ROW_PX));
    expect(sliceGuessPx(SLICE_ROWS)).toBeGreaterThan(sliceGuessPx(SLICE_ROWS - 1));
  });

  it('puts content-visibility on the slice, sized off its own rows', () => {
    const rule = css.match(/^\.code-slice \{([^}]*)\}/m)?.[1] ?? '';
    expect(rule).toMatch(/content-visibility:\s*auto/);
    expect(tsx).toMatch(/containIntrinsicSize: `auto \$\{sliceGuessPx\(b - a\)\}px`/);
  });
});

describe('plain text is not wrapped in an element of its own', () => {
  it('draws an uncoloured token as bare text', () => {
    const code = tsx.slice(tsx.indexOf('function Code('), tsx.indexOf('function Counts('));
    expect(code).not.toMatch(/<span key=\{i\}>\{t\.s\}<\/span>/);
  });
});

describe('a big change is drawn a screenful first, the rest straight after', () => {
  const files = (sizes) => sizes.map((n, i) => ({ path: `f${i}`, plus: n, minus: 0, hunks: [{ rows: Array.from({ length: n }, () => ['+', 'x']) }] }));

  it('draws an ordinary change whole at once', () => {
    // The median real change is 76 rows; nothing about it should wait.
    expect(firstBatch(files([40, 30, 6]), 0)).toBe(3);
    expect(firstBatch(files([900, 900]), 0)).toBe(2);
  });

  it('draws a huge change up to a budget, never less than one file', () => {
    const big = files(Array.from({ length: 279 }, () => 100));
    const n = firstBatch(big, 0);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(279);
    expect(firstBatch(files([30000, 5]), 0)).toBe(1);
  });

  it('always includes the file it was asked to open at', () => {
    const big = files(Array.from({ length: 279 }, () => 100));
    expect(firstBatch(big, 250)).toBeGreaterThanOrEqual(251);
  });
});

describe('the rest is filled in nearest to where she is, never all at once', () => {
  // A fast scroll into code not drawn yet used to draw every file above it in
  // one go: a 754ms frame under her hand, measured at half speed.
  const files = (sizes) => sizes.map((n, i) => ({ path: `f${i}`, plus: n, minus: 0, hunks: [{ rows: Array.from({ length: n }, () => ['+', 'x']) }] }));
  const big = files(Array.from({ length: 100 }, () => 50));

  it('draws the file she is on first', () => {
    expect(fillNext(big, new Set([0, 1]), 60, 150)[0]).toBe(60);
  });

  it('then the files below her, then the ones above', () => {
    expect(fillNext(big, new Set([0, 1]), 60, 150)).toEqual([60, 61, 62]);
    expect(fillNext(big, new Set([0, 1, ...Array.from({ length: 39 }, (_, i) => 61 + i), 60]), 60, 150)).toEqual([59, 58, 57]);
  });

  it('never draws the files between the top and her in one go', () => {
    const plan = fillNext(big, new Set([0]), 99, 150);
    expect(plan.length).toBeLessThanOrEqual(3);
    expect(plan).not.toContain(1);
  });

  it('draws at least one file even when it is over the budget', () => {
    expect(fillNext(files([10, 5000]), new Set([0]), 1, 150)).toEqual([1]);
  });

  it('has nothing to do when everything is drawn', () => {
    expect(fillNext(files([10, 10]), new Set([0, 1]), 0, 150)).toEqual([]);
  });
});
