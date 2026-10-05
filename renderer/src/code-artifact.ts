// PURE. What a change the agent made is, as a thing the pane can open.
//
// So a change is a THIRD KIND OF ARTIFACT, beside the markdown file and the
// html page the pane already opens, and it has a path like they do. The
// arithmetic and the naming live here, out of the component, so they can be
// tested without a window.

/** One line of a change. `=` is context, `+` added, `-` removed. */
export type Row = ['=' | '+' | '-', string];

/**
 * WHAT LINE EACH ROW WAS, in the old file and in the new one —.
 *
 * One pair per row, parallel to `rows`, null on the side a row does not exist
 * in: a removed line has no number in the new file, an added one none in the
 * old. `main/git-change.mjs` fills it off the `@@` header.
 *
 * IT IS OPTIONAL AND OFTEN ABSENT, and the pane has to keep drawing without it.
 * Only git knows these. A change read out of the CONVERSATION instead (a
 * product with no repository, or the drawings a run writes into the docs
 * folder, which is not a checkout) diffs one edit's own before against its
 * after, so its indexes are offsets inside a fragment and not file lines at
 * all. Inventing numbers from those would put a confident wrong number beside
 * every line, which is worse than an empty gutter.
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

/**
 * The kind of file this is. Kept beside `docKind` rather than inside it so the
 * pane's two settled kinds are not disturbed by a third.
 *
 * A change is written by the run as a file in the product's own folders, so it
 * gets a breadcrumb the same way every other artifact does and needs no new
 * idea of where an artifact lives.
 */
export function isChangePath(path: string | undefined | null): boolean {
  if (!path) return false;
  return /\.change$/i.test(String(path).split(/[?#]/)[0]);
}

/**
 * Where one item's change is, product-relative.
 *
 * The same string main/code-change.mjs writes it to (`changePath` there), and
 * the two have to stay the same string: this is what a chip in the chat asks
 * the pane to open, and a chip that opens nothing is the one thing the
 * attachment row on the card has refused to draw since 2026-08-19.
 */
export function changePathFor(itemId: string): string {
  return `runs/${itemId}/the-change-it-made.change`;
}

/* -------------------------------- the tree -------------------------------- */

export type TreeRow =
  | { kind: 'folder'; label: string; depth: number; key: string; plus: number; minus: number; files: number }
  | { kind: 'file'; label: string; depth: number; key: string; path: string; plus: number; minus: number };

type Node = { name: string; children: Map<string, Node>; file: ChangedFile | null };

function emptyNode(name: string): Node {
  return { name, children: new Map(), file: null };
}

/**
 * The changed files as folders, the way they sit in the repository.
 *
 * A CHAIN OF FOLDERS WITH ONE CHILD EACH IS ONE ROW, not two. `renderer/src`
 * holds four files and a components folder, so it is a folder; `renderer` holds
 * only `src`, so it never gets a line of its own. Measured on the real change
 * this was drawn against (48 edits, 11 files): the naive tree is 15 rows
 * nesting three folders deep, this one is 14 rows nesting two, and the two it
 * drops are the two that say nothing.
 *
 * Folders come before files at every level and both are alphabetical, which is
 * what a file browser does and what a new user already reads all day.
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
      // Fold a chain with a single folder child into one label.
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

/** The rows a shut folder hides, so folding one is one line of work. */
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

/* ------------------------------- the counts ------------------------------- */

/** "11 files", "1 file". Never a bare number with no noun on it. */
export function fileCount(n: number): string {
  return n === 1 ? '1 file' : `${n} files`;
}

/** The whole change in one line, for the card and for the pane's own heading. */
export function changeSummary(change: Change): string {
  const files = change.files?.length ?? 0;
  return `${fileCount(files)} +${change.plus ?? 0} −${change.minus ?? 0}`;
}

/** How long the run took, in the words she uses. Empty when it is not known. */
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

/* ----------------------------- the five colours ---------------------------- */
//
// AGENTBOX HAS NO CODE COLOURS AT ALL and this is the smallest set that reads as
// syntax rather than as a highlighter: a comment, a string, a keyword, a number
// and a name that starts with a capital. Everything else is the window's own
// ink. Five classes, five tokens in the stylesheet, so all sixteen skins answer
// them in one place instead of each carrying a theme of its own.

export type Tok = { c: '' | 'com' | 'str' | 'kw' | 'num' | 'typ'; s: string };

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'of', 'in',
  'import', 'from', 'export', 'default', 'class', 'extends', 'new', 'await', 'async',
  'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'delete', 'void',
  'type', 'interface', 'enum', 'as', 'null', 'undefined', 'true', 'false', 'this',
  'switch', 'case', 'break', 'continue', 'do', 'yield', 'static', 'public', 'private',
]);

/**
 * One line of source, split into the five. Deliberately a lexer for one line and
 * not a parser: a diff hands you lines out of context, so anything with state
 * across lines (a block comment, a template literal) would be guessing. A line
 * that opens `/*` and never closes it simply keeps its ink.
 */
export function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const push = (c: Tok['c'], s: string) => { if (s) out.push({ c, s }); };
  let i = 0;
  let plain = '';
  const flush = () => { push('', plain); plain = ''; };
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
      flush();
      if (KEYWORDS.has(w)) push('kw', w);
      else if (/^[A-Z]/.test(w)) push('typ', w);
      else push('', w);
      i += w.length; continue;
    }
    const num = rest.match(/^\d[\d_.a-fA-FxX]*/);
    if (num) { flush(); push('num', num[0]); i += num[0].length; continue; }
    plain += rest[0];
    i += 1;
  }
  flush();
  return out;
}

