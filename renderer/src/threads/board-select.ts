// PICKING SEVERAL CARDS ON THE BOARD (w-2e3819913c): "Shift-click to select
// more, and then hit Command-K", and "highlight the background, just like in
// PowerPoint". What is picked is App.tsx's `multiSel`, the same set the list's
// select boxes fill, so ⌘K, E, L and Escape act on it with no board copy of
// any of them. Pure, so the rules are pinned by
// tests/the-board-picks-several-threads-by-click-or-by-dragging-a-box.test.mjs.

export type Box = { left: number; top: number; right: number; bottom: number };

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

/** What is picked once the box has caught `hits`. A plain box starts the pick
 *  over, so dragging across nothing clears it, as a click on empty space does;
 *  with Shift or ⌘ held it adds to what was there when the drag began. */
export function marqueeMarks(before: ReadonlySet<string>, hits: string[], add: boolean): Set<string> {
  return new Set(add ? [...before, ...hits] : hits);
}
