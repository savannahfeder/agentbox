// What the team shipped this week: your threads the team can read, and your
// teammates' cards. A thread only finished is not on it.
import { shippedAtOf, shownToPeople, shownToTeam } from '../../../shared/thread-cards.mts';
import type { Product, ThreadCard, WorkItem } from '../types';
import { shownTitle } from '../../../shared/thread-title.mts';

const DAY = 86_400_000;

export interface ShippedRow { key: string; title: string; ownerId: string | null; at: number; item?: WorkItem; card?: ThreadCard }

export function shippedThisWeek({ items, cards, products, me, since, now }: {
  items: readonly WorkItem[]; cards: readonly ThreadCard[]; products: readonly Product[]; me: string | null; since: number | null; now: number;
}): ShippedRow[] {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const out: ShippedRow[] = [];
  for (const item of items) {
    const at = shippedAtOf(item);
    const product = bySlug.get(item.product);
    if (!at || at < now - 7 * DAY || !product || product.team?.direct) continue;
    if (me && item.createdBy && item.createdBy !== me) continue;
    if (!shownToTeam(item, since, product) || shownToPeople(item, product).length) continue;
    out.push({ key: `mine/${item.product}/${item.id}`, title: shownTitle(item), ownerId: me, at, item });
  }
  for (const card of cards) {
    const at = card.shippedAt;
    if (!at || at < now - 7 * DAY || !card.visible || card.personId === me) continue;
    out.push({ key: `card/${card.personId}/${card.threadId}`, title: card.title ?? 'A thread', ownerId: card.personId, at, card });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function shippedWords(at: number, now: number): string {
  const today = new Date(now).setHours(0, 0, 0, 0);
  if (at >= today) return 'Today';
  if (at >= today - DAY) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-US', { weekday: 'short' });
}
