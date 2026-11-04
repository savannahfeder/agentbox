// PURE. Putting the user's edit back into the file WITHOUT rewriting the rest of it.
//
// THE PROBLEM, measured on a real store and not guessed. A rich
// editor does not hold markdown, it holds a document; saving means writing the
// document back out as markdown, and that output is NORMALISED. Across about a
// thousand markdown files, md -> editor -> md comes back byte-identical for
// fewer than half and cosmetically different for the rest. Restricted to the
// files actually NAMED on a card, which is the population this pane opens, it
// is about a quarter.
//
// None of that difference is content. It is `| | |` becoming `|  |  |`,
// `_word_` becoming `*word*`, a blank line inside a blockquote, a table's
// dashes getting spaces. But it would land on disk the moment the user typed one
// character into a document, on a file an agent will read next, and two of them
// (STATE.md, decisions.md) are how every session on the product stays in
// agreement. A save that quietly reflows 30,000 lines to change one word is not
// something to ship and then explain.
//
// THE FIX. The editor's own text is the yardstick, not the file:
//
//   base = what this file looks like once it has been through the editor
//   next = what it looks like after the user typed
//   the edit = the difference between those two, which is small and exact
//
// So the save takes the difference between base and next, maps it back onto the
// ORIGINAL file's lines, and splices it in. Every untouched line stays
// exactly the bytes it was. Only where the user typed does the editor's formatting
// win, which is the one place it should.
//
// When the mapping cannot be made exactly, this returns null and says nothing
// clever: the caller decides, and it chooses to leave the file alone rather
// than reformat it (DocText.tsx).

/** Split into lines, keeping the shape a trailing newline gives. */
function lines(text: string): string[] {
  return text.split('\n');
}

