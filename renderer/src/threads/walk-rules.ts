// WHERE J AND K GO: EVERY THREAD THE PAGE DRAWS, A TEAMMATE'S INCLUDED
// (w-fb16bcaeba, 2026-10-05).
//
// Her words: "if I'm in team view on my board then it should show that
// naturally as I'm navigating through the inbox. If I want to not see it then
// i would remove my team's visibility." The keyboard used to walk only her own
// rows, so J went quiet on the last of hers with her teammates' rows still
// drawn under it. A stop is one of your threads or one of their cards, in the
// order the list or the board draws them; with nobody else picked there are
// no cards, so your own page walks as it always has.
// Pure, so tests read it directly
// (tests/j-walks-onto-a-teammates-thread-when-they-are-on-the-page.test.mjs).
import type { ThreadCard, WorkItem } from '../types';
import type { BoardEntry } from './page-rules';
import type { MixedRow } from './people-rules';

export type Stop = { item: WorkItem; card?: undefined } | { card: ThreadCard; item?: undefined };

/** One name per stop: a thread of yours by its id, a card by whose and which thread. */
export const stopKey = (s: Stop): string => (s.item ? `item/${s.item.product}/${s.item.id}` : `card/${s.card.personId}/${s.card.threadId}`);

/** The list's stops: the merged table when a teammate is on it, else your own rows.
 *  A row of yours is a stop only when it is in `items`, as the table draws it. */
export function listStops(items: WorkItem[], mixed: MixedRow[] | null): Stop[] {
  if (!mixed) return items.map((item) => ({ item }));
  const ids = new Set(items.map((i) => i.id));
  return mixed.filter((r) => (r.card ? true : ids.has(r.item.id)));
}

/** The board's stops, down each column and on to the next, cards included. */
export function boardStops(columns: { rows: BoardEntry[] }[]): Stop[] {
  return columns.flatMap((c) => c.rows).flatMap((e): Stop[] => (e.item ? [{ item: e.item }] : e.card ? [{ card: e.card }] : []));
}

/** The stop one step from `from`, or null at either end. A `from` the page is
 *  not drawing steps from `fallback`, the keyboard's last place in the walk. */
export function stepStop(stops: Stop[], from: Stop | null, dir: 1 | -1, fallback = -1): Stop | null {
  const key = from ? stopKey(from) : null;
  const at = key ? stops.findIndex((s) => stopKey(s) === key) : -1;
  const next = (at >= 0 ? at : fallback) + dir;
  return next >= 0 && next < stops.length ? stops[next] : null;
}
