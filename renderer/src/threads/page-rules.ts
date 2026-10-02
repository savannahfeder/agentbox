// THE INBOX AND TEAM PAGES' PURE RULES (approved 2026-10-01, w-e731ca9376).
//
// No React and no styles, so tests read them directly
// (tests/threads-the-pages.test.mjs). What a Display menu choice keeps, how
// the rows are ordered, how "Updated" is said, and what goes in each board
// column for the Team, where your own threads come from this Mac and your
// teammates' from the cards their Macs publish.
import { shownToPeople, shownToTeam } from '../../../shared/thread-cards.mjs';
import type { Seen } from './summary-rules';
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

// Your own page opens as a list and the team page as a board, by default, and
// either is remembered once changed.
export const DEFAULT_DISPLAY: Record<PageId, Display> = {
  inbox: { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' },
  team: { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' },
};

// THE TEAM BOARD SORTED BY UPDATED UNTIL 2026-10-02, and a saved team display
// carried that default with it, so the board never ran by priority. A display
// saved since then carries `v: 2`; one without it that says Updated was the old
// default speaking, and reads as Priority.
const DISPLAY_VERSION = 2;

/**
 * WHICH OF THE TWO REMEMBERED DISPLAYS THE ONE PAGE IS ON.
 *
 * The Inbox and the Team page became one page (w-05ff3d1438), and the page
 * read the inbox's display and nothing else, so the team's board default
 * above could never be reached: lighting a teammate's face left you in the
 * list. There is one page now, so "per page" is read as "per audience". Each
 * half remembers what was last chosen for it, which is why this is a lookup
 * and not an effect that forces board on and overrules a choice.
 */
export const pageFor = (withOthers: boolean): PageId => (withOthers ? 'team' : 'inbox');

const KEY = (page: PageId) => `threads.display.${page}`;

export function readDisplay(page: PageId, store: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): Display {
  try {
    const raw = store?.getItem(KEY(page));
    if (!raw) return DEFAULT_DISPLAY[page];
    const d = JSON.parse(raw);
    return {
      view: d.view === 'board' || d.view === 'list' ? d.view : DEFAULT_DISPLAY[page].view,
      sort: page === 'team' && d.sort === 'updated' && d.v !== DISPLAY_VERSION ? 'priority'
        : d.sort === 'updated' || d.sort === 'priority' ? d.sort : DEFAULT_DISPLAY[page].sort,
      priorities: Array.isArray(d.priorities) ? d.priorities.filter((p: unknown) => ['urgent', 'high', 'medium', 'low'].includes(p as string)) : [],
      projects: Array.isArray(d.projects) ? d.projects.filter((p: unknown) => typeof p === 'string') : [],
      updated: d.updated === 'today' || d.updated === 'week' ? d.updated : 'any',
    };
  } catch {
    return DEFAULT_DISPLAY[page];
  }
}

export function writeDisplay(page: PageId, d: Display, store: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { store?.setItem(KEY(page), JSON.stringify({ ...d, v: DISPLAY_VERSION })); } catch { /* private mode */ }
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

// URGENT, HIGH, MEDIUM, LOW, newest first inside a level. One comparator, read
// by the list and by every column of the board, because the two disagreed: a
// section promising priority order was not in one (w-5a08121f99).
const RANK: Record<PriorityId, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const byPriority = (a: Ranked, b: Ranked) =>
  RANK[priorityIdOf(a.priority)] - RANK[priorityIdOf(b.priority)] || b.updatedAt - a.updatedAt;
const byUpdated = (a: Ranked, b: Ranked) => b.updatedAt - a.updatedAt;
type Ranked = { priority?: number | null; updatedAt: number };

const order = (d: Display) => (d.sort === 'updated' ? byUpdated : byPriority);

/**
 * The rows in the order the Display menu asked for.
 *
 * PRIORITY USED TO MEAN "LEAVE THEM ALONE", on the grounds that the list
 * arrived in the app's own ranking. That ranking is `byRunningOrder(score)` in
 * App.tsx, where a product's place in her running order is worth a hundred item
 * points: it is the order the fleet takes work in, and it is not what the word
 * Priority on a menu promises. A board was reported running Medium, Low, High,
 * Medium under that heading.
 *
 * The two rows the app makes itself stay at the top of either sort. They belong
 * to no project (`product` is empty, trouble-row.ts and update-row.ts) because
 * they are about every project at once, so ranking them against one project's
 * work would put them somewhere meaningless. `keeps` exempts them for the same
 * reason.
 */
export function sorted<T extends Ranked & { product?: string }>(rows: T[], d: Display): T[] {
  const mine = rows.filter((r) => r.product !== '');
  if (mine.length === rows.length) return rows.slice().sort(order(d));
  return [...rows.filter((r) => r.product === ''), ...mine.sort(order(d))];
}

/** The same order, for the board's cards, which carry a level and no project row. */
export function sortedEntries(entries: BoardEntry[], d: Display): BoardEntry[] {
  return entries.slice().sort(order(d));
}

/* ------------------------------------------------------- the tabs and Tab */

export type TabName = 'inbox' | 'progress' | 'snoozed' | 'done' | 'all';

/**
 * WHERE A PRESS OF TAB LANDS: on the threads page, Tab cycles the states.
 *
 * `order` is handed in rather than written down here, so there is one list of
 * tabs and it is the one the bar is drawing (INBOX_TABS in Pages.tsx). A second
 * copy written out in the key handler is the fault this repo has already had:
 * a Scheduled tab appeared on screen and three presses of Tab landed on a stop
 * with no tab under it.
 *
 * It wraps at both ends, and a view the bar is not drawing lands on the first
 * tab rather than nowhere.
 */
export function nextTab<T extends string>(order: readonly T[], current: string, back = false): T | 'inbox' {
  if (!order.length) return 'inbox';
  const at = order.indexOf(current as T);
  if (at < 0) return order[0];
  return order[(at + (back ? -1 : 1) + order.length) % order.length];
}

/**
 * WHAT A TAB THE FILTERS HAVE EMPTIED SAYS INSTEAD OF "NOTHING NEEDS YOU".
 *
 * Her report with a screenshot: "It says Nothing needs you, but that's not
 * correct because it literally says needs you 13... if you're accidentally on a
 * filter, you can think there's no work for you when there's actually a ton."
 *
 * IT IS TWO SENTENCES, NOT ONE (her second note, 2026-10-01). The first cut of
 * this put the whole of it in the heading: "Your filters hide all 37 threads
 * that need you", 18 point, as the only thing on the page. She read it as
 * telling her off. "It's also nice to be finished with the inbox tasks in your
 * filter. This doesn't really give us a feeling of any reward... This feels
 * almost like a punishment in terms of the harsh text."
 *
 * She is right, and the reason is that one screen covers two moments. You left
 * a filter on by accident, or you just finished everything in it, and from the
 * app's side those look identical. So the heading says the half that is true of
 * both and is good news in either, in the same shape as "Nothing needs you"
 * next door, and the number moves into a quiet line under it where it informs
 * rather than accuses.
 */
export function filteredEmptyWords(view: TabName | string, hidden: number): { head: string; line: string } {
  const head = {
    progress: 'Nothing in your filter is running',
    snoozed: 'Nothing in your filter is scheduled',
    done: 'Nothing in your filter is closed',
    all: 'No threads match your filter',
  }[view as string] ?? 'Nothing in your filter needs you';
  const line = hidden === 1
    ? 'One more thread is behind your filters.'
    : `${hidden} more threads are behind your filters.`;
  return { head, line };
}

/**
 * THE PROJECTS THE DISPLAY MENU OFFERS, MOST RECENTLY USED FIRST.
 *
 * A store with about forty projects drew 37 chips in nine rows, taller than the
 * rest of the menu put together. So eight, ranked by the newest thread in each,
 * and the rest behind one button.
 *
 * A PICKED PROJECT IS NEVER IN `rest`. A chip that is on and out of sight is
 * the same silent filter the honest empty state exists to stop.
 */
export function projectChoices(
  products: Product[],
  items: Pick<WorkItem, 'product' | 'updatedAt' | 'agent'>[],
  { picked = [], limit = 8 }: { picked?: string[]; limit?: number } = {},
): { shown: Product[]; rest: Product[] } {
  const last = new Map<string, number>();
  for (const i of items) {
    if (i.agent) continue;
    const was = last.get(i.product) ?? 0;
    if (i.updatedAt > was) last.set(i.product, i.updatedAt);
  }
  const ranked = products
    .filter((p) => !isDirect(p) && !(p as { practice?: boolean }).practice)
    .sort((a, b) => (last.get(b.slug) ?? 0) - (last.get(a.slug) ?? 0) || a.name.localeCompare(b.name));
  const on = ranked.filter((p) => picked.includes(p.slug));
  const off = ranked.filter((p) => !picked.includes(p.slug));
  const ordered = [...on, ...off];
  const keep = Math.max(limit, on.length);
  return { shown: ordered.slice(0, keep), rest: ordered.slice(keep) };
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
 * AND NULL WHEN THE COMPANY HOLDS NOBODY WHO IS NOT ALREADY HERE (2026-10-01).
 * The Add people button shows only when there is someone left in the company
 * to add; otherwise it is cleaner not to show it at all. A two person company,
 * or a group that is already everyone,
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
// 'people' SINCE w-41ff964775: shared, but with the people named on it rather
// than the team. The row says which quietly (a count beside the mark) and the
// summary panel is where the list is changed.
export function rowSharing(
  item: Pick<WorkItem, 'visibility' | 'visibleTo' | 'createdAt' | 'createdBy' | 'agent'>,
  product: Product | undefined | null,
  team: { me: string | null; since?: number | null } | null,
): Seen | null {
  if (!team || !product || isDirect(product) || item.agent) return null;
  if (item.createdBy && item.createdBy !== team.me) return null;
  if (!shownToTeam(item, team.since ?? null)) return 'private';
  return shownToPeople(item).length ? 'people' : 'team';
}

/**
 * WHAT A MESSAGE ROW SAYS, so it reads plainly as a message and shows who it
 * is with. Who else is in the
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

/**
 * What one click on Share or Unshare writes. Share puts a thread in front of
 * the whole team; Unshare takes it away from everyone, whether it was the
 * team's or a few people's. The list of people is left where it is, so
 * unsharing and sharing again does not quietly rebuild it from memory.
 */
export const sharePatch = (now: Seen): { visibility: 'team' | 'private' } =>
  ({ visibility: now === 'private' ? 'team' : 'private' });

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
// `stateOf` IS THE TABS' OWN RULE, handed in by App.tsx (2026-10-01: the board
// said Running for work the tab did not, and Team and Inbox should never
// disagree). Your own threads sit in
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
    // out is how threads once went missing from the board.
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
    // A PRIVATE THREAD IS NOT ON THE BOARD AT ALL (decided 2026-10-01): a lock
    // on the board draws attention to it. Cards are no longer published for
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

/**
 * THE BOARD, COLUMN BY COLUMN, IN THE ORDER IT IS DRAWN. InboxBoard draws
 * exactly this, and App.tsx walks it with J and K (`boardWalk`), so the keys go
 * where the eye goes: down a column, then on to the top of the next. They used
 * to walk the current tab's list, which a card from another column is not in,
 * so J stopped with the board still full (2026-10-02).
 */
export function boardColumns({ items, products, display, now, stateOf, cards = [], picked, me, since = null, live }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number;
  stateOf?: (item: WorkItem) => ThreadStateWord | null;
  cards?: ThreadCard[]; picked?: string[]; me: string | null; since?: number | null; live?: Set<string>;
}): { state: ThreadStateWord; label: string; rows: BoardEntry[] }[] {
  const who = picked ?? (me ? [me] : []);
  const entries = teamEntries({ items: me && !who.includes(me) ? [] : items, products, cards: cards.filter((c) => who.includes(c.personId)), me, now, since, stateOf, live, allMine: true })
    .filter((e) => !e.item || (display.projects.length === 0 || display.projects.includes(e.item.product)))
    .filter((e) => teamKeeps(e, { person: null, projectName: null }, display, now));
  // EVERY COLUMN TAKES THE DISPLAY'S SORT, not just the list view
  // (w-5a08121f99). `teamEntries` hands these back newest first.
  return BOARD_COLUMNS.map((col) => ({ ...col, rows: sortedEntries(entries.filter((e) => e.state === col.state), display) }));
}

/** Your threads on the board, in reading order. A teammate's card has no
 *  thread of yours behind it, so J and K pass over it. */
export function boardWalk(columns: { rows: BoardEntry[] }[]): WorkItem[] {
  return columns.flatMap((c) => c.rows).flatMap((e) => (e.item ? [e.item] : []));
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
