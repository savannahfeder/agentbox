// The sidebar's Recent: the threads you last had open, newest first.

export const RECENT_LIMIT = 6;

/** `seenAt` is when each thread was last opened; 0 is one you marked unread. */
export function recentThreads<T extends { id: string }>(items: readonly T[], seenAt: Readonly<Record<string, number>>, limit = RECENT_LIMIT): T[] {
  return items
    .filter((i) => (seenAt[i.id] ?? 0) > 0)
    .sort((a, b) => seenAt[b.id] - seenAt[a.id])
    .slice(0, limit);
}
