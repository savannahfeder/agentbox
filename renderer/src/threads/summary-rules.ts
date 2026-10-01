// THE SUMMARY'S PURE RULES ON THE WINDOW SIDE: how long ago in words, which
// line says who wrote the summary last, the names of linked threads, which
// threads may be linked, and whose thread it is. No React and no styles, so the
// tests read them directly (tests/threads-the-summary-*.test.mjs).
//
// The summary itself (the three lines and their stand-ins) and the four states
// are shared with the Mac that publishes cards, so they live in
// shared/thread-cards.mjs and are only read here.
import type { Person, ThreadStateWord, WorkItem } from '../types';
import { shownToTeam } from '../../../shared/thread-cards.mjs';

export const SUMMARY_FIELDS = ['problem', 'progress', 'solution'] as const;
export type SummaryField = (typeof SUMMARY_FIELDS)[number];

/** The four approved words, and only these. */
export const STATE_WORD: Record<ThreadStateWord, string> = {
  waiting: 'Waiting', running: 'Running', scheduled: 'Scheduled', done: 'Done',
};

export type StateGlyph = 'need' | 'wait' | 'run' | 'sched' | 'done';

/**
 * The mark beside the state word. Waiting is two different facts depending on
 * who it waits on: on you it is the filled accent dot the approved top bar
 * draws, on a teammate it is the hollow ring the teammate's card draws. The
 * word stays "Waiting" either way, because the four words are fixed.
 */
export function stateGlyph(state: ThreadStateWord, waitingOnYou: boolean): StateGlyph {
  if (state === 'waiting') return waitingOnYou ? 'need' : 'wait';
  if (state === 'running') return 'run';
  if (state === 'scheduled') return 'sched';
  return 'done';
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "just now", "19 min ago", "1 hour ago", "Yesterday", "3 days ago". */
export function agoWords(ts: number, now: number = Date.now()): string {
  const gap = Math.max(0, now - ts);
  if (gap < MIN) return 'just now';
  if (gap < HOUR) return `${Math.floor(gap / MIN)} min ago`;
  if (gap < DAY) { const h = Math.floor(gap / HOUR); return `${h} hour${h === 1 ? '' : 's'} ago`; }
  if (gap < 2 * DAY) return 'Yesterday';
  return `${Math.floor(gap / DAY)} days ago`;
}

const firstOf = (name: string | undefined | null) => (name || 'Someone').split(/\s+/)[0];

/**
 * The faint line under the three lines: who wrote the summary last and when.
 * Only the summary's own fields count. The title and body are her ask, written
 * at the start, and counting them would say "Edited by you" over words the
 * agent wrote an hour later.
 *
 * `pending` is an edit of hers already sent and not yet folded back into the
 * row the window holds (the snapshot is polled), stamped with when she typed
 * it. Without it the line would say the agent wrote last for up to ten seconds
 * after she changed a word.
 */
export function lastEdit(
  item: Pick<WorkItem, 'wrote'>,
  { me, names, now = Date.now(), pending = {} }: {
    me: string | null;
    names?: Map<string, string>;
    now?: number;
    pending?: Partial<Record<SummaryField, number>>;
  },
): string | null {
  let latest: { ts: number; source: string; by?: string } | null = null;
  for (const field of SUMMARY_FIELDS) {
    const w = item.wrote?.[field];
    if (w && (w.source === 'agent' || w.source === 'founder') && (!latest || w.ts > latest.ts)) latest = w;
    const mine = pending[field];
    if (Number.isFinite(mine) && (!latest || mine! > latest.ts)) latest = { ts: mine!, source: 'founder', by: me ?? undefined };
  }
  if (!latest) return null;
  const when = agoWords(latest.ts, now);
  if (latest.source === 'agent') return `Kept up to date by the agent · ${when}`;
  if (!latest.by || latest.by === me) return `Edited by you · ${when}`;
  return `Edited by ${firstOf(names?.get(latest.by))} · ${when}`;
}

/** What an id this Mac does not hold reads as: a teammate's private thread, or one since deleted. */
export const UNSEEN_THREAD = 'A thread you cannot see';

/** Linked ids as the titles the list shows for them. */
export function linkedThreads(
  ids: unknown,
  items: Pick<WorkItem, 'id' | 'product' | 'title' | 'label'>[],
  product: string,
): { id: string; title: string; known: boolean }[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string').map((id) => {
    const found = items.find((i) => i.id === id && i.product === product) ?? items.find((i) => i.id === id);
    return found
      ? { id, title: found.label || found.title, known: true }
      : { id, title: UNSEEN_THREAD, known: false };
  });
}

/**
 * The threads the link menu offers: her other open threads, newest first.
 * Never this one, one already in the list, a finished one, a running agent's
 * row (it has no ledger to link), a message between two people (it is not
 * work), or a teammate's thread, which is theirs to link.
 */
export function linkCandidates(
  item: Pick<WorkItem, 'id' | 'product'>,
  items: WorkItem[],
  have: string[],
  { me, direct, limit = 12 }: { me: string | null; direct: Set<string>; limit?: number },
): WorkItem[] {
  return items
    .filter((i) => !(i.id === item.id && i.product === item.product))
    .filter((i) => !have.includes(i.id) && i.status !== 'done' && !i.agent && !direct.has(i.product))
    .filter((i) => !me || !i.createdBy || i.createdBy === me)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit);
}

/** "You", or the full name of the teammate who started it. Never a raw id. */
export function ownerName(item: Pick<WorkItem, 'createdBy'>, me: string | null, byId: Map<string, Pick<Person, 'name'>>): string {
  if (!item.createdBy || !me || item.createdBy === me) return 'You';
  return byId.get(item.createdBy)?.name || 'Someone';
}

/**
 * WHO SEES A THREAD, BY THE RULE AND NOT BY THE WORD ON DISK (2026-10-01).
 * Her threads from before she joined carry no visibility at all, and the panel
 * read that as Team on every one of them while the Team page showed none. So
 * it asks the same rule the Team page does (shared/thread-cards.mjs
 * shownToTeam), and an old thread nobody shared reads "Only you".
 */
export function whoSees(item: Pick<WorkItem, 'visibility' | 'createdAt'>, since: number | null): 'team' | 'private' {
  return shownToTeam(item, since) ? 'team' : 'private';
}

/** The two words, in the panel and in its menu. */
export const VISIBILITY_WORD = { team: 'Team', private: 'Only you' } as const;

/** Where open or closed is remembered, across threads and restarts. */
export const SUMMARY_OPEN_KEY = 'threads.summary.open';

/** Open the first time; after that, whatever she last chose. */
export function readSummaryOpen(storage: Pick<Storage, 'getItem'>): boolean {
  try { return storage.getItem(SUMMARY_OPEN_KEY) !== '0'; } catch { return true; }
}
