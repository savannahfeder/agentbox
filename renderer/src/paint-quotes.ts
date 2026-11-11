import { findQuote } from '../../shared/artifact-marks.mts';
import type { TableCell } from './types';

export const canPaintQuotes = () => !!(CSS as unknown as { highlights?: unknown }).highlights;

const attr = (v: string) => `"${v.replace(/["\\]/g, '\\$&')}"`;
/** The drawn cell TableView marks with its file row and column. */
export const cellSelector = (cell: TableCell) => `.tbl-td[data-row="${cell.row}"][data-col=${attr(cell.column)}]`;

type Attrs = { getAttribute(name: string): string | null };

/** The table cell, or a cell's open box, that holds this element. */
export function cellAround(el: { closest(selector: string): Attrs | null } | null): TableCell | undefined {
  const at = el?.closest('[data-row][data-col]');
  const row = Number(at?.getAttribute('data-row'));
  const column = at?.getAttribute('data-col') ?? '';
  return Number.isInteger(row) && row >= 1 && column ? { row, column } : undefined;
}

type Quoted = { text: string; cell?: TableCell };

function textIn(root: Node) {
  const nodes: { node: Text; start: number }[] = [];
  let words = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push({ node, start: words.length });
    words += node.data;
  }
  return { nodes, words };
}

function rangeOf({ nodes, words }: ReturnType<typeof textIn>, hit: { start: number; end: number }) {
  const at = (offset: number) => {
    let i = nodes.length - 1;
    while (i > 0 && nodes[i].start > offset) i -= 1;
    return { node: nodes[i].node, offset: offset - nodes[i].start };
  };
  if (!nodes.length || hit.end > words.length) return null;
  const a = at(hit.start);
  const b = at(hit.end);
  const range = new Range();
  range.setStart(a.node, Math.min(a.offset, a.node.length));
  range.setEnd(b.node, Math.min(b.offset, b.node.length));
  return range;
}

/** Paints each quoted passage without touching the page, which React or the editor drew. */
export function paintQuotes(root: HTMLElement | null, quotes: ({ id: string } & Quoted)[], activeId: string | null, draft: string | Quoted | null) {
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const Highlight = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  const found = new Map<string, Range>();
  if (!root || !highlights || !Highlight) return found;
  const page = textIn(root);
  // A row out of view is not drawn, so its cell is not lit until it scrolls in.
  const placeOf = (q: Quoted) => {
    if (!q.cell) { const hit = findQuote(page.words, q.text); return hit ? rangeOf(page, hit) : null; }
    const el = root.querySelector(cellSelector(q.cell));
    if (!el) return null;
    const cell = textIn(el);
    const hit = findQuote(cell.words, q.text);
    if (hit) return rangeOf(cell, hit);
    const range = new Range();
    range.selectNodeContents(el);
    return range;
  };
  const rest: Range[] = [];
  const on: Range[] = [];
  for (const q of quotes) {
    const range = placeOf(q);
    if (!range) continue;
    found.set(q.id, range);
    if (q.id === activeId) on.push(range); else rest.push(range);
  }
  if (draft) { const range = placeOf(typeof draft === 'string' ? { text: draft } : draft); if (range) on.push(range); }
  highlights.set('av-quote', new Highlight(...rest));
  highlights.set('av-quote-on', new Highlight(...on));
  return found;
}
