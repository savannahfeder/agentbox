import { walkFiles } from './code-keys';

// Pure helpers for a change opened in the pane, kept out of the component so
// they can be tested without a window.

/** One line of a change. `=` is context, `+` added, `-` removed. */
export type Row = ['=' | '+' | '-', string];

/**
 * A row's line number in the old file and in the new one, null on the side the
 * row does not exist in. `main/git-change.mjs` fills it from the `@@` header.
 *
 * Often absent. A change read from the conversation instead of git diffs one
 * edit's before against its after, so its offsets are inside a fragment, not
 * file lines. An empty gutter is better than a wrong number on every line.
 */
export type RowNums = [number | null, number | null];

/** A run of lines the agent touched, with the sentence it wrote just before. */
export type Hunk = {
  rows: Row[];
  /** One [old, new] per row, parallel to `rows`, when git supplied the change. */
  nums?: RowNums[];
  /** The agent's own words, immediately before this edit in the conversation. */
  said?: string;
  at?: number;
  plus?: number;
  minus?: number;
};

export type ChangedFile = {
  path: string;
  hunks: Hunk[];
  plus: number;
  minus: number;
  at?: number;
};

export type Change = {
  files: ChangedFile[];
  plus: number;
  minus: number;
  startedAt?: number;
  endedAt?: number;
  editCount?: number;
};