// NOTHING IS FOLDED. EVERY LINE OF A HUNK IS DRAWN.
//
// This used to cut any hunk over 34 rows down to a head of 18 and a tail of 6,
// with an "N more lines" button in the gap.
//
// What the fold was costing, measured over the last forty rounds merged onto
// main (scripts/measure-hunk-fold.mjs): it cut 1,110 of 3,284 hunks, put
// 147,520 of 206,845 lines behind a button, and 38 of those 40 changes had at
// least one. 71% of the code a card was carrying was not on the screen, and
// reading all of it was 1,110 presses.
//
// The reason it existed is real and is now simply accepted: a card whose whole
// new file arrives as one green run is long. Long is preferred over hidden.
export function hunkView(rows: Row[]): { rows: Row[]; hidden: number } {
  return { rows, hidden: 0 };
}

/**
 * Where each drawn row sits in the hunk it came from.
 *
 * Parallel to `hunkView(...).rows`, and now the identity, because nothing is
 * left out. It is kept rather than deleted because a line she types into has
 * to be put back at the right place in the file (renderer/src/code-edit.ts),
 * and that mapping is the one thing between the typed words and the wrong line of
 * somebody's source. It stays named so it stays checked.
 */
export function hunkViewAt(rows: Row[]): number[] {
  return rows.map((_, i) => i);
}

// HOW TALL A HUNK IS BEFORE ANYBODY HAS LOOKED AT IT.
//
// Taking the fold out meant the biggest measured change went from 961 rows on
// the screen to 2,946, and from 11,016 elements to 32,298. Measured with the
// processor turned down six times (scripts/measure-the-code-pane-lag.mjs),
// scrolling it end to end dropped 7 frames past 50ms where the folded one
// dropped none. A Mac running several agents at once is the real version of a
// slow processor, so that stutter is felt in real use.
//
// THE ANSWER IS NOT TO HIDE CODE AGAIN. `content-visibility: auto` on a hunk
// lets the browser skip the style, layout and paint of one that is nowhere near
// the window, while every row stays in the document: the text is still there to
// be selected, copied, walked with a key and saved. Nothing goes behind a
// button and nothing is missing; the browser stops drawing what is a thousand
// lines above her.
//
// A skipped hunk still needs a HEIGHT, or the scrollbar would lurch as each one
// came into view. `.code-row` is 12px of mono at line-height 1.55, so 18.6px,
// and `.code-hunk` adds 2px of padding top and bottom. That guess is exact for
// every line that does not wrap, and the `auto` keyword on the CSS property
// makes the browser keep the REAL height once it has drawn the hunk properly,
// so a wrapped line corrects itself the first time it is seen and stays
// corrected.
export const ROW_PX = 18.6;
export const HUNK_PAD_PX = 4;

/**
 * HOW MANY LINES WERE SKIPPED BETWEEN TWO HUNKS, or null when nobody knows.
 *
 * One reason it is unfamiliar is that hunks run together. The fold came out on
 * 2026-08-27 on her own instruction, and nothing replaced the thing it also
 * carried: a mark saying the code jumps here. So a file with edits at line 40
 * and line 900 drew them as neighbours, and the code read as continuous when it
 * is not. Every diff tool she has used says so, and this is that sentence
 * rather than the fold coming back: nothing to press, nothing hidden, just the
 * count.
 *
 * Null when either side has no numbers, which is every change read out of the
 * conversation rather than off git, and 0 or less when the two hunks genuinely
 * touch. Both draw nothing.
 */
