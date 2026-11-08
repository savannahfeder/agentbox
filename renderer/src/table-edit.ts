// PURE. What a person does to a table once it is drawn: cells picked, typed
// over, copied and pasted the way a spreadsheet does it, rows and columns added
// and taken away, and the file written back in the shape it came in.
// TableView.tsx is the hands; nothing here touches a window.
import { isMarkdownTable, parseDelimited, sepFor, tagTone, type Column, type ColumnKind, type Table, type Tone } from './table-file';

export type At = { r: number; c: number };
/** `a` is where the pick began and stays; `b` is the end that moves. Rows are places in the view, not in the file. */
export type Pick = { a: At; b: At; rows?: boolean };
export type Box = { r0: number; r1: number; c0: number; c1: number };

export const boxOf = (p: Pick): Box => ({
  r0: Math.min(p.a.r, p.b.r), r1: Math.max(p.a.r, p.b.r),
  c0: Math.min(p.a.c, p.b.c), c1: Math.max(p.a.c, p.b.c),
});
export const inBox = (b: Box, r: number, c: number) => r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
export const cellsIn = (b: Box) => (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1);

/** The table's edges: the rows in view and the columns drawn (a ranked file's rank is the row number, not a column). */
export type Edges = { rows: number; first: number; last: number };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const clampAt = (at: At, e: Edges): At => ({ r: clamp(at.r, 0, Math.max(0, e.rows - 1)), c: clamp(at.c, e.first, e.last) });

/** Where an arrow, Tab, Home, End or a page key takes the moving end of the pick. */
export function moved(at: At, key: string, e: Edges, { jump = false, page = 10 } = {}): At {
  const { r, c } = at;
  const to = (() => {
    switch (key) {
      case 'ArrowUp': return { r: jump ? 0 : r - 1, c };
      case 'ArrowDown': return { r: jump ? e.rows - 1 : r + 1, c };
      case 'ArrowLeft': return { r, c: jump ? e.first : c - 1 };
      case 'ArrowRight': return { r, c: jump ? e.last : c + 1 };
      case 'Home': return jump ? { r: 0, c: e.first } : { r, c: e.first };
      case 'End': return jump ? { r: e.rows - 1, c: e.last } : { r, c: e.last };
      case 'PageUp': return { r: r - page, c };
      case 'PageDown': return { r: r + page, c };
      default: return at;
    }
  })();
  return clampAt(to, e);
}

// ---- The clipboard, as Google Sheets, Excel, Airtable and Numbers write it.

