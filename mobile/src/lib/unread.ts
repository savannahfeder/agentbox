// The unread dot, by the desktop's rule (renderer/src/unread.ts): a thread is
// unread while its latest answer is newer than when you last opened it here.
// Keyed by project and id, since two computers can both have a w-1.
import { arrivedAt } from '../../../renderer/src/unread';
import { splitSlug } from '../../../renderer/src/phone-rows';
import type { WorkItem } from '../../../renderer/src/types';

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export const SEEN_AT_KEY = 'agentbox.phone.seenAt';
export const UNREAD_SINCE_KEY = 'agentbox.phone.unreadSince';
const KEEP = 2000;

export type Seen = { at: Record<string, number>; since: number };

const keyOf = (i: { product: string; id: string }) => `${i.product}/${i.id}`;

/** What this phone has opened, and since when it kept count: older threads count as read. */
export function readSeen(store: Store, now = Date.now()): Seen {
  let since = Number(store.getItem(UNREAD_SINCE_KEY));
  if (!(since > 0)) { since = now; store.setItem(UNREAD_SINCE_KEY, String(now)); }
  let at: Record<string, number> = {};
  try { at = JSON.parse(store.getItem(SEEN_AT_KEY) ?? '{}') ?? {}; } catch { /* a broken file reads as nothing opened */ }
  return { at, since };
}

export function markSeen(seen: Seen, item: { product: string; id: string }, store: Store, now = Date.now()): Seen {
  const at = Object.fromEntries(Object.entries({ ...seen.at, [keyOf(item)]: now }).sort((a, b) => b[1] - a[1]).slice(0, KEEP));
  store.setItem(SEEN_AT_KEY, JSON.stringify(at));
  return { ...seen, at };
}

/**
 * Opened on one of your computers: read here from then too. Each computer's
 * settings copy says what its window opened, by id, so only its own threads
 * take it. A thread marked unread here stays unread until it is opened here.
 */
export function seenOnComputers(
  seen: Seen,
  rows: readonly { device: string; settings?: { seen?: unknown } | null }[],
  items: readonly { product: string; id: string }[],
  store: Store,
): Seen {
  const there = new Map(rows.map((r) => [r.device, r.settings?.seen && typeof r.settings.seen === 'object' ? r.settings.seen as Record<string, unknown> : null]));
  let at: Record<string, number> | null = null;
  for (const i of items) {
    const where = splitSlug(i.product);
    const opened = where ? there.get(where.device)?.[i.id] : undefined;
    const here = (at ?? seen.at)[keyOf(i)];
    if (typeof opened !== 'number' || here === 0 || !(opened > (here ?? seen.since))) continue;
    (at ??= { ...seen.at })[keyOf(i)] = opened;
  }
  if (!at) return seen;
  const kept = Object.fromEntries(Object.entries(at).sort((a, b) => b[1] - a[1]).slice(0, KEEP));
  store.setItem(SEEN_AT_KEY, JSON.stringify(kept));
  return { ...seen, at: kept };
}

/** Unread again until it is next opened (the web app's Mark unread). */
export function markUnseen(seen: Seen, item: { product: string; id: string }, store: Store): Seen {
  const at = { ...seen.at, [keyOf(item)]: 0 };
  store.setItem(SEEN_AT_KEY, JSON.stringify(at));
  return { ...seen, at };
}

// Her own thread with no answer yet holds nothing new: only her message, and "Queued".
export const isUnread =(item: { product: string; id: string; createdAt?: number; wrote?: WorkItem['wrote']; waitsForMac?: boolean }, seen: Seen) =>
  !(!item.wrote?.result && (item.waitsForMac || item.wrote?.body?.source === 'founder'))
  && arrivedAt(item as Parameters<typeof arrivedAt>[0]) > (seen.at[keyOf(item)] ?? seen.since);
