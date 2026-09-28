// PURE. WHERE AN ACTION LEAVES HER: in the list she was already in, or on the
// next task.
//
// Resolving something from INSIDE a task advances to the next one. That is
// deliberate and it is old: processing an inbox from the reading pane is a
// flow, and dropping back to the list between every item is a round trip per
// item.
//
// Resolving something from the LIST is the other half, and nothing ever said
// so, so the advance ran there too. Pressing E on a row closed it and then
// OPENED THE NEXT ROW, which is not archiving, it is being pulled somewhere she
// did not ask to go.
//
// Measured on the built app the same day (scripts/prove-e-stays-in-the-list.mjs):
// three examples in the inbox, E pressed once per row, and the reading pane was
// up after two of the three presses. It is not a walk bug — the walk is only
// where she met it. Every E, every palette Close and every approval taken with
// no task open did this.
//
// The rule is applied ONCE, here, rather than at each of the branches that
// resolve something, because there are eight of those and fixing branches is
// how the ninth gets missed (the same reason keys.ts exists).

/**
 * The slot to reopen once the resolved item is gone: its own place in the
 *  inbox, and the id to leave out of the count while its write is deferred. */
export type Advance = { index: number; excludeId: string };

/**
 * `fromTask` is whether a task was OPEN when she acted. `index` is where the
 *  item sat in the inbox, and -1 for an item that was not in it at all (an
 *  agent row she closed from somewhere else, a row already on its way out). */
export function advanceAfter(p: { fromTask: boolean; index: number; id: string }): Advance | null {
  if (!p.fromTask) return null;
  return p.index >= 0 ? { index: p.index, excludeId: p.id } : null;
}