export function isChangePath(path: string | undefined | null): boolean {
  if (!path) return false;
  return /\.change$/i.test(String(path).split(/[?#]/)[0]);
}

/**
 * Where one item's change is, product-relative. It has to match `changePath` in
 * main/code-change.mjs, which writes the file this opens.
 */
export function changePathFor(itemId: string): string {
  return `runs/${itemId}/the-change-it-made.change`;
}

export type TreeRow =
  | { kind: 'folder'; label: string; depth: number; key: string; plus: number; minus: number; files: number }
  | { kind: 'file'; label: string; depth: number; key: string; path: string; plus: number; minus: number };

type Node = { name: string; children: Map<string, Node>; file: ChangedFile | null };

function emptyNode(name: string): Node {
  return { name, children: new Map(), file: null };
}

/**
 * The changed files as a folder tree. A chain of folders with one child each is
 * one row (`renderer/src`, not `renderer` then `src`). Folders come before
 * files at every level, each sorted by name, as in a file browser.
 */
export function treeRows(files: ChangedFile[]): TreeRow[] {
  const root = emptyNode('');
  for (const file of files) {
    const parts = String(file.path).split('/').filter(Boolean);
    let at = root;
    for (const part of parts.slice(0, -1)) {
      if (!at.children.has(part)) at.children.set(part, emptyNode(part));
      at = at.children.get(part)!;
    }
    const leaf = parts[parts.length - 1] ?? file.path;
    const node = emptyNode(leaf);
    node.file = file;
    at.children.set(leaf, node);
  }

  const out: TreeRow[] = [];
  const walk = (node: Node, depth: number, prefix: string) => {
    const kids = [...node.children.values()];
    const folders = kids.filter((k) => !k.file).sort((a, b) => a.name.localeCompare(b.name));
    const leaves = kids.filter((k) => k.file).sort((a, b) => a.name.localeCompare(b.name));
    for (const folder of folders) {
      let label = folder.name;
      let cur = folder;
      while (cur.children.size === 1) {
        const only = [...cur.children.values()][0];
        if (only.file) break;
        label += `/${only.name}`;
        cur = only;
      }
      const under = filesUnder(cur);
      out.push({
        kind: 'folder',
        label,
        depth,
        key: `${prefix}${label}/`,
        plus: under.reduce((n, f) => n + (f.plus ?? 0), 0),
        minus: under.reduce((n, f) => n + (f.minus ?? 0), 0),
        files: under.length,
      });
      walk(cur, depth + 1, `${prefix}${label}/`);
    }
    for (const leaf of leaves) {
      out.push({
        kind: 'file',
        label: leaf.name,
        depth,
        key: leaf.file!.path,
        path: leaf.file!.path,
        plus: leaf.file!.plus ?? 0,
        minus: leaf.file!.minus ?? 0,
      });
    }
  };
  walk(root, 0, '');
  return out;
}

function filesUnder(node: Node): ChangedFile[] {
  if (node.file) return [node.file];
  return [...node.children.values()].flatMap(filesUnder);
}

/** The tree rows left once the contents of every shut folder are hidden. */
export function visibleRows(rows: TreeRow[], shut: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = [];
  let hidingAt: number | null = null;
  for (const row of rows) {
    if (hidingAt !== null && row.depth > hidingAt) continue;
    hidingAt = null;
    out.push(row);
    if (row.kind === 'folder' && shut.has(row.key)) hidingAt = row.depth;
  }
  return out;
}

/** "11 files", "1 file". */
export function fileCount(n: number): string {
  return n === 1 ? '1 file' : `${n} files`;
}

/** The whole change in one line, for the card and for the pane's own heading. */
export function changeSummary(change: Change): string {
  const files = change.files?.length ?? 0;
  return `${fileCount(files)} +${change.plus ?? 0} −${change.minus ?? 0}`;
}

/** How long the run took, in words. Empty when it is not known. */
export function tookLabel(change: Change): string {
  const from = change.startedAt ?? 0;
  const to = change.endedAt ?? 0;
  if (!from || !to || to <= from) return '';
  const mins = Math.round((to - from) / 60_000);
  if (mins < 1) return 'under a minute';
  if (mins === 1) return '1 minute';
  if (mins < 60) return `${mins} minutes`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

// Each class is one token in the stylesheet, so every skin colours code in one
// place. A property that is only read stays uncoloured on purpose, because
// colouring every word stops reading as syntax.
export type Tok = { c: '' | 'com' | 'str' | 'kw' | 'num' | 'typ' | 'fn' | 'def' | 'con'; s: string };

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'of', 'in',
  'import', 'from', 'export', 'default', 'class', 'extends', 'new', 'await', 'async',
  'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'delete', 'void',
  'type', 'interface', 'enum', 'as', 'null', 'undefined', 'true', 'false', 'this',
  'switch', 'case', 'break', 'continue', 'do', 'yield', 'static', 'public', 'private',
  'def', 'elif', 'lambda', 'None', 'True', 'False', 'pass', 'raise', 'with',
]);

/** The words after which the next name, or every name in the next pattern, is being made. */
const DECLARES = new Set(['const', 'let', 'var']);
/** The words after which the next name is a function being defined. */
const NAMES_A_FUNCTION = new Set(['function', 'def']);
/** Built-in types, which are lower case and so would otherwise be ink. */
const BUILTIN_TYPES = new Set(['number', 'string', 'boolean', 'bigint', 'symbol', 'object', 'any', 'unknown', 'never']);

/**
 * Whether the text right after a name runs it: `(`, `?.(`, or a type argument
 * written against the name and closed before a `(`, as in `useState<T>(`. A
 * comparison is not one: `a < b` has a space, and `&&`, `||` or a bracket
 * inside the angle brackets is an expression, not a type.
 */
function runsAt(after: string): boolean {
  if (/^\s*(\?\.)?\(/.test(after)) return true;
  if (after[0] !== '<') return false;
  let depth = 0;
  for (let j = 0; j < Math.min(after.length, 120); j += 1) {
    const ch = after[j];
    if (ch === '<') depth += 1;
    else if (ch === '>') { depth -= 1; if (depth === 0) return after[j + 1] === '('; }
    else if (ch === '(' || ch === ')' || ch === ';') return false;
    else if ((ch === '&' || ch === '|') && after[j + 1] === ch) return false;
  }
  return false;
}

/**
 * One line of source, split into the kinds above. Deliberately a lexer for one
 * line and not a parser: a diff hands you lines out of context, so anything
 * with state across lines (a block comment, a template literal) would be
 * guessing. A line that opens `/*` and never closes it simply keeps its ink.
 */
export function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const push = (c: Tok['c'], s: string) => { if (s) out.push({ c, s }); };
  let i = 0;
  let plain = '';
  const flush = () => { push('', plain); plain = ''; };
  // What the last keyword promised about the next name: one being made, a
  // function being defined, or (inside `[ ]` or `{ }` after `const`) a pattern
  // of them, `depth` deep.
  let declaring = false;
  let naming = false;
  let depth = 0;
  // The inside of a `/** */` block is the one cross-line state that announces
  // itself on every line: a leading `*` then a space, a `/` or nothing.
  const lead = line.match(/^\s*(?=\*(\s|\/|$))/);
  if (lead) { push('', lead[0]); push('com', line.slice(lead[0].length)); return out; }
  while (i < line.length) {
    const rest = line.slice(i);
    const two = rest.slice(0, 2);
    if (two === '//' || two === '/*') { flush(); push('com', rest); return out; }
    if (rest[0] === '#' && /^#(!|\s)/.test(rest)) { flush(); push('com', rest); return out; }
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === '\\') { j += 2; continue; }
        if (rest[j] === quote) { j += 1; break; }
        j += 1;
      }
      flush(); push('str', rest.slice(0, j)); i += j; continue;
    }
    const word = rest.match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      const w = word[0];
      const after = rest.slice(w.length);
      flush();
      if (KEYWORDS.has(w)) {
        push('kw', w);
        declaring = DECLARES.has(w);
        naming = NAMES_A_FUNCTION.has(w);
      } else if (naming) { push('fn', w); naming = false; }
      else if (declaring) { push('def', w); declaring = false; }
      // In a pattern, `a: renamed` makes `renamed`; `a` is the key it reads.
      else if (depth > 0) push(/^\s*:/.test(after) ? '' : 'def', w);
      else if (BUILTIN_TYPES.has(w)) push('typ', w);
      else if (w.length > 1 && /^[A-Z][A-Z0-9_]*$/.test(w)) push('con', w);
      else if (/^[A-Z]/.test(w)) push('typ', w);
      else if (runsAt(after)) push('fn', w);
      else push('', w);
      i += w.length; continue;
    }
    const num = rest.match(/^\d[\d_.a-fA-FxX]*/);
    if (num) { flush(); push('num', num[0]); i += num[0].length; continue; }
    if (two === '=>') { flush(); push('kw', two); i += 2; declaring = false; naming = false; continue; }
    const ch = rest[0];
    if (declaring && (ch === '[' || ch === '{')) { declaring = false; depth = 1; }
    else if (depth > 0 && (ch === '[' || ch === '{')) depth += 1;
    else if (depth > 0 && (ch === ']' || ch === '}')) depth -= 1;
    else if (!/[\s*]/.test(ch)) { declaring = false; naming = false; }
    plain += rest[0];
    i += 1;
  }
  flush();
  return out;
}

