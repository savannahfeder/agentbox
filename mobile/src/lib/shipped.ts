// What shipped this week, by the desktop's rule (renderer/src/team/shipped.ts),
// over the cards the team's computers publish (20261031000050_threads_say_when_they_shipped.sql).
import { firstName } from '../../../renderer/src/team/company';
import { shippedThisWeek, shippedWords, type ShippedRow } from '../../../renderer/src/team/shipped';
import type { Person, ThreadCard } from '../../../renderer/src/types';
import { threadCardOf, type ThreadCardRow } from './everything';

export { shippedWords, type ShippedRow };

const WEEK = 7 * 86_400_000;

// Its own query, not Everything else's: a cloud from before shipped_at would refuse the whole read.
export const shippedCardsQuery = (now: number) =>
  `select=person_id,thread_id,visible,title,project,state,priority,people,shipped_at,updated_at&shipped_at=gte.${encodeURIComponent(new Date(now - WEEK).toISOString())}&order=shipped_at.desc&limit=200`;

/** One `thread_cards` row as shippedCardsQuery reads it. */
export type ShippedCardRow = ThreadCardRow & { people?: unknown; shipped_at?: string | null };

export function shippedCardOf(r: ShippedCardRow): ThreadCard {
  const at = r.shipped_at ? Date.parse(r.shipped_at) : NaN;
  return { ...threadCardOf(r), people: Array.isArray(r.people) && r.people.length ? r.people : null, ...(at > 0 ? { shippedAt: at } : {}) };
}

/**
 * The phone's copy of a thread carries neither when it shipped nor who sees
 * it, so your own threads come from the cards your computer published, which
 * it publishes only for threads the team can read. One shown to chosen people
 * stays off, as the desktop leaves those out of your own.
 */
export function phoneShipped({ cards, me, now }: { cards: readonly ThreadCard[]; me: string | null; now: number }): ShippedRow[] {
  const shared = cards.filter((c) => c.personId !== me || !c.people?.length);
  return shippedThisWeek({ items: [], cards: shared, products: [], me: null, since: null, now });
}

export const shippedName = (id: string | null, me: string | null, people: readonly { id: string; name: string | null; email?: string | null }[]) =>
  (id && id === me ? 'You' : firstName((people.find((p) => p.id === id) ?? null) as Person | null));
