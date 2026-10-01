// THE INBOX AND TEAM PAGES' PURE RULES (approved 2026-10-01, w-e731ca9376).
//
// No React and no styles, so tests read them directly
// (tests/threads-the-pages.test.mjs). What a Display menu choice keeps, how
// the rows are ordered, how "Updated" is said, and what goes in each board
// column for the Team, where your own threads come from this Mac and your
// teammates' from the cards their Macs publish.
import { shownToTeam } from '../../../shared/thread-cards.mjs';
import type { Product, ThreadCard, ThreadStateWord, WorkItem } from '../types';
import { priorityIdOf, type PriorityId } from '../priority';
import { threadState } from '../../../shared/thread-cards.mjs';

export type PageId = 'inbox' | 'team';
export type UpdatedWindow = 'today' | 'week' | 'any';
export interface Display {
  view: 'list' | 'board';
  sort: 'priority' | 'updated';
  priorities: PriorityId[];
  projects: string[];
  updated: UpdatedWindow;
}

// Her words: "your page should, by default, be in list view" and "the team page
// should, by default, be in board view", and either is remembered once changed.
export const DEFAULT_DISPLAY: Record<PageId, Display> = {
  inbox: { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' },
  team: { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any' },
};

const KEY = (page: PageId) => `threads.display.${page}`;

export function readDisplay(page: PageId, store: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): Display {
  try {
    const raw = store?.getItem(KEY(page));
    if (!raw) return DEFAULT_DISPLAY[page];
    const d = JSON.parse(raw);
    return {
      view: d.view === 'board' || d.view === 'list' ? d.view : DEFAULT_DISPLAY[page].view,
      sort: d.sort === 'updated' || d.sort === 'priority' ? d.sort : DEFAULT_DISPLAY[page].sort,
      priorities: Array.isArray(d.priorities) ? d.priorities.filter((p: unknown) => ['urgent', 'high', 'medium', 'low'].includes(p as string)) : [],
      projects: Array.isArray(d.projects) ? d.projects.filter((p: unknown) => typeof p === 'string') : [],
      updated: d.updated === 'today' || d.updated === 'week' ? d.updated : 'any',
    };
  } catch {
    return DEFAULT_DISPLAY[page];
  }
}

export function writeDisplay(page: PageId, d: Display, store: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { store?.setItem(KEY(page), JSON.stringify(d)); } catch { /* private mode */ }
}

/** Whether any filter is on, which is what puts the dot on the Display icon. */
export const isFiltered = (d: Display) => d.priorities.length > 0 || d.projects.length > 0 || d.updated !== 'any';

const startOfDay = (now: number) => { const t = new Date(now); t.setHours(0, 0, 0, 0); return t.getTime(); };

/** What the filters keep. The rows the app makes itself (no project) always stay. */
export function keeps(item: Pick<WorkItem, 'priority' | 'product' | 'updatedAt'>, d: Display, now: number): boolean {
  if (d.priorities.length && !d.priorities.includes(priorityIdOf(item.priority))) return false;
  if (d.projects.length && item.product && !d.projects.includes(item.product)) return false;
  if (d.updated === 'today' && !(item.updatedAt >= startOfDay(now))) return false;
  if (d.updated === 'week' && !(item.updatedAt >= now - 7 * 86_400_000)) return false;
  return true;
}

/** The rows in the order the Display menu asked for. Priority keeps the app's own ranking. */
export function sorted<T extends Pick<WorkItem, 'updatedAt'>>(rows: T[], d: Display): T[] {
  if (d.sort !== 'updated') return rows;
  return rows.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** "Updated", in plain words: "just now", "6 min ago", "4 hours ago", "Yesterday", "Sep 28". */
export function updatedWords(ts: number, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - ts) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (ts >= startOfDay(now)) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (ts >= startOfDay(now) - 86_400_000) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A product that is a message record between two people, which no project list shows. */
export const isDirect = (p: Product | undefined | null) => !!(p as { team?: { direct?: boolean } } | undefined)?.team?.direct;

// ------------------------------------------------------------------ the board

export interface BoardEntry {
  key: string;
  ownerId: string | null;
  state: ThreadStateWord;
  title: string | null;
  project: string | null;
  projectSlug: string | null;
  priority: number | null;
  updatedAt: number;
  item: WorkItem | null;
  card: ThreadCard | null;
}

/**
 * Every thread worth showing the team, as board entries: yours from this Mac
 * (so they open), your teammates' from their cards (so they show their
 * summary), done ones only from today. Messages between two people never.
 */
export function teamEntries({ items, products, cards, me, now, since = null }: { items: WorkItem[]; products: Product[]; cards: ThreadCard[]; me: string | null; now: number; since?: number | null }): BoardEntry[] {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const today = startOfDay(now);
  const out: BoardEntry[] = [];
  for (const item of items) {
    if (item.agent) continue;
    const product = bySlug.get(item.product);
    if (!product || isDirect(product)) continue;
    // A teammate's row that synced into a shared project is theirs, and their
    // card already stands for it; drawn here it would be on the board twice,
    // once under your name.
    if (me && item.createdBy && item.createdBy !== me) continue;
    // Your threads from before you joined are not on the team's board, any
    // more than they are on anyone else's (shared/thread-cards.mjs). One you
    // made private stays, with its lock, so you can see it is hidden.
    if (item.visibility !== 'private' && !shownToTeam(item, since)) continue;
    const state = threadState(item, now);
    if (state === 'done' && !(item.updatedAt >= today)) continue;
    out.push({
      key: `mine/${item.product}/${item.id}`, ownerId: me, state, title: item.label || item.title, project: product.name,
      projectSlug: product.slug, priority: item.priority ?? null, updatedAt: item.updatedAt, item, card: null,
    });
  }
  for (const card of cards) {
    if (card.personId === me) continue;
    // A PRIVATE THREAD IS NOT ON THE BOARD AT ALL (decided 2026-10-01, from six
    // interviews: "a lock gets noticed"). Cards are no longer published for
    // them; one left over from before is skipped here.
    if (!card.visible) continue;
    if (card.state === 'done' && !(card.updatedAt >= today)) continue;
    out.push({
      key: `card/${card.personId}/${card.threadId}`, ownerId: card.personId, state: card.state, title: card.visible ? card.title : null,
      project: card.visible ? card.project : null, projectSlug: null, priority: card.priority, updatedAt: card.updatedAt, item: null, card,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const BOARD_COLUMNS: { state: ThreadStateWord; label: string }[] = [
  { state: 'waiting', label: 'Waiting' },
  { state: 'running', label: 'Running' },
  { state: 'scheduled', label: 'Scheduled' },
  { state: 'done', label: 'Done today' },
];

/** The Team's own filters: one person (or everyone) and one project (or all). */
export function teamKeeps(e: BoardEntry, { person, projectName }: { person: string | null; projectName: string | null }, d: Display, now: number): boolean {
  if (person && e.ownerId !== person) return false;
  if (projectName && e.project !== projectName) return false;
  if (d.priorities.length && !d.priorities.includes(priorityIdOf(e.priority))) return false;
  if (d.updated === 'today' && !(e.updatedAt >= startOfDay(now))) return false;
  if (d.updated === 'week' && !(e.updatedAt >= now - 7 * 86_400_000)) return false;
  return true;
}


/** YOUR CONVERSATION WITH ONE PERSON: the newest row in the message record of
 *  exactly you two (the record lists who it was shared with; its maker is
 *  `sharedBy`). Null before the first message. */
export function conversationWith(personId: string, { products, items, me }: { products: Product[]; items: WorkItem[]; me: string | null }): WorkItem | null {
  const on = (t: NonNullable<Product['team']>) => [...t.people, ...(t.sharedBy ? [t.sharedBy] : [])];
  // The record both Macs settle on: the lowest id (main/team/index.mjs, directWith).
  const record = products
    .filter((p) => p.team?.direct && on(p.team).includes(personId) && (!me || on(p.team).includes(me)))
    .sort((a, b) => String(a.team!.projectId).localeCompare(String(b.team!.projectId)))[0];
  if (!record) return null;
  return items.filter((i) => i.product === record.slug && !i.agent)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
}
