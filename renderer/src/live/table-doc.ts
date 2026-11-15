// A TABLE AS A LIVE ROOM HOLDS IT: rows and columns as lists of ids, a header
// per column, and one entry per cell keyed by its row and column. Writers who
// change different cells never meet, a row added or taken away moves nobody's
// cell, and one cell changed two ways ends on one value on every copy.
import * as Y from 'yjs';

export interface LiveGrid { grid: string[][]; rowIds: string[]; colIds: string[] }

const newId = (): string => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const key = (r: string, c: string): string => `${r}|${c}`;

function parts(doc: Y.Doc) {
  return { rowIds: doc.getArray<string>('rowIds'), colIds: doc.getArray<string>('colIds'), heads: doc.getMap<string>('heads'), cells: doc.getMap<string>('cells') };
}

export const isSeeded = (doc: Y.Doc): boolean => parts(doc).colIds.length > 0;

/** Fills an empty room from a grid whose first row is the header. */
export function seedGrid(doc: Y.Doc, grid: string[][]): void {
  const { rowIds, colIds, heads, cells } = parts(doc);
  const [head = [], ...rows] = grid;
  doc.transact(() => {
    const cols = head.map(() => newId());
    colIds.push(cols);
    cols.forEach((c, i) => heads.set(c, head[i] ?? ''));
    const ids = rows.map(() => newId());
    rowIds.push(ids);
    rows.forEach((row, ri) => cols.forEach((c, ci) => { if (row[ci]) cells.set(key(ids[ri], c), row[ci]); }));
  });
}

/** The grid now, header first, with the ids its rows and columns go by. */
export function gridOf(doc: Y.Doc): LiveGrid {
  const { rowIds, colIds, heads, cells } = parts(doc);
  const cols = colIds.toArray();
  const rows = rowIds.toArray();
  const grid = [cols.map((c) => heads.get(c) ?? ''), ...rows.map((r) => cols.map((c) => cells.get(key(r, c)) ?? ''))];
  return { grid, rowIds: rows, colIds: cols };
}

/** Pairs of [old index, new index] for what stayed, matching by `same` and then by place. */
function matchUp<T>(before: T[], after: T[], same: (a: T, b: T) => boolean): [number, number][] {
  if (before.length === after.length) return before.map((_, i) => [i, i]);
  const n = before.length;
  const m = after.length;
  const w = m + 1;
  const long = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) {
    long[i * w + j] = same(before[i], after[j]) ? long[(i + 1) * w + j + 1] + 1 : Math.max(long[(i + 1) * w + j], long[i * w + j + 1]);
  }
  const pairs: [number, number][] = [];
  let i = 0; let j = 0; let gapI = 0; let gapJ = 0;
  const closeGap = () => {
    // Rows in the same gap on both sides were edited in place, not swapped.
    const k = Math.min(i - gapI, j - gapJ);
    for (let t = 0; t < k; t += 1) pairs.push([gapI + t, gapJ + t]);
  };
  while (i < n && j < m) {
    if (same(before[i], after[j])) { closeGap(); pairs.push([i, j]); i += 1; j += 1; gapI = i; gapJ = j; }
    else if (long[(i + 1) * w + j] >= long[i * w + j + 1]) i += 1;
    else j += 1;
  }
  i = n; j = m;
  closeGap();
  return pairs.sort((a, b) => a[1] - b[1]);
}

/**
 * Writes the change from `before` (what this copy showed, with its ids) to
 * `next` (the grid after the edit) into the room, by ids, so whatever others
 * changed meanwhile stays.
 */
export function putGrid(doc: Y.Doc, before: LiveGrid, next: string[][]): void {
  const { rowIds, colIds, heads, cells } = parts(doc);
  const [oldHead = [], ...oldRows] = before.grid;
  const [newHead = [], ...newRows] = next;
  const colPairs = matchUp(oldHead, newHead, (a, b) => a === b);
  const rowPairs = matchUp(oldRows, newRows, (a, b) => a.join('\u0001') === b.join('\u0001'));
  const colOf = new Map<number, string>(colPairs.map(([o, nw]) => [nw, before.colIds[o]]));
  const rowOf = new Map<number, string>(rowPairs.map(([o, nw]) => [nw, before.rowIds[o]]));
  const keptCols = new Set(colOf.values());
  const keptRows = new Set(rowOf.values());
  // Each is set by the time it is read: a kept place from the pairs, a new one just above.
  const idAt = (ids: Map<number, string>, j: number): string => ids.get(j) as string;
  const oldAt = (pairs: [number, number][], j: number): number => (pairs.find(([, nw]) => nw === j) as [number, number])[0];
  doc.transact(() => {
    for (const c of before.colIds) if (!keptCols.has(c)) { const at = colIds.toArray().indexOf(c); if (at >= 0) colIds.delete(at, 1); }
    for (const r of before.rowIds) if (!keptRows.has(r)) { const at = rowIds.toArray().indexOf(r); if (at >= 0) rowIds.delete(at, 1); }
    const place = (list: Y.Array<string>, ids: Map<number, string>, j: number, id: string) => {
      // After the one before it in the new order, wherever that is in the room now.
      const prev = j > 0 ? ids.get(j - 1) : null;
      const at = prev ? list.toArray().indexOf(prev) + 1 : 0;
      list.insert(at, [id]);
    };
    for (let j = 0; j < newHead.length; j += 1) {
      if (!colOf.has(j)) { const id = newId(); place(colIds, colOf, j, id); colOf.set(j, id); heads.set(id, newHead[j] ?? ''); }
      else if (oldHead[oldAt(colPairs, j)] !== newHead[j]) heads.set(idAt(colOf, j), newHead[j] ?? '');
    }
    const oldCol = new Map<number, number>(colPairs.map(([o, nw]) => [nw, o]));
    for (let j = 0; j < newRows.length; j += 1) {
      const fresh = !rowOf.has(j);
      if (fresh) { const id = newId(); place(rowIds, rowOf, j, id); rowOf.set(j, id); }
      const r = idAt(rowOf, j);
      const o = fresh ? null : oldAt(rowPairs, j);
      for (let ci = 0; ci < newHead.length; ci += 1) {
        const value = newRows[j][ci] ?? '';
        const oc = oldCol.get(ci);
        const was = o === null || oc === undefined ? '' : oldRows[o][oc] ?? '';
        if (value === was) continue;
        if (value) cells.set(key(r, idAt(colOf, ci)), value);
        else cells.delete(key(r, idAt(colOf, ci)));
      }
    }
  });
}
