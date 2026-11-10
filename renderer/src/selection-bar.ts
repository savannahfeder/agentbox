import { MAX_QUOTE_CHARS } from '../../shared/artifact-marks.mts';

export { MAX_QUOTE_CHARS };

type Picked = Pick<Selection, 'isCollapsed' | 'rangeCount' | 'anchorNode' | 'focusNode'> & { toString(): string };
type Box = { top: number; bottom: number; left: number; right: number };

/** The words selected on the page, or null. A drag may end outside the page, so either end will do. */
export function pickedIn(root: Pick<Node, 'contains'> | null, sel: Picked | null): string | null {
  if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return null;
  if (!root.contains(sel.anchorNode) && !root.contains(sel.focusNode)) return null;
  const words = sel.toString();
  return words.trim() ? words : null;
}

type TextBox = { value: string; selectionStart: number | null; selectionEnd: number | null };

/** The words selected inside a text box on the page. Chrome puts such a selection on the body, so pickedIn never sees it. */
export function boxPickedIn(root: { contains(node: never): boolean } | null, el: unknown): string | null {
  const box = el as TextBox | null;
  if (!root || !box || typeof box.value !== 'string' || box.selectionStart == null || box.selectionEnd == null) return null;
  if (!root.contains(el as never)) return null;
  const words = box.value.slice(box.selectionStart, box.selectionEnd);
  return words.trim() ? words : null;
}

export const quoteFrom =(words: string) => words.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE_CHARS);

const GAP = 8;

/** Over the first line selected, or under the last when there is no room above. */
export function barSpot(first: Box, all: Box, bar: { w: number; h: number }, view: { w: number; h: number; top?: number }) {
  const floor = (view.top ?? 0) + GAP;
  const centre = (first.left + first.right) / 2;
  const left = Math.round(Math.min(Math.max(centre - bar.w / 2, GAP), view.w - bar.w - GAP));
  const above = first.top - bar.h - GAP;
  const top = above >= floor ? above : Math.min(all.bottom + GAP, view.h - bar.h - GAP);
  return { left, top: Math.round(top) };
}

export const quotesKey = (quotes: { id: string; text: string; cell?: { row: number; column: string } }[]) =>
  JSON.stringify(quotes.map((q) => (q.cell ? [q.id, q.text, q.cell.row, q.cell.column] : [q.id, q.text])));
