// THE KEYBOARD'S PLACE FOLLOWS ITS THREAD, NOT ITS NUMBER.
//
// `selected` is a place in the list (or the board's reading order). When the
// list changes under a cursor nobody moved, a thread leaving above it or an
// agent carrying it to another column, place 21 names a different card, and
// the board scrolls to that card. With a busy fleet that was every few
// seconds, wherever you had scrolled to (2026-10-05,
// tests/a-refresh-keeps-the-keyboard-on-the-same-thread.test.mts).
//
// So: if the place is the one we last drew, the cursor is on the thread we
// last drew, wherever it now sits. If the place changed, you moved it, and
// your move wins.

type Row = { id: string; product: string };
export type CursorMark = { index: number; key: string };

const keyOf = (r: Row) => `${r.product}:${r.id}`;

/** What to remember after a draw: the place and the thread on it. */
export function cursorMark(list: Row[], index: number): CursorMark | null {
  const at = Math.min(index, Math.max(0, list.length - 1));
  const r = list[at];
  return r ? { index: at, key: keyOf(r) } : null;
}

/** Where the cursor belongs in `list`, given what was drawn last time. */
export function cursorIndex({ list, selected, last }: { list: Row[]; selected: number; last: CursorMark | null }): number {
  const clamped = Math.min(selected, Math.max(0, list.length - 1));
  if (!last || selected !== last.index) return clamped;
  const at = list.findIndex((r) => keyOf(r) === last.key);
  return at >= 0 ? at : clamped;
}
