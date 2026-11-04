// PURE. Old finished threads, loaded a page at a time, folded into the rows.
//
// w-fda2165ec6. The snapshot reads a ledger's last 8 MB, so a long one's
// oldest finished threads are missing from it and a few more are half there
// (their first lines cut, so a blank title). The foot of Done and All asks
// main for them a page at a time (`listOlderItems`, main/store.mts), and this
// is where a page meets the snapshot. The snapshot is the live copy and wins,
// except over a half-cut thread, which the page has whole: same id, a
// different `createdAt`, and nothing written to it since the page was read.
// `tests/the-all-tab-holds-finished-threads-too.test.mjs`.

import type { WorkItem } from './types';

const key = (i: Pick<WorkItem, 'product' | 'id'>) => `${i.product}/${i.id}`;

export function withOlder<T extends Pick<WorkItem, 'id' | 'product' | 'createdAt' | 'updatedAt'>>(live: T[], older: T[]): T[] {
  if (!older.length) return live;
  const page = new Map(older.map((i) => [key(i), i]));
  const out = live.map((i) => {
    const whole = page.get(key(i));
    if (!whole) return i;
    page.delete(key(i));
    return whole.createdAt !== i.createdAt && whole.updatedAt >= i.updatedAt ? whole : i;
  });
  return [...out, ...page.values()];
}
