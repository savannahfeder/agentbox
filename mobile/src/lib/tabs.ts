// THE DESKTOP'S FOUR TABS, FROM THE COPIES A MAC SENDS ONLINE.
//
// App.tsx builds these lists inline, among teammates, agent sessions, imports
// and the rows the app makes itself, none of which the online inbox carries.
// So this composes the same exported rules for what it does carry, and orders
// rows the way the desktop draws them (`sorted`). Lifting App.tsx's lists into
// one module both read is the follow-up that retires this file.

import {
  belongsInInbox, belongsInProgress, hiddenUntil, inProgressTab, isProposal, notStarted, rowTitle, stillAsksYou, threadsOwedAnAnswer, waitsInLater, waitsThatCanEnd,
} from '../../../renderer/src/list-rules';
import { backWords, boardColumns, DEFAULT_DISPLAY, keeps, sentAt, sorted, updatedWords, type Display } from '../../../renderer/src/threads/page-rules';
import { searchThreads } from '../../../renderer/src/threads/search';
import { parseQuery, splitHits } from '../../../renderer/src/search';
import { stamp } from '../../../renderer/src/format';
import { isUrgentRow } from '../../../renderer/src/interrupt';
import { priorityIdOf } from '../../../renderer/src/priority';
import { toApproveWords, waitingCounts } from '../../../renderer/src/threads-made';
import type { phoneView } from '../../../renderer/src/phone-rows';
import type { ThreadStateWord, WorkItem } from '../../../renderer/src/types';
import { teammateIdOf } from '../../../shared/teammates.mts';
import { keepsAgent, type Harness } from './agent-filter';
import { harnessOf } from '../../../renderer/src/box-filter';

export type TabId = 'inbox' | 'progress' | 'snoozed' | 'done';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'inbox', label: 'Needs you' },
  { id: 'progress', label: 'In progress' },
  { id: 'snoozed', label: 'Later' },
  { id: 'done', label: 'Done' },
];

type View = Pick<ReturnType<typeof phoneView>, 'items' | 'running' | 'products'> & Partial<Pick<ReturnType<typeof phoneView>, 'queued'>>;
export interface Row {
  key: string;
  id: string;
  product: string;
  title: string;
  projectName: string;
  when: string;
  running: boolean;
  /** Running in the cloud rather than on a Mac, which the row marks differently. */
  cloud: boolean;
  /** Added to Later and not begun: "not started" after the title (Pages.tsx `RowCells`). */
  held: boolean;
  /** "2 tasks to approve" after the title, or nothing. */
  toApprove: string;
  /** Sent from a phone and not yet taken by the computer: "Queued" (renderer/src/status-word.ts). */
  queued: boolean;
  /** High or Urgent, marked on the row; Low and Medium are most threads, so they go unmarked. */
  priority: 'high' | 'urgent' | null;
  /** "Claude Code" or "Codex", only when a row of the same title runs on the other one. */
  agent: string | null;
  item: WorkItem;
}

/** The gaps between the inbox's tabs, and before a tab's count; tight when the loose ones do not fit. */
/** The select bar's button, which says what it closes so it does not read as closing the bar beside Cancel. */
export const closeWords = (n: number) => (n === 1 ? 'Close 1 thread' : n > 1 ? `Close ${n} threads` : 'Close');

export const TAB_GAP = { loose: 22, tight: 12 };
export const COUNT_GAP = { loose: 13, tight: 6 };

/**
 * Whether the tabs take their tight gaps. `content` was measured with the gaps
 * `tight` gave it, so it is put back to its loose width before asking whether
 * that fits: the answer does not flip once the tight row fits.
 */
export function tabsTighten({ view, content }: { view: number; content: number }, tight: boolean, { tabs, counted }: { tabs: number; counted: number }) {
  if (view <= 0 || content <= 0) return tight;
  const saved = (tabs - 1) * (TAB_GAP.loose - TAB_GAP.tight) + counted * (COUNT_GAP.loose - COUNT_GAP.tight);
  return content + (tight ? saved : 0) > view + 1;
}

/** Whether a sideways row runs on past its right edge (a 1px slack for rounding). */
export const moreToTheRight = ({ view, content, x }: { view: number; content: number; x: number }) =>
  view > 0 && content - (x + view) > 1;

// The desktop stamps the moment it first knew to deliver an agent's answers
// (App.tsx `deliveredThrough`), years before any phone. Zero is that, for
// every desktop the phone could be reading.
const DELIVERED_THROUGH = 0;