/** How many lines at the front of both arrays are the same. */
function commonPrefix(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/** How many lines at the end of both are the same, not overlapping the prefix. */
function commonSuffix(a: string[], b: string[], prefix: number): number {
  let i = 0;
  while (i < a.length - prefix && i < b.length - prefix && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

export type Hunk = { from: number; to: number; insert: string[] };

/**
 * Her edit, as ONE replacement of a line range. Everything she did in a session
 * of typing lands in one contiguous stretch far more often than not, and when
 * it does not, the range simply grows to cover both ends, which is still only
 * the part of the file between them.
 */
export function editHunk(base: string, next: string): Hunk | null {
  if (base === next) return null;
  const a = lines(base);
  const b = lines(next);
  const from = commonPrefix(a, b);
  const suffix = commonSuffix(a, b, from);
  return { from, to: a.length - suffix, insert: b.slice(from, b.length - suffix) };
}

/**
 * The lines that appear EXACTLY ONCE in both texts and are identical. Two files
 * that say the same thing in slightly different markdown still share nearly all
 * of their prose lines, and a line that is unique on both sides can only mean
 * one place. This is the same idea a patience diff uses, and it is what makes
 * the mapping below trustworthy without an O(n*m) table over a 30,000-line file.
 */
function anchors(base: string[], orig: string[]): Array<[number, number]> {
  const countIn = (arr: string[]) => {
    const seen = new Map<string, number>();
    arr.forEach((line) => { if (line.trim()) seen.set(line, (seen.get(line) ?? 0) + 1); });
    return seen;
  };
  const inBase = countIn(base);
  const inOrig = countIn(orig);
  const origAt = new Map<string, number>();
  orig.forEach((line, i) => { if (inOrig.get(line) === 1) origAt.set(line, i); });

  const found: Array<[number, number]> = [];
  base.forEach((line, i) => {
    if (inBase.get(line) !== 1) return;
    const j = origAt.get(line);
    if (j === undefined) return;
    // Keep the list rising on both sides; a pair that goes backwards is a
    // coincidence rather than the same place.
    if (found.length && j <= found[found.length - 1][1]) return;
    found.push([i, j]);
  });
  return found;
}

/**
 * One line number in `base`, as a line number in `orig`, or null when it cannot
 * be said exactly.
 *
 * Exactly means: the two anchors either side of it are the same distance apart
 * on both sides, so every line between them lines up one for one. If the gap
 * has a different length in the two texts then the drift is INSIDE the region
 * she edited, and there is no honest place to put the boundary.
 */
export function mapLine(index: number, pairs: Array<[number, number]>, baseLen: number, origLen: number): number | null {
  let before: [number, number] = [0, 0];
  let after: [number, number] = [baseLen, origLen];
  for (const pair of pairs) {
    if (pair[0] < index) before = pair;
    else { after = pair; break; }
  }
  const baseGap = after[0] - before[0];
  const origGap = after[1] - before[1];
  if (baseGap !== origGap) return null;
  return before[1] + (index - before[0]);
}

// Past this the table is too big to build while somebody types.
const MAX_DIFF_CELLS = 4_000_000;

/** The longest run of lines two lists share, as index pairs, comparing by `key`. An empty key matches nothing when `skipBlank`. */
function commonLines(a: string[], b: string[], key: (line: string) => string, skipBlank = false): Array<[number, number]> {
  const ka = a.map(key);
  const kb = b.map(key);
  const same = (i: number, j: number) => ka[i] === kb[j] && !(skipBlank && !ka[i]);
  const width = kb.length + 1;
  const table = new Uint32Array((ka.length + 1) * width);
  for (let i = ka.length - 1; i >= 0; i -= 1) {
    for (let j = kb.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = same(i, j) ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const out: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < ka.length && j < kb.length) {
    if (same(i, j)) { out.push([i, j]); i += 1; j += 1; }
    else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i += 1;
    else j += 1;
  }
  return out;
}

/** Her edits, each its own hunk, so the lines between two of them are nobody's edit. */
export function editHunks(base: string, next: string): Hunk[] {
  if (base === next) return [];
  const a = lines(base);
  const b = lines(next);
  const from = commonPrefix(a, b);
  const suffix = commonSuffix(a, b, from);
  const aEnd = a.length - suffix;
  const bEnd = b.length - suffix;
  const m = aEnd - from;
  const n = bEnd - from;
  if (m * n > MAX_DIFF_CELLS) return [{ from, to: aEnd, insert: b.slice(from, bEnd) }];
  const out: Hunk[] = [];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...commonLines(a.slice(from, aEnd), b.slice(from, bEnd), (x) => x), [m, n] as [number, number]]) {
    if (pi > i || pj > j) out.push({ from: from + i, to: from + pi, insert: b.slice(from + j, from + pj) });
    i = pi + 1;
    j = pj + 1;
  }
  return out;
}

// What the editor changes about a line is its marks and spacing, never its words.
const wordsOf = (line: string) => line.replace(/[\s*_`|\\:>-]/g, '').toLowerCase();

/** Lines of the editor's copy paired with the same lines in the file, however each spells them. */
function linesInBoth(base: string[], orig: string[]): Array<[number, number]> {
  if (base.length * orig.length > MAX_DIFF_CELLS) return anchors(base, orig);
  return commonLines(base, orig, wordsOf, true);
}

/**
 * The file with her edit in it, and every other byte untouched. A change whose
 * edges cannot be placed exactly rewrites the stretch between the nearest lines
 * that can, and nothing past them. `original` is what is on disk, `base` is that
 * text after a round trip through the editor, and `next` is what the editor holds.
 */
export function patchOriginal(original: string, base: string, next: string): string | null {
  if (base === next) return original;
  if (original === base) return next;

  const baseLines = lines(base);
  const origLines = lines(original);
  const pairs = linesInBoth(baseLines, origLines);
  const inOrig = new Map(pairs);
  const startOf = (i: number) => inOrig.get(i) ?? mapLine(i, pairs, baseLines.length, origLines.length);
  const endOf = (to: number, from: number) => {
    if (to > from && inOrig.has(to - 1)) return inOrig.get(to - 1)! + 1;
    return inOrig.get(to) ?? mapLine(to, pairs, baseLines.length, origLines.length);
  };

  const hunks = editHunks(base, next);
  const placed: Array<{ from: number; to: number; insert: string[] }> = [];
  for (let h = 0; h < hunks.length; h += 1) {
    const hunk = hunks[h];
    const from = startOf(hunk.from);
    const to = endOf(hunk.to, hunk.from);
    if (from !== null && to !== null && to >= from) { placed.push({ from, to, insert: hunk.insert }); continue; }
    let left: [number, number] = [-1, -1];
    let right: [number, number] = [baseLines.length, origLines.length];
    for (const pair of pairs) {
      if (pair[0] < hunk.from) left = pair;
      else if (pair[0] >= hunk.to) { right = pair; break; }
    }
    const rewritten = baseLines.slice(left[0] + 1, hunk.from).concat(hunk.insert);
    let at = hunk.to;
    while (h + 1 < hunks.length && hunks[h + 1].from < right[0]) {
      h += 1;
      rewritten.push(...baseLines.slice(at, hunks[h].from), ...hunks[h].insert);
      at = hunks[h].to;
    }
    rewritten.push(...baseLines.slice(at, right[0]));
    placed.push({ from: left[1] + 1, to: right[1], insert: rewritten });
  }

  const out: string[] = [];
  let at = 0;
  for (const p of placed) {
    if (p.from < at) return null;
    out.push(...origLines.slice(at, p.from), ...p.insert);
    at = p.to;
  }
  out.push(...origLines.slice(at));
  return out.join('\n');
}
