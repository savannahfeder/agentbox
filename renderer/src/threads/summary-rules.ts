// THE SUMMARY'S PURE RULES ON THE WINDOW SIDE: how long ago in words, which
// line says who wrote the summary last, the names of linked threads, which
// threads may be linked, and whose thread it is. No React and no styles, so the
// tests read them directly (tests/threads-the-summary-*.test.mjs).
//
// The summary itself (the three lines and their stand-ins) and the four states
// are shared with the Mac that publishes cards, so they live in
// shared/thread-cards.mjs and are only read here.
import type { Person, ThreadStateWord, WorkItem } from '../types';
import { shownToPeople, shownToTeam } from '../../../shared/thread-cards.mjs';

export const SUMMARY_FIELDS = ['problem', 'progress', 'solution'] as const;
export type SummaryField = (typeof SUMMARY_FIELDS)[number];

/** The four approved words, and only these. "In progress"
 *  (2026-10-01) covers a thread an agent is on AND one waiting its turn: the
 *  board had called queued work Running while the tab did not. The ones an
 *  agent is on right now carry a turning mark instead of a second word. */
export const STATE_WORD: Record<ThreadStateWord, string> = {
  waiting: 'Waiting', running: 'In progress', scheduled: 'Scheduled', done: 'Done',
};

/**
 * THE WORD A THREAD SHOWS, which is the state's word unless the thread has no
 * moment at all (w-afb66e6661). A thread added to Later is in the scheduled
 * family, because nothing is running and nobody has to act, but "Scheduled"
 * promises a time it does not have. It reads "Not started", the same words as
 * the tag on its row and as the line that starts it.
 */
export function stateWordOf(item: Pick<WorkItem, 'start'>, state: ThreadStateWord): string {
  return item?.start === 'later' ? 'Not started' : STATE_WORD[state];
}

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

/**
 * WHAT THE STATUS ROW LETS SOMEBODY SET, which since 2026-10-01 is a menu
 * rather than a word to read.
 *
 * THE RULE, and the whole of why this exists: marking a thread done from a
 * dropdown on its Status row is more natural than the Mark Done button in the
 * corner. Some redundancy is fine for an action this important, but none of it
 * belongs on the inbox. The round before this one had tried putting a Done
 * button on the inbox ROW and it was turned down: closing
 * is something you do to a thread you have opened, not something you reach for
 * going down a list.
 *
 * ONE ENTRY, AND THAT IS THE POINT RATHER THAN A STUB. Three of the four words
 * are facts about what is happening to a thread and not choices: In progress is
 * an agent holding it, Waiting is nobody holding it, and Scheduled is a moment
 * somebody picked in the picker, which is a second step and a different
 * gesture. Done is the one a person SETS, so it is the one the menu offers. A
 * menu row that cannot be chosen is the dead key this codebase keeps refusing.
 *
 * AND NOTHING AT ALL ON A FINISHED THREAD. Un-finishing one exists only as the
 * undo of closing it (Z, and the toast that offers it), so a "Back to inbox"
 * row here would be a new action invented to fill a menu out.
 */
export interface StatusChoice {
  /** The patch this row makes, named for what it does rather than for a field. */
  id: 'done';
  word: string;
  glyph: StateGlyph;
}

export function statusChoices(state: ThreadStateWord): StatusChoice[] {
  if (state === 'done') return [];
  return [{ id: 'done', word: STATE_WORD.done, glyph: 'done' }];
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
 * THE SUMMARY'S UPDATED ROW: when its three lines were last written, and only
 * when, with a capital (w-922f66bb06). It used to be a faint line under the
 * words, "Kept up to date by the agent · 6 min ago"; it moved to the foot of
 * the panel as a property, and she found "By the agent · 6 min ago" ugly and
 * the lowercase "just now" weird. So: "Just now", "6 min ago", "Yesterday".
 *
 * Only the summary's own fields count. The title and body are her ask, written
 * at the start, and counting them would say "Just now" over words the agent
 * wrote an hour ago.
 *
 * `pending` is an edit of hers already sent and not yet folded back into the
 * row the window holds (the snapshot is polled), stamped with when she typed
 * it. Without it the row would lag her own edit by up to ten seconds.
 *
 * Null when the three lines have never been written, and then no row is drawn.
 */
export function updatedWord(
  item: Pick<WorkItem, 'wrote'>,
  { me, now = Date.now(), pending = {} }: {
    me: string | null;
    now?: number;
    pending?: Partial<Record<SummaryField, number>>;
  },
): string | null {
  let latest: number | null = null;
  for (const field of SUMMARY_FIELDS) {
    const w = item.wrote?.[field];
    if (w && (w.source === 'agent' || w.source === 'founder') && (latest === null || w.ts > latest)) latest = w.ts;
    const mine = pending[field];
    if (Number.isFinite(mine) && (latest === null || mine! > latest)) latest = mine!;
  }
  if (latest === null) return null;
  const when = agoWords(latest, now);
  return when.charAt(0).toUpperCase() + when.slice(1);
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
export function whoSees(item: Pick<WorkItem, 'visibility' | 'visibleTo' | 'createdAt'>, since: number | null): Seen {
  if (!shownToTeam(item, since)) return 'private';
  return shownToPeople(item).length ? 'people' : 'team';
}

export type Seen = 'team' | 'people' | 'private';

/** The three words, in the panel and in its menu. */
export const VISIBILITY_WORD = { team: 'Team', people: 'Chosen people', private: 'Only you' } as const;

/** The line under "Chosen people" in the panel: "Theo", "Theo and Ana", "3 people". */
export function chosenNames(ids: readonly string[], byId: Map<string, Pick<Person, 'name'>>): string {
  if (!ids.length) return 'Nobody yet';
  if (ids.length > 2) return `${ids.length} people`;
  return ids.map((id) => firstOf(byId.get(id)?.name)).join(' and ');
}

/** Where open or closed is remembered, across threads and restarts. */
export const SUMMARY_OPEN_KEY = 'threads.summary.open';

/** Open the first time; after that, whatever she last chose. */
export function readSummaryOpen(storage: Pick<Storage, 'getItem'>): boolean {
  try { return storage.getItem(SUMMARY_OPEN_KEY) !== '0'; } catch { return true; }
}
