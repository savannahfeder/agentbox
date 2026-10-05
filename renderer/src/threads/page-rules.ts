// THE INBOX AND TEAM PAGES' PURE RULES (approved 2026-10-01, w-e731ca9376).
//
// No React and no styles, so tests read them directly
// (tests/threads-the-pages.test.mjs). What a Display menu choice keeps, how
// the rows are ordered, how "Updated" is said, and what goes in each board
// column for the Team, where your own threads come from this Mac and your
// teammates' from the cards their Macs publish.
import { shownToPeople, shownToTeam, visibilityOf } from '../../../shared/thread-cards.mjs';
import type { Seen } from './summary-rules';
import type { Product, ThreadCard, ThreadStateWord, WorkItem } from '../types';
import { priorityIdOf, type PriorityId } from '../priority';
import { firstRealLine } from '../format';
import { threadState } from '../../../shared/thread-cards.mjs';
import { placeScore } from '../../../shared/rank.mjs';
import { plainWords } from '../team/agent-mentions';

export type PageId = 'inbox' | 'team';
export type UpdatedWindow = 'today' | 'week' | 'any';
/** Privacy: Private, Shared, or neither picked ('any'). */
export type Privacy = 'any' | 'shared' | 'private';
export interface Display {
  view: 'list' | 'board';
  sort: 'priority' | 'updated';
  priorities: PriorityId[];
  projects: string[];
  updated: UpdatedWindow;
  /** Absent on a display saved before the choice existed, which reads as All. */
  privacy?: Privacy;
}

