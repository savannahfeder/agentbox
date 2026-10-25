import type { WorkItem } from './types';

type Dated = Pick<WorkItem, 'id' | 'createdAt' | 'wrote'>;

/** When a thread last had something new for you: its latest answer, or when it was made. */
export const arrivedAt = (i: Dated): number => i.wrote?.result?.ts ?? i.createdAt ?? 0;

/**
 * When a thread in Needs you started waiting on you, for the corner tag: its
 * latest answer or its latest status, whichever is later. Status alone is not
 * enough, because picking a thread up writes one and answering it does not.
 */
export const waitingSince = (i: Partial<Pick<WorkItem, 'wrote' | 'updatedAt'>>): number =>
  Math.max(i.wrote?.result?.ts ?? 0, i.wrote?.status?.ts ?? 0) || i.updatedAt || 0;

/**
 * Unread while its latest answer is newer than when you last opened it.
 * `since` stands in for threads with no opened time, so the first launch
 * does not dot everything you already had; Mark Unread stores 0.
 */
export const isUnread = (i: Dated, seenAt: Readonly<Record<string, number>>, since: number): boolean =>
  arrivedAt(i) > (seenAt[i.id] ?? since);

/** Which of Mark Read and Mark Unread would change one of these threads, judged by the same rule as the dot. */
export const readMoves = (items: readonly Dated[], seenAt: Readonly<Record<string, number>>, since: number) => ({
  read: items.some((i) => isUnread(i, seenAt, since)),
  unread: items.some((i) => !isUnread(i, seenAt, since)),
});
