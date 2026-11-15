// Three documents into one: the version a write started from, the version that
// is newest now, and the write itself. A write made from an older version is
// what loses somebody's edit, and merging it against the newest one keeps both.
//
// Line by line, and no further: a line only one side changed is taken from that
// side, a line both changed the same way is taken once, and a line both changed
// differently is a clash the caller has to answer for. Nothing is ever written
// with conflict markers in it, because a document a person reads is the point.

const MAX_LINES = 3000;
type Pair = [number, number];

export type MergeResult =
  | { ok: true; text: string }
  | { ok: false; clashes: number; tooBig?: undefined }
  | { ok: false; tooBig: true; clashes?: undefined };

const splitLines = (text: string | null | undefined): string[] => {
  const s = String(text ?? '');
  return s ? s.split(/(?<=\n)/) : [];
};

/**
 * How many lines apart two documents are, counting a line moved as no change.
 * Which version a write started from is not recorded anywhere, so this is how
 * it is found: the version a write is fewest lines from is the one it was
 * copied from, and that is the base the merge needs.
 */
export function lineGap(a: string | null | undefined, b: string | null | undefined): number {
  const held = new Map<string, number>();
  for (const l of splitLines(a)) held.set(l, (held.get(l) ?? 0) + 1);
  let gap = 0;
  for (const l of splitLines(b)) {
    const n = held.get(l) ?? 0;
    if (n > 0) held.set(l, n - 1); else gap += 1;
  }
  for (const n of held.values()) gap += n;
  return gap;
}

/**
 * The lines of `a` and `b` that are the same, as pairs of indexes, longest-first.
 * null when the two are too long to line up; the caller refuses rather than guesses.
 */
function samePairs(a: string[], b: string[]): Pair[] | null {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head
    && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  const A = a.slice(head, a.length - tail);
  const B = b.slice(head, b.length - tail);
  if (A.length > MAX_LINES || B.length > MAX_LINES) return null;
  const pairs: Pair[] = [];
  for (let i = 0; i < head; i += 1) pairs.push([i, i]);
  if (A.length && B.length) {
    const w = B.length + 1;
    const long = new Int32Array((A.length + 1) * w);
    for (let i = A.length - 1; i >= 0; i -= 1) {
      for (let j = B.length - 1; j >= 0; j -= 1) {
        long[i * w + j] = A[i] === B[j]
          ? long[(i + 1) * w + j + 1] + 1
          : Math.max(long[(i + 1) * w + j], long[i * w + j + 1]);
      }
    }
    let i = 0; let j = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) { pairs.push([head + i, head + j]); i += 1; j += 1; }
      else if (long[(i + 1) * w + j] >= long[i * w + j + 1]) i += 1;
      else j += 1;
    }
  }
  for (let k = 0; k < tail; k += 1) pairs.push([a.length - tail + k, b.length - tail + k]);
  return pairs;
}

const indexOfSame = (lines: string[], pairs: Pair[]): Int32Array => {
  const at = new Int32Array(lines.length).fill(-1);
  for (const [i, j] of pairs) at[i] = j;
  return at;
};

/**
 * `base` as both sides changed it. `{ ok: true, text }` when every change could
 * be kept; `{ ok: false, clashes }` when a run of lines was changed two ways, or
 * `{ ok: false, tooBig: true }` when the documents are too long to line up.
 */
export function mergeThree({ base, ours, theirs }: { base: string | null | undefined; ours: string | null | undefined; theirs: string | null | undefined }): MergeResult {
  const b = splitLines(base);
  const o = splitLines(ours);
  const t = splitLines(theirs);
  const toOurs = samePairs(b, o);
  const toTheirs = samePairs(b, t);
  if (!toOurs || !toTheirs) return { ok: false, tooBig: true };
  const inOurs = indexOfSame(b, toOurs);
  const inTheirs = indexOfSame(b, toTheirs);
  const out: string[] = [];
  let clashes = 0;
  let bi = 0; let oi = 0; let ti = 0;
  for (;;) {
    // The next line of the base that both sides still have, in order: everything
    // before it is one run of lines the two sides may each have changed.
    let k = bi;
    while (k < b.length && !(inOurs[k] >= oi && inTheirs[k] >= ti)) k += 1;
    const atEnd = k >= b.length;
    const was = b.slice(bi, atEnd ? b.length : k).join('');
    const mine = o.slice(oi, atEnd ? o.length : inOurs[k]).join('');
    const yours = t.slice(ti, atEnd ? t.length : inTheirs[k]).join('');
    if (mine === was) out.push(yours);
    else if (yours === was || yours === mine) out.push(mine);
    else { clashes += 1; out.push(mine); }
    if (atEnd) break;
    out.push(b[k]);
    oi = inOurs[k] + 1; ti = inTheirs[k] + 1; bi = k + 1;
  }
  return clashes ? { ok: false, clashes } : { ok: true, text: out.join('') };
}