// Your own page opens as a list and the team page as a board, by default, and
// either is remembered once changed.
export const DEFAULT_DISPLAY: Record<PageId, Display> = {
  inbox: { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' },
  team: { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' },
};

/**
 * HIDE PRIVATE, FOR WHEN SOMEBODY IS LOOKING AT YOUR SCREEN (2026-10-04,
 * w-f6ea56b89a): "I'm showing the app to my friends, it would be nice in that
 * case to be able to filter out the private tasks." A private thread is
 * exactly a row that wears the lock (`rowSharing` says 'private'), so the
 * filter takes away what the eye already reads as private. A row where the
 * question does not arise (a message, an agent, the app's own rows) is not
 * private and stays under Hide private.
 */
export function keepsPrivacy(seen: Seen | null | undefined, privacy: Privacy | undefined): boolean {
  if (privacy === 'shared') return seen !== 'private';
  if (privacy === 'private') return seen === 'private';
  return true;
}

/** A click on Private or Shared picks it, and a click on the lit one lets go,
 *  the way the Priority line works. */
export const nextPrivacy = (now: Privacy | undefined, clicked: Exclude<Privacy, 'any'>): Privacy =>
  (now === clicked ? 'any' : clicked);

// ONE CHOICE FOR THE WHOLE PAGE, not one per half of it. Each half remembers
// its own view and filters, and a privacy choice kept in only one of them
// would bring every private row back the moment a teammate's face was lit.
const PRIVACY_KEY = 'threads.privacy';

export function readPrivacy(store: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): Privacy {
  try {
    const p = JSON.parse(store?.getItem(PRIVACY_KEY) ?? 'null');
    return p === 'shared' || p === 'private' ? p : 'any';
  } catch {
    return 'any';
  }
}

export function writePrivacy(p: Privacy, store: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { store?.setItem(PRIVACY_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

/** The display the page draws: the half it is on, with the one privacy choice
 *  on it. Off a team no row is private, so there it is always All. */
export const pageDisplay = (d: Display, privacy: Privacy, onTeam: boolean): Display =>
  ({ ...d, privacy: onTeam ? privacy : 'any' });

// V FLIPS THE VIEW AND NOTHING ELSE (w-58c8f466e7): the sort and every filter
// stay, because the list and the board are the same threads in two shapes.
export const flipView = (d: Display): Display => ({ ...d, view: d.view === 'board' ? 'list' : 'board' });

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
export const isFiltered = (d: Display) => d.priorities.length > 0 || d.projects.length > 0 || d.updated !== 'any'
  || d.privacy === 'shared' || d.privacy === 'private';

const startOfDay = (now: number) => { const t = new Date(now); t.setHours(0, 0, 0, 0); return t.getTime(); };

/** What the filters keep. The rows the app makes itself (no project) always
 *  stay. `seen` is who sees the row (`rowSharing`), for the privacy choice. */
export function keeps(item: Pick<WorkItem, 'priority' | 'product' | 'updatedAt'>, d: Display, now: number, seen?: Seen | null): boolean {
  if (!keepsPrivacy(seen, d.privacy)) return false;
  if (d.priorities.length && !d.priorities.includes(priorityIdOf(item.priority))) return false;
  if (d.projects.length && item.product && !d.projects.includes(item.product)) return false;
  if (d.updated === 'today' && !(item.updatedAt >= startOfDay(now))) return false;
  if (d.updated === 'week' && !(item.updatedAt >= now - 7 * 86_400_000)) return false;
  return true;
}

// YOUR PROJECT ORDER, THEN URGENT, HIGH, MEDIUM, LOW, newest first inside a
// level. One comparator, read by the list, by every column of the board and by
// the merge of a teammate's rows, because the two disagreed: a section
// promising priority order was not in one (w-5a08121f99).
//
// PRIORITY INCLUDES PROJECTS (w-e263a8a0fb, 2026-10-02): the board ran each
// thread's own level alone, so one project's threads were scattered down a
// column and the order set in Settings > Project priority counted for nothing
// on the page. A project's place comes first, by `productRankScore`, the same
// rule the fleet runs by; inside one project the level is the number the row
// shows, so the levels never read out of order. A project never placed scores
// nothing, so with no order this is the level sort it was.
//
// A CONVERSATION RANKS WITH YOUR TOP PROJECT (w-2e8aa16f0f): `direct` names
// the conversation projects, and `placeScore` gives them the top place, so a
// High message sits under that project's Urgent and above its Medium.
const RANK: Record<PriorityId, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const byPriority = (projectOrder: string[] = [], direct?: ReadonlySet<string>) => (a: Ranked, b: Ranked) =>
  placeScore(projectOrder, b.product ?? '', direct) - placeScore(projectOrder, a.product ?? '', direct)
  || RANK[priorityIdOf(a.priority)] - RANK[priorityIdOf(b.priority)] || b.updatedAt - a.updatedAt;
const byUpdated = (a: Ranked, b: Ranked) => b.updatedAt - a.updatedAt;
/** `product` is the project's slug, which is what the running order holds. */
export type Ranked = { priority?: number | null; updatedAt: number; status?: string; wrote?: WorkItem['wrote']; product?: string | null };

/**
 * WHEN A THREAD WAS FINISHED: the moment its status was written as done, which
 * the fold keeps per field. Not `updatedAt`, which a label or a late note moves:
 * 8 of 734 finished threads on a real store were touched more than a day after
 * they were done (2026-10-02). A row with no record of it, a teammate's card
 * among them, falls back to when it last changed, and so does any row that is
 * not finished.
 */
export const finishedAt = (r: Ranked): number => (r.status === 'done' && r.wrote?.status?.ts) || r.updatedAt;
const byFinished = (a: Ranked, b: Ranked) => finishedAt(b) - finishedAt(a);

// THE DONE TAB IS A HISTORY, NOT A QUEUE (w-c61f5bf497). Under Sort by Priority
// it was a wall of Urgent rows in no order a reader could follow, and nothing
// in it is waiting on a priority any more. So Done always runs newest finished
// first, and every other tab keeps the Display's sort.
const order = (d: Display, tab?: string, projectOrder: string[] = [], direct?: ReadonlySet<string>) =>
  (tab === 'done' ? byFinished : d.sort === 'updated' ? byUpdated : byPriority(projectOrder, direct));

/** The time column's heading: on Done it is when each thread was finished. */
export const timeHeading = (tab?: string) => (tab === 'done' ? 'Done' : 'Updated');

/**
 * The rows in the order the Display menu asked for.
 *
 * PRIORITY USED TO MEAN "LEAVE THEM ALONE", on the grounds that the list
 * arrived in the app's own ranking. That ranking is `byRunningOrder(score)` in
 * App.tsx, which throws away a level an agent wrote, so a board was reported
 * running Medium, Low, High, Medium under that heading. It sorts here now, by
 * `projectOrder` (your running order of projects) and then the level each row
 * shows.
 *
 * The two rows the app makes itself stay at the top of either sort. They belong
 * to no project (`product` is empty, trouble-row.ts and update-row.ts) because
 * they are about every project at once, so ranking them against one project's
 * work would put them somewhere meaningless. `keeps` exempts them for the same
 * reason.
 */
export function sorted<T extends Ranked & { product?: string }>(rows: T[], d: Display, tab?: string, projectOrder: string[] = [], direct?: ReadonlySet<string>): T[] {
  const by = order(d, tab, projectOrder, direct);
  const mine = rows.filter((r) => r.product !== '');
  if (mine.length === rows.length) return rows.slice().sort(by);
  return [...rows.filter((r) => r.product === ''), ...mine.sort(by)];
}

/** The same order, for the board's cards, which carry a level and a project
 *  slug. A card of yours is timed by its thread, so Done reads when it finished. */
export function sortedEntries(entries: BoardEntry[], d: Display, column?: string, projectOrder: string[] = [], direct?: ReadonlySet<string>): BoardEntry[] {
  const by = order(d, column, projectOrder, direct);
  const timed = (e: BoardEntry): Ranked => ({ ...e, product: e.projectSlug, ...(e.item ? { status: e.item.status, wrote: e.item.wrote } : {}) });
  return entries.slice().sort((a, b) => by(timed(a), timed(b)));
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
    snoozed: 'Nothing in your filter is in Later',
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

/** The conversation projects among these, which Sort by Priority ranks with
 *  your top project (`byPriority`, w-2e8aa16f0f). */
export const conversationSlugs = (products: readonly Product[] = []): ReadonlySet<string> =>
  new Set(products.filter(isDirect).map((p) => p.slug));

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
  if (!shownToTeam(item, team.since ?? null, product)) return 'private';
  return shownToPeople(item, product).length ? 'people' : 'team';
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
  // An agent mentioned in the message reads as its words, not its link (w-7b9cb8636a).
  //
  // AND THE LINE TAKEN IS THE LATEST REAL ONE (w-560647d4db). This took the
  // message's first line, full stop, and the first real conversation between
  // two teammates had a message opening on "Additional:" with the findings
  // under it — so the row said a word that is not news and not even a subject.
  // `firstRealLine` steps over a bare label and takes the line under it; it
  // runs AFTER the mention links are flattened, so a message opening on a
  // mention is judged on the words somebody actually reads.
  const text = firstRealLine(plainWords(String((answered ? item.answer : item.body) || item.title || '')));
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
    if (!allMine && visibilityOf(item, product) !== 'private' && !shownToTeam(item, since, product)) continue;
    const state = stateOf?.(item) ?? threadState(item, now);
    if (state === 'done' && !(item.updatedAt >= today)) continue;
    out.push({
      key: `mine/${item.product}/${item.id}`, ownerId: me, state, title: item.label || item.title, project: product.name,
      projectSlug: product.slug, priority: item.priority ?? null, updatedAt: item.updatedAt, item, card: null,
      live: !!live?.has(item.id),
    });
  }
  // A teammate's card names its project and not its slug. A shared project
  // carries the same name on every Mac, so the name finds your copy of it, and
  // with it the project's place in your order.
  const slugOfName = new Map(products.map((p) => [p.name, p.slug]));
  for (const card of cards) {
    if (card.personId === me) continue;
    // A PRIVATE THREAD IS NOT ON THE BOARD AT ALL (decided 2026-10-01): a lock
    // on the board draws attention to it. Cards are no longer published for
    // them; one left over from before is skipped here.
    if (!card.visible) continue;
    if (card.state === 'done' && !(card.updatedAt >= today)) continue;
    out.push({
      key: `card/${card.personId}/${card.threadId}`, ownerId: card.personId, state: card.state, title: card.visible ? card.title : null,
      project: card.visible ? card.project : null, projectSlug: (card.visible && slugOfName.get(card.project ?? '')) || null, priority: card.priority, updatedAt: card.updatedAt, item: null, card,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

// LATER, AS THE TAB SAYS (w-23fc91bff5). The tab was renamed from Scheduled on
// w-afb66e6661 and this column kept the old word, one screen away from it.
export const BOARD_COLUMNS: { state: ThreadStateWord; label: string }[] = [
  { state: 'waiting', label: 'Waiting' },
  { state: 'running', label: 'In progress' },
  { state: 'scheduled', label: 'Later' },
  { state: 'done', label: 'Done today' },
];

/* ------------------------------------------- the columns, in your order */
// THE COLUMNS ARE YOURS TO ORDER (w-23fc91bff5): "make the columns in the board
// draggable so you can move them around to reorder your board as desired".
// One order for the board, remembered on this Mac, and handed to
// `boardColumns` so what is drawn and what J, K and the arrows walk agree.
export const DEFAULT_COLUMN_ORDER: ThreadStateWord[] = BOARD_COLUMNS.map((c) => c.state);
const COLUMN_KEY = 'threads.board.columns';

/** The saved order, made whole: a column it does not know is dropped and a
 *  column it is missing goes back at the end, so no column is ever lost. */
export function readColumnOrder(store: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): ThreadStateWord[] {
  try {
    const saved = JSON.parse(store?.getItem(COLUMN_KEY) ?? 'null');
    if (!Array.isArray(saved)) return DEFAULT_COLUMN_ORDER;
    const known = [...new Set(saved.filter((s): s is ThreadStateWord => DEFAULT_COLUMN_ORDER.includes(s)))];
    return [...known, ...DEFAULT_COLUMN_ORDER.filter((s) => !known.includes(s))];
  } catch {
    return DEFAULT_COLUMN_ORDER;
  }
}

export function writeColumnOrder(order: ThreadStateWord[], store: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { store?.setItem(COLUMN_KEY, JSON.stringify(order)); } catch { /* private mode */ }
}

/**
 * THE SLOT A CARRIED COLUMN IS OVER, from numbers alone: the slots' centres,
 * measured once when the drag starts, and where the carried column's middle
 * is now. The nearest centre wins, so it changes exactly halfway between two.
 * It used to be read off the column the browser said was under the pointer,
 * and a column sliding out of the way is still drawn there for a few frames,
 * so a swap undid itself every frame: "swapping back and forth at about 40
 * frames per second" (2026-10-02).
 */
export function slotUnder(centres: number[], x: number): number {
  let best = -1;
  for (let i = 0; i < centres.length; i++) if (best < 0 || Math.abs(centres[i] - x) < Math.abs(centres[best] - x)) best = i;
  return best;
}

/** The order with `state` moved to place `index`, the rest closing up. */
export function columnTo(order: ThreadStateWord[], state: string, index: number): ThreadStateWord[] {
  if (index < 0 || index >= order.length || !order.includes(state as ThreadStateWord)) return order.slice();
  const next = order.filter((s) => s !== state);
  next.splice(index, 0, state as ThreadStateWord);
  return next;
}

/** A column dropped on another takes that column's place: moving right it
 *  lands after it, moving left before it, which is where the eye put it. */
export function moveColumn(order: ThreadStateWord[], from: string, to: string): ThreadStateWord[] {
  const a = order.indexOf(from as ThreadStateWord);
  const b = order.indexOf(to as ThreadStateWord);
  if (a < 0 || b < 0 || a === b) return order.slice();
  const next = order.filter((s) => s !== from);
  next.splice(b, 0, from as ThreadStateWord);
  return next;
}

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
export function boardColumns({ items, products, display, now, stateOf, cards = [], picked, me, since = null, live, order = DEFAULT_COLUMN_ORDER, projectOrder = [] }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number;
  stateOf?: (item: WorkItem) => ThreadStateWord | null;
  cards?: ThreadCard[]; picked?: string[]; me: string | null; since?: number | null; live?: Set<string>;
  /** The columns left to right, as you dragged them (`readColumnOrder`). */
  order?: ThreadStateWord[];
  /** Your running order of projects, which Sort by Priority reads first. */
  projectOrder?: string[];
}): { state: ThreadStateWord; label: string; rows: BoardEntry[] }[] {
  const who = picked ?? (me ? [me] : []);
  // A teammate's card is shared with you by definition, so it is never private.
  const seen = (e: BoardEntry): Seen | null => (e.item
    ? rowSharing(e.item, products.find((p) => p.slug === e.item!.product), me ? { me, since } : null)
    : 'team');
  const entries = teamEntries({ items: me && !who.includes(me) ? [] : items, products, cards: cards.filter((c) => who.includes(c.personId)), me, now, since, stateOf, live, allMine: true })
    .filter((e) => !e.item || (display.projects.length === 0 || display.projects.includes(e.item.product)))
    .filter((e) => keepsPrivacy(seen(e), display.privacy))
    .filter((e) => teamKeeps(e, { person: null, projectName: null }, display, now));
  // EVERY COLUMN TAKES THE DISPLAY'S SORT, not just the list view
  // (w-5a08121f99). `teamEntries` hands these back newest first. Except Done
  // today, which runs newest finished first like the Done tab (w-c61f5bf497).
  return order.flatMap((state) => BOARD_COLUMNS.filter((c) => c.state === state))
    .map((col) => ({ ...col, rows: sortedEntries(entries.filter((e) => e.state === col.state), display, col.state, projectOrder, conversationSlugs(products)) }));
}

/** Your threads on the board, in reading order. A teammate's card has no
 *  thread of yours behind it, so J and K pass over it. */
export function boardWalk(columns: { rows: BoardEntry[] }[]): WorkItem[] {
  return columns.flatMap((c) => c.rows).flatMap((e) => (e.item ? [e.item] : []));
}

/**
 * THE LEFT AND RIGHT ARROWS ON THE BOARD (w-23fc91bff5): from the card the
 * keyboard is on (`index` in `boardWalk`) to the card level with it in the
 * nearest column that has a thread of yours in it, or the last card there if
 * that column is shorter. At either edge it stays put. Returns an index in
 * `boardWalk`, which is what App.tsx's `selected` counts.
 */
export function boardSideways(columns: { rows: BoardEntry[] }[], index: number, dir: 1 | -1): number {
  const mine = columns.map((c) => c.rows.flatMap((e) => (e.item ? [e.item] : [])));
  let start = 0;
  for (let c = 0; c < mine.length; c++) {
    const row = index - start;
    if (row >= 0 && row < mine[c].length) {
      for (let n = c + dir; n >= 0 && n < mine.length; n += dir) {
        if (!mine[n].length) continue;
        const before = mine.slice(0, n).reduce((sum, col) => sum + col.length, 0);
        return before + Math.min(row, mine[n].length - 1);
      }
      return index;
    }
    start += mine[c].length;
  }
  return index;
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