export function linesSkipped(before: Hunk | undefined, after: Hunk | undefined): number | null {
  const last = before?.nums?.[(before.nums?.length ?? 0) - 1];
  const first = after?.nums?.[0];
  if (!last || !first) return null;
  // The new file's numbering, because that is the file she is looking at. A
  // hunk that ends on a removed line has no new number on its last row, so the
  // last row that HAS one is what the gap is measured from.
  const endsAt = [...(before?.nums ?? [])].reverse().find((p) => p[1] != null)?.[1];
  const startsAt = (after?.nums ?? []).find((p) => p[1] != null)?.[1];
  if (endsAt == null || startsAt == null) return null;
  const gap = startsAt - endsAt - 1;
  return gap > 0 ? gap : null;
}

/** A hunk's height in pixels before it is drawn, for `contain-intrinsic-size`. */
export function hunkGuessPx(rows: number): number {
  return Math.round(rows * ROW_PX + HUNK_PAD_PX);
}

// THE BROWSER SKIPS OFF-SCREEN CODE IN SLICES, NOT WHOLE HUNKS (2026-10-04).
//
// A hunk can be a whole new file: the largest real change had hunks of 808,
// 608 and 440 rows. With `content-visibility` on the hunk, scrolling one pixel
// into one made the browser style and lay out every row of it in a single
// frame, and sixty wheel ticks dropped 21 frames past 50ms. A slice of at most
// this many rows is about two screenfuls, so the work arrives a little at a
// time as she scrolls. tests/a-big-change-scrolls-without-stalling.test.mjs.
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

// HOW MANY FILES ARE DRAWN IN THE FIRST FRAME. The rest follow in idle moments
// straight after, so a 28,000-row change opens on a screenful instead of
// freezing the window for every row of it (4.7s at a quarter speed, measured).
// The median real change is 76 rows and is under the budget, so it is drawn
// whole at once exactly as before. A batch is small enough to fit the gap
// between two frames (400 rows cost about 40ms at half speed and dropped
// frames under a scrolling hand; 150 do not), so filling in is not felt.
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

/**
 * The files in the order the tree puts them, so J and K walk the list she is
 * looking at. Reading order in the running column and reading order in the tree
 * being two different orders is the one thing that makes a keystroke feel
 * broken.
 */
export function filesInTreeOrder(files: ChangedFile[]): ChangedFile[] {
  const order = new Map(treeRows(files).filter((r) => r.kind === 'file').map((r, i) => [(r as { path: string }).path, i]));
  return [...files].sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
}

/**
 * WHERE AN ARROW ON THE TREE GOES, as a path, or null for nowhere.
 *
 * `shown` is the files the tree draws (folding hides some), `all` every file in
 * the change in the same order. She may be standing in a file the tree is not
 * showing, because folding never moves her (since 2026-10-04,
 * tests/folding-the-tree-never-moves-the-code.test.mjs); then down is the next
 * file shown after hers and up the one before, rather than the top.
 */
export function stepInTree(key: string, path: string | null, shown: string[], all: string[]): string | null {
  if (!shown.length) return null;
  if (key === 'Home') return shown[0];
  if (key === 'End') return shown[shown.length - 1];
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
  const down = key === 'ArrowDown';
  const here = path ? shown.indexOf(path) : -1;
  if (here >= 0) {
    const to = here + (down ? 1 : -1);
    return to >= 0 && to < shown.length ? shown[to] : null;
  }
  const rank = new Map(all.map((p, i) => [p, i]));
  const mine = path ? rank.get(path) ?? -1 : -1;
  const pick = down
    ? shown.find((p) => (rank.get(p) ?? -1) > mine)
    : [...shown].reverse().find((p) => (rank.get(p) ?? -1) < mine);
  return pick ?? null;
}

/**
 * The agent's sentence over a change, trimmed to one line's worth.
 *
 * MEASURED ON HER MAC, 2026-08-23: 4,442 file-writing tool calls across the
 * sixty largest conversations, 99.7% have the agent's own prose earlier in the
 * same conversation, median 19 seconds before the change, median 91 characters.
 * So the sentence is nearly always there and nearly always short; this only
 * guards the tail.
 */
export function saidLine(said: string | undefined | null, limit = 150): string {
  const clean = String(said ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const stop = cut.lastIndexOf(' ');
  return `${cut.slice(0, stop > 40 ? stop : limit)}…`;
}
