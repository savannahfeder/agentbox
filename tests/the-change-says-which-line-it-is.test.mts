// LINE NUMBERS, AND A MARK WHERE THE FILE JUMPS —, 2026-09-20.
//
// Two of the reasons were measurable. The pane had no line numbers anywhere,
// because `main/git-change.mjs` matched `@@` only to know a hunk had started and
// threw the header away with the numbers in it. And the hunks of a file ran
// together with nothing saying the code jumps between them, so a file edited at
// line 40 and at line 900 drew the two as neighbours.
import { it, expect, describe } from 'vitest';
import { filesFromPatch } from '../main/git-change.mjs';
import { linesSkipped } from '../renderer/src/code-artifact';

const patch = [
  'diff --git a/x.js b/x.js',
  '--- a/x.js',
  '+++ b/x.js',
  '@@ -12,4 +14,5 @@ around()',
  ' keep',
  '-gone',
  '+added',
  '+more',
  ' tail',
  '@@ -40,2 +43,2 @@',
  ' far',
  '-out',
  '+away',
].join('\n');

describe('the numbers come off the @@ header', () => {
  const file = filesFromPatch(patch)[0];

  it('numbers a context line in both files at once', () => {
    // `@@ -12,4 +14,5 @@` means old starts at 12 and new at 14.
    expect(file.hunks[0].nums[0]).toEqual([12, 14]);
  });

  it('gives a removed line a number only in the old file', () => {
    const i = file.hunks[0].rows.findIndex((r) => r[0] === '-');
    expect(file.hunks[0].nums[i]).toEqual([13, null]);
  });

  it('gives an added line a number only in the new file', () => {
    const i = file.hunks[0].rows.findIndex((r) => r[0] === '+');
    expect(file.hunks[0].nums[i]).toEqual([null, 15]);
  });

  it('keeps one number per row, in the order drawn', () => {
    for (const hunk of file.hunks) expect(hunk.nums).toHaveLength(hunk.rows.length);
  });

  it('starts the second hunk where its own header says, not after the first', () => {
    expect(file.hunks[1].nums[0]).toEqual([40, 43]);
  });

  it('says nothing when there is no header to read', () => {
    // A body with no `@@` never opens a hunk at all, so there is nothing to
    // number and nothing is invented.
    const none = filesFromPatch(['diff --git a/y.js b/y.js', '--- a/y.js', '+++ b/y.js', '+orphan'].join('\n'));
    expect(none).toEqual([]);
  });
});

describe('the gap between two hunks', () => {
  const file = filesFromPatch(patch)[0];

  it('counts the lines of the new file that are not drawn', () => {
    // The first hunk draws new lines 14, 15, 16, 17 (the removed one has no new
    // number at all), so it ends at 17. The second starts at 43. That leaves 25
    // lines of the file between them that are not on the screen.
    const gap = linesSkipped(file.hunks[0], file.hunks[1]);
    expect(gap).toBe(25);
    const endsAt = [...file.hunks[0].nums].reverse().find((p) => p[1] != null)[1];
    const startsAt = file.hunks[1].nums.find((p) => p[1] != null)[1];
    expect(endsAt + gap + 1).toBe(startsAt);
  });

  it('says nothing when the two hunks are neighbours', () => {
    const touching = [
      'diff --git a/z.js b/z.js', '--- a/z.js', '+++ b/z.js',
      '@@ -1,1 +1,1 @@', '-a', '+b',
      '@@ -2,1 +2,1 @@', '-c', '+d',
    ].join('\n');
    const z = filesFromPatch(touching)[0];
    expect(linesSkipped(z.hunks[0], z.hunks[1])).toBeNull();
  });

  it('says nothing at all when the change came out of the conversation', () => {
    // Those hunks have no `nums`, because their rows are offsets inside one
    // edit's own before and after and not file lines. A count derived from
    // them would be confidently wrong, which is worse than absent.
    expect(linesSkipped({ rows: [['+', 'a']] }, { rows: [['+', 'b']] })).toBeNull();
    expect(linesSkipped(undefined, undefined)).toBeNull();
  });
});

describe('the pane draws them', () => {
  const src = new URL('../renderer/src/components/CodeArtifact.tsx', import.meta.url);
  const code = require('node:fs').readFileSync(src, 'utf8');

  it('puts the number OUTSIDE the line, or a copy would carry it', () => {
    // Everything that reads the change reads `.code-line`: the clipboard, a
    // save finding its place in the file, and the arrow keys counting columns.
    const row = code.slice(code.indexOf('className={`code-row'), code.indexOf('<Code line={line} />'));
    expect(row.indexOf('code-num')).toBeLessThan(row.indexOf('className="code-line"'));
  });

  it('compares the number in the memo, or the gutter would go stale', () => {
    expect(code).toContain('a.num === b.num');
  });

  it('numbers a removed line in the old file and everything else in the new', () => {
    expect(code).toContain("const num = (mark === '-' ? pair?.[0] : pair?.[1]) ?? null;");
  });

  it('draws the jump only between hunks and only when it can count', () => {
    expect(code).toContain('i > 0 && linesSkipped(file.hunks[i - 1], hunk) !== null');
    expect(code).toContain('lines not shown');
  });
});