/**
 * The part of each line the other does not share, between their common start
 * and common end, or null when there is nothing worth marking
 * (tests/the-words-that-changed-are-marked.test.mjs).
 */
export function changedSpan(a: string, b: string): { minus: [number, number]; plus: [number, number] } | null {
  if (a === b) return null;
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a[p] === b[p]) p += 1;
  let s = 0;
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1;
  const minus: [number, number] = [p, a.length - s];
  const plus: [number, number] = [p, b.length - s];
  // A line that is mostly different is already shown by its colour, so past
  // this share nothing is marked.
  const share = Math.max((minus[1] - minus[0]) / Math.max(1, a.length), (plus[1] - plus[0]) / Math.max(1, b.length));
  return share > 0.6 ? null : { minus, plus };
}

/**
 * The changed span on each row of a hunk, parallel to `rows`, null where none.
 * A run of removed rows is paired, in order, with the run of added rows right
 * after it, which is how every diff reads a replacement; a row without a
 * partner, and anything across a context row, is left alone.
 */
export function wordChanges(rows: Row[]): ([number, number] | null)[] {
  const out: ([number, number] | null)[] = rows.map(() => null);
  let i = 0;
  while (i < rows.length) {
    if (rows[i][0] !== '-') { i += 1; continue; }
    const minusAt = i;
    while (i < rows.length && rows[i][0] === '-') i += 1;
    const plusAt = i;
    while (i < rows.length && rows[i][0] === '+') i += 1;
    const pairs = Math.min(plusAt - minusAt, i - plusAt);
    for (let k = 0; k < pairs; k++) {
      const span = changedSpan(rows[minusAt + k][1], rows[plusAt + k][1]);
      if (!span) continue;
      out[minusAt + k] = span.minus;
      out[plusAt + k] = span.plus;
    }
  }
  return out;
}