export function phoneTabs(view: View, now = Date.now()): Record<TabId, Row[]> {
  const items: WorkItem[] = view.items;
  const live = new Set(view.running.map((r: { itemId: string }) => r.itemId));
  const queued = new Set(view.queued ?? []);
  const inCloud = new Set(view.running.filter((r: { where?: string }) => r.where === 'cloud').map((r: { itemId: string }) => r.itemId));
  const byId = new Map(items.map((i) => [i.id, i]));
  const waitingOn = (i: WorkItem) => waitsThatCanEnd(i, byId);
  const hiddenAt = (i: WorkItem) => hiddenUntil(i);
  const owed = threadsOwedAnAnswer(items, now);

  const inbox = items.filter((i) => {
    if (live.has(i.id) && !stillAsksYou(i)) return false;
    if (owed.has(i.id)) return true;
    return belongsInInbox(i, { deliveredThrough: DELIVERED_THROUGH, hiddenUntil: hiddenAt(i), now, waitingOn: waitingOn(i) });
  });
  const needsYou = new Set(inbox.map((i) => i.id));
  const progress = inProgressTab(items.filter((i) => {
    if (hiddenAt(i) > now && !live.has(i.id)) return false;
    return belongsInProgress(i, { deferredUntil: i.runAt ?? 0, now, live: live.has(i.id) });
  }), inbox);
  const snoozed = items.filter((i) => (notStarted(i) || isProposal(i) || hiddenAt(i) > now || (waitsInLater(i, waitingOn(i)) && !live.has(i.id)))
    && (i.status !== 'done' || i.wrote?.status?.source !== 'founder'));
  const done = items.filter((i) => !needsYou.has(i.id) && !live.has(i.id) && i.status === 'done');

  // Which tab each thread is in, the later lists winning as App.tsx's `tabState` has it.
  const state = new Map<string, ThreadStateWord>();
  for (const [list, word] of [[done, 'done'], [snoozed, 'scheduled'], [progress, 'running'], [inbox, 'waiting']] as const) for (const i of list) state.set(i.id, word);
  const toApprove = waitingCounts(items, (i) => state.get(i.id) ?? null);

  const names = new Map(view.products.map((p: { slug: string; name: string }) => [p.slug, p.name]));
  const agentsByTitle = new Map<string, Set<string>>();
  for (const i of items) {
    const t = rowTitle(i);
    agentsByTitle.set(t, (agentsByTitle.get(t) ?? new Set()).add(harnessOf(i)));
  }
  const agentOf = (i: WorkItem) => ((agentsByTitle.get(rowTitle(i))?.size ?? 0) > 1 ? (harnessOf(i) === 'codex' ? 'Codex' : 'Claude Code') : null);
  const order = view.products.map((p: { slug: string }) => p.slug);
  // Later says when a thread comes back, and leaves waiting a turn to In progress (Pages.tsx `back`).
  const row = (i: WorkItem, tab: TabId): Row => ({
    key: `${i.product}/${i.id}`, id: i.id, product: i.product, title: rowTitle(i), projectName: names.get(i.product) ?? '',
    when: (tab === 'snoozed' && backWords(i, now)) || updatedWords(i.status === 'done' ? i.wrote?.status?.ts ?? i.updatedAt : sentAt(i), now), running: live.has(i.id), cloud: inCloud.has(i.id),
    held: notStarted(i), toApprove: toApproveWords(toApprove.get(`${i.product}/${i.id}`)), queued: tab !== 'snoozed' && queued.has(i.id) && !live.has(i.id), item: i,
    priority: ((p) => (p === 'high' || p === 'urgent' ? p : null))(priorityIdOf(i.priority)), agent: agentOf(i),
  });
  const drawn = (list: WorkItem[], tab: TabId) => sorted(list, DEFAULT_DISPLAY.inbox, tab, order).map((i) => row(i, tab));
  return { inbox: drawn(inbox, 'inbox'), progress: drawn(progress, 'progress'), snoozed: drawn(snoozed, 'snoozed'), done: drawn(done, 'done') };
}

/** Each tab as View and filters leave it (App.tsx `displayedBox`), and how many it holds before them. */
export function shownTabs(tabs: Record<TabId, Row[]>, display: Display, now: number, order: string[], agent: Harness | null = null) {
  const pick = (tab: TabId) => {
    const byItem = new Map(tabs[tab].map((r) => [r.item, r]));
    return sorted(tabs[tab].filter((r) => keeps(r.item, display, now) && keepsAgent(r.item, agent)).map((r) => r.item), display, tab, order).map((i) => byItem.get(i)!);
  };
  return {
    rows: { inbox: pick('inbox'), progress: pick('progress'), snoozed: pick('snoozed'), done: pick('done') } as Record<TabId, Row[]>,
    whole: { inbox: tabs.inbox.length, progress: tabs.progress.length, snoozed: tabs.snoozed.length, done: tabs.done.length } as Record<TabId, number>,
  };
}

