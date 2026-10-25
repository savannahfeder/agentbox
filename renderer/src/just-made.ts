// A THREAD JUST MADE IS IN THE LIST BEFORE THE NEXT SNAPSHOT IS (w-461fbd8d2d).
//
// The computer hands the new row back the moment it writes it, and the list
// used to ignore that and wait for a whole second fetch. On a phone that is one
// more relay round trip of a list with nothing new in it, right after Send.
// So the row is worn on every snapshot until one carries it itself, the way
// unsaved places and pins are worn (App.tsx), and it is let go after a while in
// case no snapshot ever does: a row withdrawn at once must not haunt the list.
import type { WorkItem } from './types';

export const JUST_MADE_MS = 15_000;

export type JustMade = { item: WorkItem; at: number };

const same = (a: WorkItem, b: WorkItem) => a.id === b.id && a.product === b.product;

/**
 * The snapshot's rows with each just-made row it does not carry yet, first.
 * `held` is what is still worth wearing next time: rows the snapshot lacks,
 * inside their time.
 */
export function wearJustMade(items: WorkItem[], made: JustMade[], now: number): { items: WorkItem[]; held: JustMade[] } {
  const held = made.filter((m) => now - m.at < JUST_MADE_MS && !items.some((i) => same(i, m.item)));
  if (!held.length) return { items, held };
  return { items: [...held.map((m) => m.item), ...items], held };
}
