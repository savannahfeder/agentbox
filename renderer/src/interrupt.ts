// PURE. When an urgent row is allowed to take her off the task she is reading,
// and what happens to the task it took her off.
//
// This is the half of that sentence that can be got wrong in a way she would
// hate, so the rules are here rather than inside the component: an app that
// takes the screen away from her at the wrong moment is worse than one that
// never interrupts at all. Her design law is the standard it has to meet —
// always intuitively know the next step, no cognitive overload — and a card
// that appears with no explanation and no way back fails all of it.
//
// The four things that make an interruption legitimate:
//
//   IT ARRIVED. A row that was already sitting in her inbox when she opened
//   this task is not an interruption, it is the inbox. Interrupting for those
//   would mean every task she opened bounced her somewhere else, which is the
//   opposite of what she asked for. `known` is how the caller says which rows
//   were already there.
//
//   SHE IS NOT MID-SENTENCE. Never while a reply box, the new task card or the
//   command bar is open. Taking the screen while she is typing would lose her
//   words, and there is no version of this feature worth that.
//
//   IT OUTRANKS WHAT SHE IS READING. Urgent only, and never over another
//   urgent row: she asked for urgent to interrupt non-urgent, and an urgent
//   row displacing an urgent row is just churn.
//
//   ONCE. A row interrupts once, ever. She came back to the task she was on
//   because she chose to; putting her back on the urgent row a second time
//   would be the app arguing with her.
import { itemPriority, URGENT_PRIORITY } from '../../shared/rank.mjs';
import type { WorkItem } from './types';

export function isUrgentRow(item: WorkItem | null | undefined): boolean {
  return !!item && itemPriority(item) >= URGENT_PRIORITY;
}

export interface InterruptQuestion {
  /** The task she has open right now. Null means she is not reading anything. */
  reading: WorkItem | null;
  /** Her inbox, already in its order. */
  inbox: WorkItem[];
  /** Row ids that were already in the inbox before now. */
  known: Set<string>;
  /** Rows that have already interrupted her once. */
  spent: Set<string>;
  /** True while a reply box, the compose card, the command bar or search is open. */
  typing: boolean;
}

/**
 * The urgent row that should take the screen, or null for "leave her alone".
 *
 * Null is the answer nearly every time this is asked, and that is the point.
 */
export function urgentInterruption(q: InterruptQuestion): WorkItem | null {
  if (!q.reading) return null;
  if (q.typing) return null;
  if (isUrgentRow(q.reading)) return null;
  for (const row of q.inbox) {
    if (row.id === q.reading.id) continue;
    if (!isUrgentRow(row)) continue;
    if (q.known.has(row.id)) continue;
    if (q.spent.has(row.id)) continue;
    return row;
  }
  return null;
}

/**
 * The task to put back on the screen when she leaves the urgent one.
 *
 * Read out of the CURRENT items rather than kept as the snapshot we took when
 * she was moved: several minutes can pass on the urgent row, and handing her
 * back the version of the card from before is how she would read a stale
 * result and think nothing had happened. A row that finished or was archived
 * while she was away is not handed back at all — she goes to the list, which
 * is where she would have been.
 */
export function taskToReturnTo(held: WorkItem | null, items: WorkItem[]): WorkItem | null {
  if (!held) return null;
  const live = items.find((i) => i.id === held.id && i.product === held.product);
  if (!live) return null;
  if (live.status === 'done') return null;
  return live;
}