/** The tokens of a line, split at the changed span, with the ones inside it flagged. */
export function marked(toks: Tok[], span: [number, number] | null): (Tok & { hl?: boolean })[] {
  if (!span || span[0] >= span[1]) return toks;
  const out: (Tok & { hl?: boolean })[] = [];
  let at = 0;
  for (const t of toks) {
    const end = at + t.s.length;
    const cuts = [at, Math.min(Math.max(span[0], at), end), Math.min(Math.max(span[1], at), end), end];
    for (let k = 0; k < 3; k++) {
      const piece = t.s.slice(cuts[k] - at, cuts[k + 1] - at);
      if (piece) out.push(k === 1 ? { c: t.c, s: piece, hl: true } : { c: t.c, s: piece });
    }
    at = end;
  }
  return out;
}

// Every row of a hunk is drawn. A long hunk is preferred over hidden code.
export function hunkView(rows: Row[]): { rows: Row[]; hidden: number } {
  return { rows, hidden: 0 };
}

/**
 * Where each drawn row sits in its hunk, parallel to `hunkView(...).rows`. It
 * is the identity now, but renderer/src/code-edit.ts relies on it to put a
 * typed line back at the right place in the file.
 */
export function hunkViewAt(rows: Row[]): number[] {
  return rows.map((_, i) => i);
}

// The height of a hunk the browser skips with `content-visibility: auto`, so
// the scrollbar does not lurch as hunks come into view. `.code-row` is 12px
// mono at line-height 1.55 (18.6px) and `.code-hunk` adds 2px of padding top
// and bottom. The `auto` in `contain-intrinsic-size` makes the browser keep the
// real height once drawn, so a wrapped line corrects itself.
export const ROW_PX = 18.6;
export const HUNK_PAD_PX = 4;

/**
 * How many lines of the file lie between two hunks, so the pane can mark the
 * gap instead of drawing them as neighbours. Null when either hunk has no line
 * numbers (a change read from the conversation) or when the two touch.
 */
export function linesSkipped(before: Hunk | undefined, after: Hunk | undefined): number | null {
  const last = before?.nums?.[(before.nums?.length ?? 0) - 1];
  const first = after?.nums?.[0];
  if (!last || !first) return null;
  // Measured in the new file's numbering. A hunk can end on a removed line,
  // which has no new number, so the gap starts from the last row that has one.
  const endsAt = [...(before?.nums ?? [])].reverse().find((p) => p[1] != null)?.[1];
  const startsAt = (after?.nums ?? []).find((p) => p[1] != null)?.[1];
  if (endsAt == null || startsAt == null) return null;
  const gap = startsAt - endsAt - 1;
  return gap > 0 ? gap : null;
}

/**
 * The lines a gap between two hunks stood for, read from the file on disk now
 * and numbered from `from` (tests/the-hidden-lines-open-in-place.test.mjs).
 * The file may have moved on since the change, so the rows either side of the
 * gap must still match at their numbers, or only the reason comes back.
 */
export function hiddenLines(fileText: string, before: Hunk, after: Hunk):
  { ok: true; from: number; lines: string[] } | { ok: false; error: string } {
  const lastNew = (h: Hunk) => {
    for (let i = (h.nums?.length ?? 0) - 1; i >= 0; i--) if (h.nums![i][1] != null) return { n: h.nums![i][1]!, text: h.rows[i][1] };
    return null;
  };
  const firstNew = (h: Hunk) => {
    const i = (h.nums ?? []).findIndex((p) => p[1] != null);
    return i >= 0 ? { n: h.nums![i][1]!, text: h.rows[i][1] } : null;
  };
  const end = lastNew(before);
  const start = firstNew(after);
  if (!end || !start) return { ok: false, error: 'This change does not say which lines it skipped.' };
  const lines = String(fileText).split('\n');
  if (lines[end.n - 1] !== end.text || lines[start.n - 1] !== start.text) {
    return { ok: false, error: 'This file has changed since, so the lines in between could not be placed. Open it in your editor to read them.' };
  }
  return { ok: true, from: end.n + 1, lines: lines.slice(end.n, Math.max(end.n, start.n - 1)) };
}

/** A hunk's height in pixels before it is drawn, for `contain-intrinsic-size`. */
export function hunkGuessPx(rows: number): number {
  return Math.round(rows * ROW_PX + HUNK_PAD_PX);
}

// The browser skips off-screen code in slices of at most this many rows, about
// two screenfuls, rather than whole hunks. A hunk can be a whole new file, and
// scrolling into one would make the browser lay out every row of it in one
// frame. Pinned by tests/a-big-change-scrolls-without-stalling.test.mjs.
export const SLICE_ROWS = 48;

