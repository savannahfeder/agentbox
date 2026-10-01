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

/**
 * WHO AN OPEN CONVERSATION WOULD HAND TO NEW THREAD, in the shape the card's
 * `initial` takes: the first person in To, everyone else beside them.
 *
 * Everyone in the record but you, because you are in every conversation you
 * can see and a To field that named you would be asking you to message
 * yourself. The person who STARTED the record counts the same as the rest:
 * they are its `sharedBy` rather than one of its `people`, which is the one
 * place a conversation's membership is written in two fields.
 *
 * Null on anything that is not a conversation, which is what keeps the Add
 * people control off every other page, and null where the only person in it
 * is you, because there is nothing there to add to.
 *
 * AND NULL WHEN THE COMPANY HOLDS NOBODY WHO IS NOT ALREADY HERE (the founder,
 * 2026-10-01: "it should only have that Add people button if there are more
 * people in the company to add. Otherwise it's cleaner if it just doesn't show
 * that at all."). A two person company, or a group that is already everyone,
 * has nothing the control could do: it would open a card holding exactly the
 * people on screen. Somebody who is in the conversation and has since left the
 * company is not room either, which is why this counts the company against
 * this conversation rather than counting heads on both sides.
 */
export function peopleInConversation(
  product: Product | undefined | null,
  me: string | null,
  company: ReadonlyArray<{ id: string }> = [],
): { to: string; also: string[] } | null {
  if (!isDirect(product) || !me) return null;
  const t = product!.team!;
  const here = new Set([...(t.people ?? []), ...(t.sharedBy ? [t.sharedBy] : [])]);
  const ids = [...here].filter((p) => p && p !== me);
  if (!ids.length) return null;
  if (!company.some((p) => p.id !== me && !here.has(p.id))) return null;
  return { to: ids[0], also: ids.slice(1) };
}

/**
 * WHO SEES A ROW, AS THE INBOX SAYS IT (2026-10-01). Her threads from before
 * she joined stay hers unless she shares them, so the inbox has to say which
 * ones the team can see and let her change it. 'team' or 'private' by the
 * Team page's own rule (shared/thread-cards.mjs shownToTeam), or null where
 * the question does not arise: nobody signed in, a message between people, an
 * agent's own row, or a teammate's thread, which is theirs to share.
 */
export function rowSharing(
  item: Pick<WorkItem, 'visibility' | 'createdAt' | 'createdBy' | 'agent'>,
  product: Product | undefined | null,
  team: { me: string | null; since?: number | null } | null,
): 'team' | 'private' | null {
  if (!team || !product || isDirect(product) || item.agent) return null;
  if (item.createdBy && item.createdBy !== team.me) return null;
  return shownToTeam(item, team.since ?? null) ? 'team' : 'private';
}

/**
 * WHAT A MESSAGE ROW SAYS (w-2ad23ca814: "it should be more identifiable as a
 * message... at least I should see her profile"). Who else is in the
 * conversation, whether the newest message is mine, and its first line. Null
 * on anything that is not a conversation.
 */
export function messageLine(item: WorkItem, product: Product | undefined | null, me: string | null): { people: string[]; fromMe: boolean; text: string } | null {
  if (!isDirect(product)) return null;
  const team = (product as { team?: { people?: string[]; sharedBy?: string | null } }).team;
  const everyone = [...(team?.people ?? []), ...(team?.sharedBy ? [team.sharedBy] : []), ...(item.people ?? [])];
  let people = [...new Set(everyone)].filter((p) => p && p !== me);
  if (!people.length && item.createdBy && item.createdBy !== me) people = [item.createdBy];
  const answered = !!item.answer && item.answer !== '(withdrawn)';
  const text = String((answered ? item.answer : item.body) || item.title || '').trim().split('\n')[0];
  const by = (answered ? item.wrote?.answer?.by : item.wrote?.body?.by) ?? item.createdBy ?? null;
  return { people, fromMe: !!me && by === me, text };
}

/**
 * A MESSAGE'S PRIORITY, once anyone has set one. A message is made with 0 by
 * the system, which would read as Low on every row; the sorter
 * (main/message-priority.mjs) or the person setting it is what makes it real.
 */
export function messagePriority(item: WorkItem): number | null {
  const set = item.wrote?.priority;
  return set && set.source !== 'system' ? item.priority ?? null : null;
}