/** Cells as tab separated lines; a cell holding a tab, a line break or a quote is quoted. */
export function toClipboard(grid: string[][]): string {
  return grid.map((r) => r.map((v) => (/[\t\n\r"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join('\t')).join('\n');
}

/** What was copied, as rows of cells. One value stays one value, whatever it holds. */
export function fromClipboard(text: string): string[][] {
  const t = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!t.includes('\t') && !t.includes('\n')) return [[t]];
  if (!t.includes('\t') && !t.startsWith('"')) return t.split('\n').map((l) => [l.trim()]);
  const rows = parseDelimited(t, '\t');
  return rows.length ? rows : [['']];
}

/**
 * The cells a paste writes, from the top left of the pick. One value fills the
 * whole pick; a block that fits the pick a whole number of times is repeated
 * across it, as a spreadsheet does. Columns past the last are left off; rows
 * past the end are written, and the caller adds the rows they need.
 */
export function pasteInto(values: string[][], box: Box, lastCol: number): Array<{ r: number; c: number; v: string }> {
  const h = values.length;
  const w = Math.max(1, ...values.map((r) => r.length));
  const boxH = box.r1 - box.r0 + 1;
  const boxW = box.c1 - box.c0 + 1;
  const tiles = (boxH % h === 0 && boxW % w === 0) || (h === 1 && w === 1);
  const rows = tiles ? Math.max(boxH, h) : h;
  const cols = tiles ? Math.max(boxW, w) : w;
  const out: Array<{ r: number; c: number; v: string }> = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const c = box.c0 + j;
      if (c > lastCol) break;
      out.push({ r: box.r0 + i, c, v: values[i % h][j % w] ?? '' });
    }
  }
  return out;
}

// ---- The table changed. Every function returns a new table and leaves the old one as it was, which is what undo keeps.

/** A tag column learns a value it has not seen, in the colour its word means or the next in turn. */
export function learnTag(col: Column, value: string): Column {
  const v = value.trim();
  const key = v.toLowerCase();
  if (col.kind !== 'tag' || !v || col.values.some((x) => x.toLowerCase() === key)) return col;
  // A tag deleted and typed again keeps the colour it was given.
  return { ...col, values: [...col.values, v], tones: { ...col.tones, [key]: col.tones[key] ?? newTone(col, v) } };
}

/**
 * A new tag's colour: green or red when its word means done or lost; else the
 * colour its word means if no other tag has it, or the first in turn no tag has.
 */
export function newTone(col: Column, value: string): Tone {
  const used = new Set(col.values.map((x) => col.tones[x.toLowerCase()]));
  const meant = [0, 1, 2, 3].map((p) => tagTone(value, p, col.name));
  if (meant.every((t) => t === meant[0]) && (meant[0] === 'green' || meant[0] === 'rose' || !used.has(meant[0]))) return meant[0];
  const turns: Tone[] = ['blue', 'purple', 'amber', 'teal', 'grey'];
  return turns.find((t) => !used.has(t)) ?? turns[col.values.length % turns.length];
}

/** Cells written, by their row in the file. Only the rows touched are copied. */
export function writeCells(table: Table, writes: Array<{ i: number; c: number; v: string }>): Table {
  if (!writes.length) return table;
  const rows = table.rows.slice();
  const fresh = new Set<number>();
  let columns = table.columns;
  for (const { i, c, v } of writes) {
    if (!rows[i] || c < 0 || c >= columns.length) continue;
    if (!fresh.has(i)) { rows[i] = rows[i].slice(); fresh.add(i); }
    rows[i][c] = v;
    if (columns[c].kind === 'tag') {
      const learnt = learnTag(columns[c], v);
      if (learnt !== columns[c]) { columns = columns.slice(); columns[c] = learnt; }
    }
  }
  return { ...table, rows, columns };
}

// A ranked file whose ranks run 1, 2, 3 in file order keeps them running after
// rows come and go; ranks in any other order are the file's own and stay.
const countsUp = (t: Table) => t.ranked && t.rows.every((r, i) => (r[0] ?? '').trim().replace(/\.$/, '') === String(i + 1));
const renumbered = (rows: string[][]) => rows.map((r, i) => (r[0] === String(i + 1) ? r : [String(i + 1), ...r.slice(1)]));

/** Blank rows put in at `at` in the file. */
export function addRows(table: Table, at: number, n = 1): Table {
  const width = table.columns.length;
  const blank = Array.from({ length: n }, () => Array.from({ length: width }, () => ''));
  const rows = table.rows.slice();
  rows.splice(clamp(at, 0, rows.length), 0, ...blank);
  return { ...table, rows: countsUp(table) ? renumbered(rows) : rows };
}

export function dropRows(table: Table, gone: Set<number>): Table {
  const rows = table.rows.filter((_, i) => !gone.has(i));
  return { ...table, rows: countsUp(table) ? renumbered(rows) : rows };
}

/** The view's order after rows were taken out of the file: theirs gone, the rest renumbered. */
export function orderAfterDrop(order: number[], gone: Set<number>): number[] {
  const sorted = [...gone].sort((a, b) => a - b);
  const below = (i: number) => { let n = 0; while (n < sorted.length && sorted[n] < i) n++; return n; };
  return order.filter((i) => !gone.has(i)).map((i) => i - below(i));
}

/** The view's order after `n` rows were put in the file at `at`, shown from place `place` in the view. */
export function orderAfterAdd(order: number[], at: number, n: number, place: number): number[] {
  const out = order.map((i) => (i >= at ? i + n : i));
  out.splice(clamp(place, 0, out.length), 0, ...Array.from({ length: n }, (_, k) => at + k));
  return out;
}

const uniqueName = (columns: Column[], want: string, skip = -1) => {
  const base = want.trim() || `Column ${columns.length + 1}`;
  const taken = new Set(columns.filter((_, i) => i !== skip).map((c) => c.name.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
  return name;
};

/** An empty text column put in at `at`. */
export function addColumn(table: Table, at: number, want = ''): Table {
  const name = uniqueName(table.columns, want || `Column ${table.columns.length + 1}`);
  const columns = table.columns.slice();
  columns.splice(at, 0, { name, head: name, kind: 'text', values: [], tones: {} });
  const rows = table.rows.map((r) => { const n = r.slice(); n.splice(at, 0, ''); return n; });
  const logoCol = table.logoCol >= at ? table.logoCol + 1 : table.logoCol;
  return { ...table, columns, rows, logoCol };
}

export function dropColumn(table: Table, at: number): Table {
  if (table.columns.length <= 1 || (table.ranked && at === 0)) return table;
  const columns = table.columns.filter((_, i) => i !== at);
  const rows = table.rows.map((r) => r.filter((_, i) => i !== at));
  const logoCol = table.logoCol === at ? -1 : table.logoCol > at ? table.logoCol - 1 : table.logoCol;
  return { ...table, columns, rows, logoCol };
}

export function renameColumn(table: Table, at: number, want: string): Table {
  const col = table.columns[at];
  if (!col || !want.trim() || want.trim() === col.name) return table;
  const name = uniqueName(table.columns, want, at);
  const columns = table.columns.slice();
  columns[at] = { ...col, name, head: name };
  return { ...table, columns };
}

/** A column read as tags or as plain text, by the person's choice rather than the guess. */
export function showColumnAs(table: Table, at: number, kind: ColumnKind): Table {
  const col = table.columns[at];
  if (!col || col.kind === kind) return table;
  let next: Column = { ...col, kind, values: [], tones: {} };
  if (kind === 'tag') for (const r of table.rows) next = learnTag(next, r[at] ?? '');
  const columns = table.columns.slice();
  columns[at] = next;
  return { ...table, columns };
}

const sameTag = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A tag renamed in every cell that holds it. A name another tag has already merges the two. */
export function renameTag(table: Table, at: number, from: string, want: string): Table {
  const col = table.columns[at];
  const to = want.trim();
  if (!col || col.kind !== 'tag' || !to || to === from.trim()) return table;
  const into = col.values.find((v) => sameTag(v, to) && !sameTag(v, from));
  const written = into ?? to;
  const rows = table.rows.map((r) => (sameTag(r[at] ?? '', from) ? Object.assign(r.slice(), { [at]: written }) : r));
  const tones = { ...col.tones };
  const was = tones[from.trim().toLowerCase()];
  delete tones[from.trim().toLowerCase()];
  if (!into && was) tones[to.toLowerCase()] = was;
  const values = into ? col.values.filter((v) => !sameTag(v, from)) : col.values.map((v) => (sameTag(v, from) ? to : v));
  const columns = table.columns.slice();
  columns[at] = { ...col, values, tones };
  return { ...table, rows, columns };
}

/** A tag taken out of the column, and out of every cell that holds it. */
export function dropTag(table: Table, at: number, value: string): Table {
  const col = table.columns[at];
  if (!col || col.kind !== 'tag') return table;
  const rows = table.rows.map((r) => (sameTag(r[at] ?? '', value) ? Object.assign(r.slice(), { [at]: '' }) : r));
  const columns = table.columns.slice();
  columns[at] = { ...col, values: col.values.filter((v) => !sameTag(v, value)) };
  return { ...table, rows, columns };
}

// ---- What a person chose that a CSV cannot hold: a column's type and its tags'
// colours. Kept on this computer by column name, beside the widths.

/** `wrap`: the columns whose long text runs onto more lines rather than being cut off. */
export type Looks = { kinds: Record<string, ColumnKind>; tones: Record<string, Record<string, Tone>>; wrap?: Record<string, boolean> };
export const NO_LOOKS: Looks = { kinds: {}, tones: {} };

export function withLooks(table: Table, looks: Looks): Table {
  let t = table;
  t.columns.forEach((c, i) => {
    const kind = looks.kinds[c.name];
    if (kind && kind !== c.kind && !(t.ranked && i === 0)) t = showColumnAs(t, i, kind);
  });
  const wrap = looks.wrap ?? {};
  if (!t.columns.some((c) => (c.kind === 'tag' && looks.tones[c.name]) || !!wrap[c.name] !== !!c.wrap)) return t;
  const columns = t.columns.map((c) => {
    const next = c.kind === 'tag' && looks.tones[c.name] ? { ...c, tones: { ...c.tones, ...looks.tones[c.name] } } : c;
    return !!wrap[c.name] === !!c.wrap ? next : { ...next, wrap: !!wrap[c.name] };
  });
  return { ...t, columns };
}

export const lookWrap = (looks: Looks, column: string, on: boolean): Looks => {
  const { [column]: _, ...rest } = looks.wrap ?? {};
  return { ...looks, wrap: on ? { ...rest, [column]: true } : rest };
};

/** Every tag's colour as drawn now, kept: the guess deals colours out in order of first row, so moving rows would deal them again. */
export function pinTones(table: Table, looks: Looks): Looks {
  let tones = looks.tones;
  for (const c of table.columns) {
    if (c.kind !== 'tag') continue;
    const kept = tones[c.name] ?? {};
    const fresh = Object.entries(c.tones).filter(([k]) => !(k in kept));
    if (fresh.length) tones = { ...tones, [c.name]: { ...kept, ...Object.fromEntries(fresh) } };
  }
  return tones === looks.tones ? looks : { ...looks, tones };
}

export const lookKind =(looks: Looks, column: string, kind: ColumnKind): Looks => ({ ...looks, kinds: { ...looks.kinds, [column]: kind } });
export const lookTone = (looks: Looks, column: string, tag: string, tone: Tone): Looks =>
  ({ ...looks, tones: { ...looks.tones, [column]: { ...looks.tones[column], [tag.trim().toLowerCase()]: tone } } });

export function lookRenameColumn(looks: Looks, from: string, to: string): Looks {
  if (from === to || (!(from in looks.kinds) && !(from in looks.tones) && !(from in (looks.wrap ?? {})))) return looks;
  const move = <T,>(m: Record<string, T>) => {
    if (!(from in m)) return m;
    const { [from]: kept, ...rest } = m;
    return { ...rest, [to]: kept };
  };
  return { kinds: move(looks.kinds), tones: move(looks.tones), ...(looks.wrap ? { wrap: move(looks.wrap) } : {}) };
}

export function lookRenameTag(looks: Looks, column: string, from: string, to: string): Looks {
  const set = looks.tones[column];
  const key = from.trim().toLowerCase();
  if (!set || !(key in set)) return looks;
  const { [key]: tone, ...rest } = set;
  return { ...looks, tones: { ...looks.tones, [column]: { ...rest, [to.trim().toLowerCase()]: tone } } };
}

// ---- Rows and columns moved. `to[i]` is where what stood at `i` stands now.

/** The new order of places when those in `moving` go, in their order, just before place `before`. Null when nothing moves. */
function movedPlaces(length: number, moving: number[], before: number): number[] | null {
  const going = new Set(moving.filter((i) => i >= 0 && i < length));
  if (!going.size) return null;
  const stay = Array.from({ length }, (_, i) => i).filter((i) => !going.has(i));
  const at = stay.filter((i) => i < before).length;
  const places = [...stay.slice(0, at), ...[...going].sort((a, b) => a - b), ...stay.slice(at)];
  return places.every((p, i) => p === i) ? null : places;
}
const whereEachWent = (places: number[]) => {
  const to = places.slice();
  places.forEach((old, now) => { to[old] = now; });
  return to;
};

/** Rows of the file put just before the row at `before` (the row count puts them last). They need not stand together. */
export function moveRows(table: Table, rows: number[], before: number): { table: Table; to: number[] } {
  const places = movedPlaces(table.rows.length, rows, before);
  if (!places) return { table, to: table.rows.map((_, i) => i) };
  const list = places.map((i) => table.rows[i]);
  return { table: { ...table, rows: countsUp(table) ? renumbered(list) : list }, to: whereEachWent(places) };
}

/** Columns that stand together, put just before the column at `before`. A ranked file's rank stays first. */
export function moveColumns(table: Table, from: number, count: number, before: number): { table: Table; to: number[] } {
  const first = table.ranked ? 1 : 0;
  const places = from < first ? null : movedPlaces(table.columns.length, Array.from({ length: count }, (_, k) => from + k), Math.max(before, first));
  if (!places) return { table, to: table.columns.map((_, i) => i) };
  const to = whereEachWent(places);
  return {
    table: { ...table, columns: places.map((i) => table.columns[i]), rows: table.rows.map((r) => places.map((i) => r[i])), logoCol: table.logoCol < 0 ? -1 : to[table.logoCol] },
    to,
  };
}

/**
 * The columns the Filter menu offers, with the values to tick: every tag
 * column, and any other column whose values repeat from a short list (a city,
 * an owner, a plan), in A to Z order as first written.
 */
export function filterChoices(table: Table, most = 40): Array<{ col: number; values: string[] }> {
  return table.columns.flatMap((c, col) => {
    if (table.ranked && col === 0) return [];
    const blank = table.rows.some((r) => !(r[col] ?? '').trim());
    // '' stands for the empty cells, which a filter can ask for too.
    if (c.kind === 'tag') return c.values.length ? [{ col, values: blank ? [...c.values, ''] : c.values }] : [];
    if (c.kind === 'number' || c.kind === 'name') return [];
    const seen = new Map<string, string>();
    let filled = 0;
    for (const r of table.rows) {
      const v = (r[col] ?? '').trim();
      if (!v) continue;
      filled++;
      if (!seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
      if (seen.size > most) return [];
    }
    if (seen.size < 2 || seen.size > filled * 0.6) return [];
    return [{ col, values: [...[...seen.values()].sort((a, b) => a.localeCompare(b)), ...(blank ? [''] : [])] }];
  });
}

/**
 * A plain number typed into a column of amounts, written the way the column
 * writes them: "7200" in a column of "$1,200" is "$7,200". Anything else
 * typed is left exactly as it was.
 */
export function likeItsColumn(value: string, column: string[]): string {
  const v = value.trim();
  const m = v.match(/^(-?)(\d+)(\.\d+)?$/);
  if (!m) return value;
  const filled = column.map((x) => x.trim()).filter((x) => /\d/.test(x));
  if (!filled.length) return value;
  const most = (test: (x: string) => boolean) => filled.filter(test).length / filled.length >= 0.8;
  const sign = ['$', '€', '£'].find((c) => most((x) => x.replace(/^-/, '').startsWith(c))) ?? '';
  const big = filled.filter((x) => /\d{4,}|\d{1,3},\d{3}/.test(x));
  const grouped = big.length > 0 && big.filter((x) => /\d,\d{3}/.test(x)).length / big.length >= 0.8;
  const whole = grouped ? m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') : m[2];
  return `${m[1]}${sign}${whole}${m[3] ?? ''}`;
}

// ---- Back to the file.

export type Shape = { sep: string; eol: string; markdown: boolean; bom: boolean };

/** How the file was written, so a save writes it the same way. */
export function shapeOf(text: string, path: string): Shape {
  const src = String(text ?? '');
  return {
    sep: sepFor(src, path),
    eol: /\r\n/.test(src) ? '\r\n' : '\n',
    markdown: isMarkdownTable(src),
    bom: src.startsWith('﻿'),
  };
}

// The separator is read off the header line, so a header holding any of the
// three is quoted or a semicolon file would come back as a comma one.
const csvCell = (v: string, sep: string, head = false) =>
  (v.includes(sep) || /["\r\n]/.test(v) || v !== v.trim() || (head && /[,;\t]/.test(v)) ? `"${v.replace(/"/g, '""')}"` : v);
const mdCell = (v: string) => v.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

/** The table as the text of its file: the headers as the file had them, every row, the same separator and line ends. */
export function writeTable(table: Table, shape: Shape): string {
  const head = table.columns.map((c) => c.head);
  let lines: string[];
  if (shape.markdown) {
    const line = (cells: string[]) => `| ${cells.map(mdCell).join(' | ')} |`;
    lines = [line(head), `|${head.map(() => ' --- ').join('|')}|`, ...table.rows.map(line)];
  } else {
    lines = [head, ...table.rows].map((r, n) => r.map((v) => csvCell(v ?? '', shape.sep, n === 0)).join(shape.sep));
  }
  return `${shape.bom ? '﻿' : ''}${lines.join(shape.eol)}${shape.eol}`;
}