/**
 * View and filters' "Showing N of M": what the screen draws against what it
 * would draw with no filter on. `above` is the rows drawn over the list that no
 * filter hides (mentions, questions, repeating tasks).
 */
export function filterCount({ rows, whole, mineOnly = false, above = 0, board = null, wholeBoard = null }: {
  rows: Pick<Row, 'item'>[]; whole: Pick<Row, 'item'>[]; mineOnly?: boolean; above?: number;
  board?: { rows: unknown[] }[] | null; wholeBoard?: { rows: unknown[] }[] | null;
}) {
  if (board && wholeBoard) {
    const cards = (b: { rows: unknown[] }[]) => b.reduce((n, c) => n + c.rows.length, 0);
    return { shown: cards(board), total: cards(wholeBoard) };
  }
  const counted = (list: Pick<Row, 'item'>[]) => (mineOnly ? list.filter((r) => !teammateIdOf(r.item)) : list).length;
  return { shown: counted(rows) + above, total: counted(whole) + above };
}

/** The board, column by column, as the site draws it (page-rules.ts `boardColumns`). */
export function phoneBoard(view: View, tabs: Record<TabId, Row[]>, display: Display, now: number, agent: Harness | null = null) {
  const state = new Map<string, ThreadStateWord>();
  for (const [tab, word] of [['done', 'done'], ['snoozed', 'scheduled'], ['progress', 'running'], ['inbox', 'waiting']] as const) for (const r of tabs[tab]) state.set(r.id, word);
  const live = new Set(view.running.map((r: { itemId: string }) => r.itemId));
  const columns = boardColumns({
    items: view.items.filter((i: WorkItem) => keepsAgent(i, agent)), products: view.products, display, now, me: null, live,
    stateOf: (i) => state.get(i.id) ?? null, projectOrder: view.products.map((p: { slug: string }) => p.slug),
  });
  // A card waiting its turn says Queued where the running mark would be (Pages.tsx `saysOnCard`).
  const queued = new Set(tabs.progress.filter((r) => r.queued).map((r) => r.id));
  const agentOf = new Map(Object.values(tabs).flat().map((r) => [r.id, r.agent]));
  // Your own board says what the tab says (Pages.tsx `InboxBoard`).
  return columns.map((c) => ({
    ...c, label: c.state === 'waiting' ? 'Needs you' : c.label,
    rows: c.rows.map((e) => ({ ...e, queued: c.state === 'running' && !!e.item && queued.has(e.item.id), agent: (e.item && agentOf.get(e.item.id)) ?? null })),
  }));
}

export interface Hit {
  key: string;
  id: string;
  product: string;
  /** The title and the line under it, in runs, the found words marked. */
  title: { text: string; hit: boolean }[];
  summary: { text: string; hit: boolean }[];
  toApprove: string;
  /** The bars the site's search row draws: high, low, or none (List.tsx). */
  bars: 3 | 1 | null;
  projectName: string;
  when: string;
}

/** Every thread in every tab, closed ones too, as the site's search finds them (App.tsx `hits`). */
export function phoneSearch(view: View, query: string, now = Date.now(), tabs?: Record<TabId, Row[]>): Hit[] {
  const items: WorkItem[] = view.items;
  const asks = new Map(Object.values(tabs ?? {}).flat().map((r) => [r.key, r.toApprove]));
  const { terms, phrase } = parseQuery(query);
  const runs = (text: string) => (terms.length ? splitHits(text, terms, phrase) : [{ text, hit: false }]);
  return searchThreads(items, query, { products: view.products, people: [], me: null }).map(({ item, summary }: { item: WorkItem; summary: string }) => {
    const p = item.priority ?? 5;
    return {
      key: `${item.product}/${item.id}`, id: item.id, product: item.product,
      title: runs(rowTitle(item)), summary: runs(summary ?? ''), toApprove: asks.get(`${item.product}/${item.id}`) ?? '',
      bars: isUrgentRow(item) ? null : p >= 7 ? 3 : p <= 2 ? 1 : null,
      projectName: item.productName ?? '', when: stamp(item.updatedAt, now),
    };
  });
}
