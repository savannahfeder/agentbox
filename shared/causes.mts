// ONE ROW PER CAUSE (w-bb45118b10).
//
// A thread stuck on something outside its own work (a sign-in, the computer,
// git or GitHub, a broken main) parks behind a cause row instead of asking the
// person itself. The cause row is an ordinary row the app starts on its own;
// the agent on it is the lead, who clears the cause or asks once for every
// thread behind it. Closing it is what lets those threads carry on, through
// the waits every row already has (`blockedBy`, resumeFinishedWaits).

export const CAUSE_LABEL = 'cause';
export const CAUSE_KIND = 'cause';

/** The fields of a row these rules read. */
export interface CauseRow {
  id: string;
  product?: string;
  status?: string;
  kind?: string;
  title?: string;
  label?: string;
  result?: string;
  labels?: readonly string[];
  blockedBy?: readonly string[];
  createdAt?: number;
  updatedAt?: number;
  wrote?: { kind?: { source?: string } } | Record<string, unknown>;
}

interface Line { source?: string; patch?: Record<string, unknown> | null }

/** A cause row the app filed. An agent writing the label on its own row does not make one. */
export function isCause(item: unknown): boolean {
  const row = item as CauseRow | null | undefined;
  return row?.kind === CAUSE_KIND && (row.labels ?? []).includes(CAUSE_LABEL)
    && (row.wrote as { kind?: { source?: string } } | undefined)?.kind?.source !== 'agent';
}

/** The threads still waiting on this cause, from every project. */
export function waitingOn<T extends CauseRow>(cause: CauseRow, items: readonly T[] | null | undefined): T[] {
  return (items ?? []).filter((i) => i.id !== cause.id && i.status === 'blocked'
    && Array.isArray(i.blockedBy) && i.blockedBy.includes(cause.id));
}

/** The open cause a thread waits behind, or null. */
export function causeOf<T extends CauseRow>(item: CauseRow | null | undefined, items: readonly T[] | null | undefined): T | null {
  const waits = item?.blockedBy;
  if (!Array.isArray(waits) || !waits.length || item?.status !== 'blocked') return null;
  return (items ?? []).find((c) => isCause(c) && c.status !== 'done' && waits.includes(c.id)) ?? null;
}

/** What a thread behind a cause says on Later, in the Status and Back columns. */
export const CAUSE_WAIT_WORD = 'Waiting';
export const CAUSE_BACK_WORDS = 'When fixed';

/** Of the open causes named `title`, the one every racer keeps: the oldest, then the lowest id. */
export function keeperOf<T extends CauseRow>(title: string, open: readonly T[] | null | undefined): T | null {
  const same = String(title ?? '').trim().toLowerCase();
  return (open ?? []).filter((c) => String(c.title ?? '').trim().toLowerCase() === same)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

/** What a lead that already answered is told when another thread joins its cause. */
export const JOINED_TOO = 'is waiting on this too.';
export function joinedWords(thread: { label?: string; title?: string } | null | undefined): string {
  return `${thread?.label || thread?.title || 'Another thread'} ${JOINED_TOO}`;
}

/** "6 waiting", for the Status column. */
export function causeWord(n: number): string {
  return `${n} waiting`;
}

/** Where the cause is, for the Project column: its own project, or every project when its threads span more than one. */
export function causeWhere(cause: CauseRow, waiting: readonly CauseRow[], ownName: string): string {
  const products = new Set([cause.product, ...waiting.map((i) => i.product)].filter(Boolean));
  return products.size > 1 ? 'All projects' : ownName;
}

/** The open cause rows, newest first. */
export function openCauses<T extends CauseRow>(items: readonly T[] | null | undefined): T[] {
  return (items ?? []).filter((i) => isCause(i) && i.status !== 'done')
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

const DAY = 86_400_000;
/** A closed cause of the same name in the last two weeks: it came back. */
export function cameBack(title: string, items: readonly CauseRow[] | null | undefined, now = Date.now()): boolean {
  const same = String(title ?? '').trim().toLowerCase();
  // A twin that closed itself the moment it opened (mcp/core/causes.mts) was never answered.
  return (items ?? []).some((i) => isCause(i) && i.status === 'done' && i.result
    && String(i.title ?? '').trim().toLowerCase() === same && now - (i.updatedAt ?? 0) < 14 * DAY);
}

/** What the lead on a cause row is told. */
export function leadBrief({ cause, ask, from, again = false }: { cause: string; ask?: string; from: string; again?: boolean }): string {
  return [
    `Several threads may get stuck on this, and they wait on this row instead of each asking the person: ${cause}`,
    '',
    `The first to hit it was ${from}. It said:`,
    '',
    ...String(ask ?? '').trim().split('\n').map((l) => `> ${l}`),
    '',
    'You are the lead on this cause. Read every thread waiting on it (list_work_items, and each one\'s blockedBy names this row), then:',
    '',
    '1. Clear it yourself if no person is needed. When it is cleared, check that the thing that failed now works, then set this row done. Every thread waiting on it carries on by itself.',
    '2. Otherwise ask the person once, for all of them. Open with what to do and how many threads it unblocks, name each waiting thread, and give numbered steps. When they say it is done, check it really works before you set this row done. The check is the thing that failed, not something near it: a push, not a read.',
    again
      ? '3. This cause was closed in the last two weeks and has come back. Besides clearing it, file one thread under this row (create_work_item with parent) to stop it happening again, saying what keeps causing it.'
      : '3. Keep to this cause. Do not do the waiting threads\' own work.',
    '',
    `When you are started again because a thread ${JOINED_TOO.replace(/\.$/, '')}, answer again in full, naming every thread waiting now.`,
  ].join('\n');
}

/** Whether a row's stored history is a cause row's: the app wrote its kind. */
export function isCauseLedger(lines: readonly Line[] | null | undefined): boolean {
  return (lines ?? []).some((l) => l?.source === 'system' && l.patch?.kind === CAUSE_KIND && ((l.patch?.labels as string[] | undefined) ?? []).includes(CAUSE_LABEL));
}

/** A cause row's history without the brief the app wrote for its lead, for drawing to the person. */
export function withoutBrief<T extends Line>(lines: readonly T[] | null | undefined): T[] {
  return (lines ?? []).map((l) => {
    if (l?.source !== 'system' || typeof l.patch?.body !== 'string') return l;
    const { body: _brief, ...rest } = l.patch;
    return { ...l, patch: rest };
  });
}
