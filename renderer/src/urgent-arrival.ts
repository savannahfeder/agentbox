// PURE. Which urgent thread to announce when it arrives while another thread is
// open, and for how long. It is named in the top bar with O to open it; the
// thread on screen stays where it is (w-f18ede1965).
import { itemPriority, URGENT_PRIORITY } from '../../shared/rank.mts';
import type { WorkItem } from './types';

export function isUrgentRow(item: WorkItem | null | undefined): boolean {
  return !!item && itemPriority(item) >= URGENT_PRIORITY;
}

export interface ArrivalQuestion {
  /** The thread open right now. With none open, the list shows it at the top. */
  reading: WorkItem | null;
  /** The inbox, already in its order. */
  inbox: WorkItem[];
  /** Row ids that were already in the inbox before now. */
  known: Set<string>;
  /** Rows already announced once. */
  spent: Set<string>;
}

export function urgentArrival(q: ArrivalQuestion): WorkItem | null {
  if (!q.reading) return null;
  for (const row of q.inbox) {
    if (row.id === q.reading.id) continue;
    if (!isUrgentRow(row)) continue;
    if (q.known.has(row.id)) continue;
    if (q.spent.has(row.id)) continue;
    return row;
  }
  return null;
}

type Ref = Pick<WorkItem, 'product' | 'id'>;
/** The urgent thread to name in the top bar, and the thread it was raised over. */
export type UrgentRaised = { row: Ref; on: Ref };

export function urgentRaised(row: Ref, on: Ref): UrgentRaised {
  return { row: { product: row.product, id: row.id }, on: { product: on.product, id: on.id } };
}

const same = (a: Ref | null | undefined, b: Ref | null | undefined) => !!a && !!b && a.product === b.product && a.id === b.id;

/**
 * The row to name in the top bar right now: only over the thread it was raised
 * on, so leaving that thread puts it away, and only while it still waits in
 * the inbox, so answering it anywhere else puts it away too.
 */
export function urgentShown(raised: UrgentRaised | null, open: Ref | null, inbox: WorkItem[]): WorkItem | null {
  if (!raised || !same(raised.on, open)) return null;
  return inbox.find((i) => same(i, raised.row)) ?? null;
}
