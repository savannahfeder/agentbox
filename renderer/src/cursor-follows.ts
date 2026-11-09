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

/**
 * A row a Z put back, which the keyboard goes to once the list shows it. The
 * place had settled on the row that slid up when this one left, and would
 * otherwise stay there. The row can take a refresh to come back, so the wait
 * holds a few seconds, and a key you press meanwhile wins.
 */
export type CursorWait = { key: string; until: number };
export const CURSOR_WAIT_MS = 5_000;
export const cursorWait = (r: Row, now: number): CursorWait => ({ key: keyOf(r), until: now + CURSOR_WAIT_MS });

/** The place the wait puts the cursor on (-1 for none yet), and the wait to keep for the next draw. */
export function cursorAfterWait({ list, wait, moved, now }: { list: Row[]; wait: CursorWait | null; moved: boolean; now: number }): { index: number; keep: CursorWait | null } {
  if (!wait || moved || now > wait.until) return { index: -1, keep: null };
  const at = list.findIndex((r) => keyOf(r) === wait.key);
  return at >= 0 ? { index: at, keep: null } : { index: -1, keep: wait };
}

/** Where the cursor belongs in `list`, given what was drawn last time. */
export function cursorIndex({ list, selected, last }: { list: Row[]; selected: number; last: CursorMark | null }): number {
  const clamped = Math.min(selected, Math.max(0, list.length - 1));
  if (!last || selected !== last.index) return clamped;
  const at = list.findIndex((r) => keyOf(r) === last.key);
  return at >= 0 ? at : clamped;
}
