// The unread dot, by the desktop's rule (renderer/src/unread.ts): a thread is
// unread while its latest answer is newer than when you last opened it here.
// Keyed by project and id, since two computers can both have a w-1.
import { arrivedAt } from '../../../renderer/src/unread';

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

/** Unread again until it is next opened (the web app's Mark unread). */
export function markUnseen(seen: Seen, item: { product: string; id: string }, store: Store): Seen {
  const at = { ...seen.at, [keyOf(item)]: 0 };
  store.setItem(SEEN_AT_KEY, JSON.stringify(at));
  return { ...seen, at };
}

export const isUnread =(item: { product: string; id: string; createdAt?: number; wrote?: any }, seen: Seen) =>
  arrivedAt(item as any) > (seen.at[keyOf(item)] ?? seen.since);
