// A three-way merge of plain text: by lines, then by words inside a changed line,
// because markdown keeps a whole paragraph on one line.

// Past this many differences two texts are not revisions of each other, and the
// trace below grows with its square.
const MAX_DIFFERENCES = 1500;
// Under this share of words in common, a matching word is chance, not a kept word.
const SAME_ENOUGH = 0.5;
const CONTEXT_CHARS = 32;

type Run = [aStart: number, aEnd: number, bStart: number, bEnd: number];

export interface TextChange { start: number; end: number; text: string }

export interface TextClash { base: string; head: string; mine: string }

export interface TextMerge { text: string; clashes: TextClash[]; ambiguous: boolean }

type SidedChange = TextChange & { side: 'head' | 'mine' };

const linesOf = (s: string): string[] => s.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const wordsOf = (s: string): string[] => s.match(/\s+|[\p{L}\p{N}_'’]+|[^\s\p{L}\p{N}_'’]/gu) ?? [];

/** Runs where `a` and `b` differ, as [aStart, aEnd, bStart, bEnd], or one run for the middle when too unlike. */
function differingRuns(a: readonly string[], b: readonly string[]): Run[] {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo += 1;
  let ae = a.length;
  let be = b.length;
  while (ae > lo && be > lo && a[ae - 1] === b[be - 1]) { ae -= 1; be -= 1; }
  if (ae === lo && be === lo) return [];
  if (ae === lo || be === lo) return [[lo, ae, lo, be]];
  const n = ae - lo;
  const m = be - lo;
  const most = Math.min(n + m, MAX_DIFFERENCES);
  // Myers' shortest edit: `v[mid + k]` is how far along `a` diagonal k has reached.
  const mid = most + 1;
  const v = new Int32Array(2 * most + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= most && found < 0; d += 1) {
    trace.push(v.slice(mid - d - 1, mid + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[mid + k - 1] < v[mid + k + 1]);
      let x = down ? v[mid + k + 1] : v[mid + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[lo + x] === b[lo + y]) { x += 1; y += 1; }
      v[mid + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
  }
  if (found < 0) return [[lo, ae, lo, be]];
  const runs: Run[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d -= 1) {
    // This round's snapshot starts at diagonal -d-1.
    const was = (k: number): number => trace[d][k + d + 1];
    const k = x - y;
    const down = k === -d || (k !== d && was(k - 1) < was(k + 1));
    const pk = down ? k + 1 : k - 1;
    const px = was(pk);
    const py = px - pk;
    while (x > px && y > py) { x -= 1; y -= 1; }
    const last = runs.at(-1);
    if (last && last[0] === x && last[2] === y) { last[0] = px; last[2] = py; } else runs.push([px, x, py, y]);
    x = px;
    y = py;
  }
  return runs.reverse().map(([a0, a1, b0, b1]): Run => [lo + a0, lo + a1, lo + b0, lo + b1]);
}

const offsets = (tokens: readonly string[]): number[] => {
  const out = [0];
  for (const t of tokens) out.push(out.at(-1)! + t.length);
  return out;
};
const sum = (tokens: readonly string[], from: number, to: number): string => tokens.slice(from, to).join('');

/** The changes that turn `a` into `b`: what to cut from `a`, by character, and what goes there. */
export function changes(a: string, b: string): TextChange[] {
  if (a === b) return [];
  const la = linesOf(a);
  const lb = linesOf(b);
  const oa = offsets(la);
  const out: TextChange[] = [];
  for (const [a0, a1, b0, b1] of differingRuns(la, lb)) {
    const start = oa[a0];
    const cut = sum(la, a0, a1);
    const put = sum(lb, b0, b1);
    const wa = wordsOf(cut);
    const wb = wordsOf(put);
    const runs = cut && put ? differingRuns(wa, wb) : null;
    const changed = runs ? runs.reduce((n, [x0, x1]) => n + (x1 - x0), 0) : 0;
    if (!runs || wa.length === 0 || (wa.length - changed) / Math.max(wa.length, wb.length) < SAME_ENOUGH) {
      out.push({ start, end: start + cut.length, text: put });
      continue;
    }
    const ow = offsets(wa);
    for (const [x0, x1, y0, y1] of runs) out.push({ start: start + ow[x0], end: start + ow[x1], text: sum(wb, y0, y1) });
  }
  return out;
}

/** How much differs between two texts, in characters cut and put. */
export function changeSize(a: string, b: string): number {
  return changes(a, b).reduce((n, c) => n + (c.end - c.start) + c.text.length, 0);
}

const applied = (base: string, from: number, to: number, list: readonly TextChange[]): string => {
  let out = '';
  let at = from;
  for (const c of list) {
    out += base.slice(at, c.start) + c.text;
    at = c.end;
  }
  return out + base.slice(at, to);
};

/** Could this change have been meant for another place just like it? */
const repeated = (base: string, c: TextChange): boolean => {
  const around = base.slice(Math.max(0, c.start - CONTEXT_CHARS), c.end + CONTEXT_CHARS);
  return base.indexOf(around) !== base.lastIndexOf(around);
};

/**
 * `base` changed two ways, into `head` and into `mine`: every change of both.
 * Where both changed the same words differently, `overlap` says whose stay and
 * `clashes` holds what each side wrote. `ambiguous` is true when a change sits in
 * text repeated word for word, so the merge had to guess which copy was meant.
 */
export function mergeText(base: string, head: string, mine: string, { overlap = 'mine' }: { overlap?: 'head' | 'mine' } = {}): TextMerge {
  const ours = changes(base, head).map((c): SidedChange => ({ ...c, side: 'head' }));
  const theirs = changes(base, mine).map((c): SidedChange => ({ ...c, side: 'mine' }));
  const all = [...ours, ...theirs].sort((x, y) => x.start - y.start || x.end - y.end);
  const groups: Array<{ start: number; end: number; list: SidedChange[] }> = [];
  for (const c of all) {
    const last = groups.at(-1);
    // Words put at the edge of someone's change sit beside it; only the same spot, or inside it, is a clash.
    if (last && (c.start < last.end || (c.start === c.end && last.start === last.end && c.start === last.start))) {
      last.list.push(c);
      last.end = Math.max(last.end, c.end);
    } else groups.push({ start: c.start, end: c.end, list: [c] });
  }
  let text = '';
  let at = 0;
  const clashes: TextClash[] = [];
  for (const g of groups) {
    text += base.slice(at, g.start);
    at = g.end;
    const headPart = applied(base, g.start, g.end, g.list.filter((c) => c.side === 'head'));
    const minePart = applied(base, g.start, g.end, g.list.filter((c) => c.side === 'mine'));
    const both = g.list.some((c) => c.side === 'head') && g.list.some((c) => c.side === 'mine');
    if (!both) text += g.list[0].side === 'head' ? headPart : minePart;
    else if (headPart === minePart) text += headPart;
    else {
      clashes.push({ base: base.slice(g.start, g.end), head: headPart, mine: minePart });
      text += overlap === 'head' ? headPart : minePart;
    }
  }
  text += base.slice(at);
  const ambiguous = ours.length > 0 && theirs.length > 0 && all.some((c) => repeated(base, c));
  return { text, clashes, ambiguous };
}
