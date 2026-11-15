// PICKING SEVERAL CARDS ON THE BOARD (w-2e3819913c): "Shift-click to select
// more, and then hit Command-K", and "highlight the background, just like in
// PowerPoint". What is picked is App.tsx's `multiSel`, the same set the list's
// select boxes fill, so ⌘K, E, L and Escape act on it with no board copy of
// any of them. Pure, so the rules are pinned by
// tests/the-board-picks-several-threads-by-click-or-by-dragging-a-box.test.mts.

import { edgeScroll } from './row-drag';

export type Box ={ left: number; top: number; right: number; bottom: number };

/** A click on a card. The list reads Shift as a range down its rows; a board
 *  has no one direction to run a range in, so Shift and ⌘ both add or take
 *  away the one card, the way PowerPoint does, and the box picks a run. */
export function cardClickIntent(mods: { shift?: boolean; meta?: boolean; ctrl?: boolean; alt?: boolean }): 'open' | 'toggle' {
  return mods.shift || mods.meta || mods.ctrl ? 'toggle' : 'open';
}

export function toggleMark(marks: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(marks);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** What a Shift- or ⌘-click leaves picked. The first one also takes the card
 *  you were on, as the list's Shift+J takes the row you are on: without it you
 *  open a card, Shift-click three more, and the one you started from is left
 *  out (w-2e3819913c, "I would assume the middle one is not selected, but it
 *  should be"). After that it only toggles, so a card taken out stays out. */
export function clickMarks(marks: ReadonlySet<string>, id: string, cursor: string | null): Set<string> {
  if (marks.size) return toggleMark(marks, id);
  return new Set(cursor ? [cursor, id] : [id]);
}

/** The box between where the drag started and where the pointer is now,
 *  whichever way it went. */
export function marqueeBox(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

/** Every card the box overlaps, partly or wholly, the way Figma and Finder
 *  pick: asking for the whole card made a box drawn down one column miss the
 *  cards it plainly crossed. Touching an edge is not overlapping. */
export function cardsUnder(box: Box, cards: { id: string; box: Box }[]): string[] {
  return cards
    .filter(({ box: c }) => box.left < c.right && box.right > c.left && box.top < c.bottom && box.bottom > c.top)
    .map((c) => c.id);
}

/** One box drag, from the press to letting go. Boxes are measured on screen
 *  and kept in the board's own coordinates, so the board scrolling under the
 *  pointer cannot throw the box off. Held near the top or bottom of
 *  `scroller` it scrolls a frame at a time (`edgeScroll`, the same rule a
 *  dragged card follows), and the box grows with it. `scrolled` redraws the
 *  box after a scroll the drag did not make, such as the wheel's. */
export function bandDrag(o: {
  from: { x: number; y: number };
  wrapRect: () => Box;
  cards: () => { id: string; box: Box }[];
  scroller: { rect: () => Box; scrollBy: (dy: number) => void } | null;
  frame: (fn: () => void) => number;
  cancelFrame: (handle: number) => void;
  onBand: (box: Box | null) => void;
  onHits: (ids: string[]) => void;
}) {
  const inWrap = (x: number, y: number) => { const r = o.wrapRect(); return { x: x - r.left, y: y - r.top }; };
  const start = inWrap(o.from.x, o.from.y);
  const at = { ...o.from };
  let moved = false;
  let handle: number | null = null;
  const paint = () => {
    const b = marqueeBox(start, inWrap(at.x, at.y));
    o.onBand(b);
    const r = o.wrapRect();
    const under = o.cards().map(({ id, box: c }) => ({ id, box: { left: c.left - r.left, top: c.top - r.top, right: c.right - r.left, bottom: c.bottom - r.top } }));
    o.onHits(cardsUnder(b, under));
  };
  const tick = () => {
    handle = null;
    const s = o.scroller?.rect();
    const by = s ? edgeScroll(at.y, s.top, s.bottom) : 0;
    if (!by) return;
    o.scroller!.scrollBy(by);
    paint();
    handle = o.frame(tick);
  };
  return {
    move(x: number, y: number) {
      at.x = x; at.y = y;
      if (!moved && Math.hypot(x - o.from.x, y - o.from.y) < 4) return;
      moved = true;
      paint();
      if (handle === null) handle = o.frame(tick);
    },
    scrolled() { if (moved) paint(); },
    /** Lets go; says whether the press ever moved far enough to be a box. */
    end() {
      if (handle !== null) o.cancelFrame(handle);
      handle = null;
      o.onBand(null);
      return moved;
    },
  };
}

/** What is picked once the box has caught `hits`. A plain box starts the pick
 *  over, so dragging across nothing clears it, as a click on empty space does;
 *  with Shift or ⌘ held it adds to what was there when the drag began. */
export function marqueeMarks(before: ReadonlySet<string>, hits: string[], add: boolean): Set<string> {
  return new Set(add ? [...before, ...hits] : hits);
}
