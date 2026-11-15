// WHICH PENDING APPROVAL IS THE ONE IN FRONT, and the only copy of that rule.
//
// One card is on screen at a time (renderer/src/approval-stage.ts says why),
// so with three agents stopped at once two of them had no card anywhere:
// opening either thread showed its command still "Running", with nothing to
// answer. The front card follows the thread you opened instead. The order is
// otherwise untouched -- oldest first -- so the inbox is as it was.
//
// IT IS SHARED BECAUSE THREE THINGS READ IT AND THEY MUST AGREE. The card is
// drawn in the renderer; ⌘Y/⌘N is answered in the main process, ahead of the
// page, and so is the Agents menu. If they picked differently, the chord would
// allow a command the person was not reading.

/** What is open on screen: a thread, or nothing that is one thread. */
export type Looking = { product: string | null; id: string | null } | null;

type Request = { product?: string | null; item?: string | null };

/** Whether this request belongs to the thread that is open. */
function belongsTo(request: Request | null | undefined, looking: Looking): boolean {
  if (!request || !looking?.id) return false;
  if (String(request.item ?? '') !== String(looking.id)) return false;
  // A request carries the slug of the product its worker runs for; an older one
  // may carry none, and then the item id is the whole of the match.
  if (!request.product || !looking.product) return true;
  return String(request.product) === String(looking.product);
}

/**
 * The pending approvals, with the open thread's own in front.
 *
 * @param pending the spool's order, oldest first (main/approvals.mts)
 * @param looking `{ product, id }` of the thread on screen, or null for the
 *                inbox, settings, a dialog -- anywhere that is not one thread
 */
export function cardsInFront<T extends Request>(pending: readonly T[] | null | undefined, looking: Looking): T[] {
  const queue: T[] = Array.isArray(pending) ? pending.filter(Boolean) : [];
  if (!looking?.id) return queue;
  const mine = queue.filter((r) => belongsTo(r, looking));
  if (!mine.length) return queue;
  return [...mine, ...queue.filter((r) => !belongsTo(r, looking))];
}
