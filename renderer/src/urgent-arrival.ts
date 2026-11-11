// PURE. Which urgent thread to announce when it arrives while another thread is
// open. It is announced in the corner note with O to open it; the thread on
// screen stays where it is (w-f18ede1965).
import { itemPriority, URGENT_PRIORITY } from '../../shared/rank.mts';
import type { ToastGoes } from './toast-parts';
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

export function urgentNote(row: Pick<WorkItem, 'product' | 'id'>): { text: string; goes: ToastGoes } {
  return { text: 'Urgent and ready for you', goes: { product: row.product, id: row.id } };
}
