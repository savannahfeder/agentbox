// Z after a close puts the thread back the way it was, not merely open. An open
// row with nothing waiting on the person is work the queue starts, so a row
// that was blocked (a cause row waiting for your reply, a thread you stopped,
// one waiting behind another) would start an agent on an undo.

export interface WasBeforeClose {
  status?: string;
  /** The person wrote that status themselves (Stop). */
  mine?: boolean;
}

interface ClosedRow {
  status?: string;
  wrote?: { status?: { source?: string } | undefined } | Record<string, unknown>;
}

/** What the close is undoing, read off the row as it was drawn when E was pressed. */
export function wasBeforeClose(item: ClosedRow): WasBeforeClose {
  const source = (item.wrote as { status?: { source?: string } } | undefined)?.status?.source;
  return { status: item.status, mine: source === 'founder' };
}

/**
 * The status lines that undo a close. Her 'open' comes first because only her
 * word outranks her own close; it claims no authority (shared/work-items.mts
 * authorityOf), so a blocked written after it by the app lands, and one of hers
 * stays hers.
 */
export function writesToReopen(was: WasBeforeClose | null | undefined): { status: 'open' | 'blocked'; source: 'founder' | 'system' }[] {
  const out: { status: 'open' | 'blocked'; source: 'founder' | 'system' }[] = [{ status: 'open', source: 'founder' }];
  if (was?.status === 'blocked') out.push({ status: 'blocked', source: was.mine ? 'founder' : 'system' });
  return out;
}