/** [from, to) row ranges cutting `n` rows into slices of at most SLICE_ROWS. */
export function rowSlices(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < n; a += SLICE_ROWS) out.push([a, Math.min(n, a + SLICE_ROWS)]);
  return out;
}

/** A slice's height before it is drawn: its rows, no padding of its own. */
export function sliceGuessPx(rows: number): number {
  return Math.round(rows * ROW_PX);
}

// Rows drawn in the first frame, so a huge change opens on a screenful instead
// of freezing the window. The rest fill in at idle moments, BATCH_ROWS at a
// time, which is small enough to fit between two frames while scrolling.
export const FIRST_ROWS = 2400;
export const BATCH_ROWS = 150;

/**
 * The next files to fill in: the one she is on, then the ones below her, then
 * the ones above, skipping what is drawn, up to `budget` rows and at least one.
 */
export function fillNext(files: ChangedFile[], drawn: ReadonlySet<number>, here: number, budget = BATCH_ROWS): number[] {
  const order = [here, ...Array.from({ length: files.length }, (_, i) => i).filter((i) => i > here),
    ...Array.from({ length: here }, (_, i) => here - 1 - i)];
  const out: number[] = [];
  let rows = 0;
  for (const i of order) {
    if (i < 0 || i >= files.length || drawn.has(i)) continue;
    const size = files[i].hunks.reduce((m, h) => m + h.rows.length, 0);
    if (out.length && rows + size > budget) break;
    out.push(i);
    rows += size;
  }
  return out;
}

/** Files to draw at once: up to the row budget, at least one, always through `atLeast`. */
export function firstBatch(files: ChangedFile[], atLeast: number, budget = FIRST_ROWS): number {
  let rows = 0;
  let n = 0;
  while (n < files.length) {
    const size = files[n].hunks.reduce((m, h) => m + h.rows.length, 0);
    if (n > atLeast && n > 0 && rows + size > budget) break;
    rows += size;
    n += 1;
  }
  return n;
}

/** The files in the tree's order, so the column reads in the same order as the tree. */
export function filesInTreeOrder(files: ChangedFile[]): ChangedFile[] {
  const order = new Map(treeRows(files).filter((r) => r.kind === 'file').map((r, i) => [(r as { path: string }).path, i]));
  return [...files].sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
}

// The files folded in each change, kept while the app runs so closing the pane
// does not lose them. Not saved to disk: a change reopened tomorrow is a fresh
// reading.
const FOLDS = new Map<string, Set<string>>();

/** The live set of folded file paths for one change; the same set every time. */
export function foldsFor(product: string, src: string): Set<string> {
  const key = `${product}\n${src}`;
  let set = FOLDS.get(key);
  if (!set) { set = new Set(); FOLDS.set(key, set); }
  return set;
}

/** A copy of `set` with `path` added if it was not there, taken away if it was. */
export function toggled(set: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(set);
  if (next.has(path)) next.delete(path); else next.add(path);
  return next;
}

/**
 * Where an arrow on the tree goes, as a path, or null for nowhere. `shown` is
 * the files the tree draws, `all` every file in the same order. Folding never
 * moves her (tests/folding-the-tree-never-moves-the-code.test.mjs), so she may
 * be in a file the tree hides; then down is the next shown file after hers and
 * up the one before.
 */
export function stepInTree(key: string, path: string | null, shown: string[], all: string[]): string | null {
  if (!shown.length) return null;
  if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return null;
  const here = path ? shown.indexOf(path) : -1;
  if (here >= 0 || key === 'Home' || key === 'End') {
    // walkFiles stops at the ends, which here means nowhere to go.
    const to = walkFiles(key, Math.max(0, here), shown.length);
    return to == null || (to === here) ? null : shown[to];
  }
  const down = key === 'ArrowDown';
  const rank = new Map(all.map((p, i) => [p, i]));
  const mine = path ? rank.get(path) ?? -1 : -1;
  const pick = down
    ? shown.find((p) => (rank.get(p) ?? -1) > mine)
    : [...shown].reverse().find((p) => (rank.get(p) ?? -1) < mine);
  return pick ?? null;
}

/** The agent's sentence over a change, cut at a word to one line's worth. */
export function saidLine(said: string | undefined | null, limit = 150): string {
  const clean = String(said ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const stop = cut.lastIndexOf(' ');
  return `${cut.slice(0, stop > 40 ? stop : limit)}…`;
}
