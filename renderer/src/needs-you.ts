import type { WorkItem } from './types';
import { arrivedAt } from './unread';

/** Something arrived in Needs You after you last had it open. */
export const needsYouLit = (inbox: readonly Pick<WorkItem, 'id' | 'createdAt' | 'wrote'>[], lookedAt: number): boolean =>
  inbox.some((i) => arrivedAt(i) > lookedAt);

/**
 * When you last had Needs You open, as of now. It moves only when something
 * there is newer: `inbox` is rebuilt on every render, and a stamp that moved
 * every time rendered the page again, for ever.
 */
export const lookedAtNow = (inbox: readonly Pick<WorkItem, 'id' | 'createdAt' | 'wrote'>[], lookedAt: number, now: number): number =>
  needsYouLit(inbox, lookedAt) ? Math.max(now, ...inbox.map(arrivedAt)) : lookedAt;