/** What one click on Share or Unshare writes: the other one. */
export const sharePatch = (now: 'team' | 'private'): { visibility: 'team' | 'private' } => ({ visibility: now === 'team' ? 'private' : 'team' });

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
  /** An agent is on it right now (your own threads only; a teammate's card does not say). */
  live?: boolean;
  /** A conversation with people, on your own Inbox board: who, and whether you spoke last. */
  message?: { people: string[]; fromMe: boolean };
}

/**
 * Every thread worth showing the team, as board entries: yours from this Mac
 * (so they open), your teammates' from their cards (so they show their
 * summary), done ones only from today. Messages between two people never.
 */
// `stateOf` IS THE TABS' OWN RULE, handed in by App.tsx (her note, 2026-10-01:
// the board said Running for work the tab did not, "a discrepancy between Team
// and Inbox, which should pretty much never happen"). Your own threads sit in
// the column whose tab lists them; `threadState` is only the fallback for a row
// no tab lists. `live` is the set an agent is on right now.
export function teamEntries({ items, products, cards, me, now, since = null, stateOf, live, allMine = false }: {
  items: WorkItem[]; products: Product[]; cards: ThreadCard[]; me: string | null; now: number; since?: number | null;
  stateOf?: (item: WorkItem) => ThreadStateWord | null; live?: Set<string>;
  /** Your own page (w-05ff3d1438): every thread of yours, the private ones
   *  included, and your conversations with people (w-2ad23ca814). */
  allMine?: boolean;
}): BoardEntry[] {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const today = startOfDay(now);
  const out: BoardEntry[] = [];
  for (const item of items) {
    if (item.agent) continue;
    const product = bySlug.get(item.product);
    if (!product) continue;
    // A MESSAGE IS ON YOUR OWN BOARD, in the column the Inbox tabs give it
    // (w-2ad23ca814: a message from a teammate was on no column at all). The
    // Team page's board stays about work, so it never draws one.
    if (isDirect(product)) {
      const said = allMine ? messageLine(item, product, me) : null;
      const state = said && stateOf?.(item);
      if (!said || !state) continue;
      if (state === 'done' && !(item.updatedAt >= today)) continue;
      out.push({
        key: `mine/${item.product}/${item.id}`, ownerId: me, state, title: said.text, project: 'Message',
        projectSlug: product.slug, priority: messagePriority(item), updatedAt: item.updatedAt, item, card: null,
        message: { people: said.people, fromMe: said.fromMe },
      });
      continue;
    }
    // A teammate's row that synced into a shared project is theirs, and their
    // card already stands for it; drawn here it would be on the board twice,
    // once under your name.
    if (me && item.createdBy && item.createdBy !== me) continue;
    // Your threads from before you joined are not on the team's board, any
    // more than they are on anyone else's (shared/thread-cards.mjs). One you
    // made private stays, with its lock, so you can see it is hidden.
    // ON YOUR OWN PAGE EVERY ONE OF YOURS STAYS (w-05ff3d1438): leaving them
    // out is how 1,211 of her threads went missing from the board.
    if (!allMine && item.visibility !== 'private' && !shownToTeam(item, since)) continue;
    const state = stateOf?.(item) ?? threadState(item, now);
    if (state === 'done' && !(item.updatedAt >= today)) continue;
    out.push({
      key: `mine/${item.product}/${item.id}`, ownerId: me, state, title: item.label || item.title, project: product.name,
      projectSlug: product.slug, priority: item.priority ?? null, updatedAt: item.updatedAt, item, card: null,
      live: !!live?.has(item.id),
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
  { state: 'running', label: 'In progress' },
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
export function conversationWith(personIds: string | string[], { products, items, me }: { products: Product[]; items: WorkItem[]; me: string | null }): WorkItem | null {
  // Exactly these people and you: a pair's conversation is not the group's.
  const want = new Set([...[].concat(personIds as never), ...(me ? [me] : [])] as string[]);
  const on = (t: NonNullable<Product['team']>) => [...new Set([...t.people, ...(t.sharedBy ? [t.sharedBy] : [])])];
  const exactly = (t: NonNullable<Product['team']>) => on(t).length === want.size && on(t).every((p) => want.has(p));
  // The record both Macs settle on: the lowest id (main/team/index.mjs, directWith).
  const record = products
    .filter((p) => p.team?.direct && exactly(p.team))
    .sort((a, b) => String(a.team!.projectId).localeCompare(String(b.team!.projectId)))[0];
  if (!record) return null;
  return items.filter((i) => i.product === record.slug && !i.agent)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
}
