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
import { boardColumns, DEFAULT_DISPLAY, keeps, sentAt, sorted, updatedWords, type Display } from '../../../renderer/src/threads/page-rules';
import { searchThreads } from '../../../renderer/src/threads/search';
import { parseQuery, splitHits } from '../../../renderer/src/search';
import { stamp } from '../../../renderer/src/format';
import { isUrgentRow } from '../../../renderer/src/interrupt';
import { toApproveWords, waitingCounts } from '../../../renderer/src/threads-made';
import type { phoneView } from '../../../renderer/src/phone-rows';
import type { ThreadStateWord } from '../../../renderer/src/types';

export type TabId = 'inbox' | 'progress' | 'snoozed' | 'done';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'inbox', label: 'Needs you' },
  { id: 'progress', label: 'In progress' },
  { id: 'snoozed', label: 'Later' },
  { id: 'done', label: 'Done' },
];

type View = Pick<ReturnType<typeof phoneView>, 'items' | 'running' | 'products'>;
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
  item: any;
}

// The desktop stamps the moment it first knew to deliver an agent's answers
// (App.tsx `deliveredThrough`), years before any phone. Zero is that, for
// every desktop the phone could be reading.
const DELIVERED_THROUGH = 0;

export function phoneTabs(view: View, now = Date.now()): Record<TabId, Row[]> {
  const items: any[] = view.items;
  const live = new Set(view.running.map((r: { itemId: string }) => r.itemId));
  const inCloud = new Set(view.running.filter((r: { where?: string }) => r.where === 'cloud').map((r: { itemId: string }) => r.itemId));
  const byId = new Map(items.map((i) => [i.id, i]));
  const waitingOn = (i: any) => waitsThatCanEnd(i, byId);
  const hiddenAt = (i: any) => hiddenUntil(i);
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
  const order = view.products.map((p: { slug: string }) => p.slug);
  const row = (i: any): Row => ({
    key: `${i.product}/${i.id}`, id: i.id, product: i.product, title: rowTitle(i), projectName: names.get(i.product) ?? '',
    when: updatedWords(i.status === 'done' ? i.wrote?.status?.ts ?? i.updatedAt : sentAt(i), now), running: live.has(i.id), cloud: inCloud.has(i.id),
    held: notStarted(i), toApprove: toApproveWords(toApprove.get(`${i.product}/${i.id}`)), item: i,
  });
  const drawn = (list: any[], tab: TabId) => sorted(list, DEFAULT_DISPLAY.inbox, tab, order).map(row);
  return { inbox: drawn(inbox, 'inbox'), progress: drawn(progress, 'progress'), snoozed: drawn(snoozed, 'snoozed'), done: drawn(done, 'done') };
}

/** Each tab as View and filters leave it (App.tsx `displayedBox`), and how many it holds before them. */
export function shownTabs(tabs: Record<TabId, Row[]>, display: Display, now: number, order: string[]) {
  const pick = (tab: TabId) => {
    const byItem = new Map(tabs[tab].map((r) => [r.item, r]));
    return sorted(tabs[tab].filter((r) => keeps(r.item, display, now)).map((r) => r.item), display, tab, order).map((i) => byItem.get(i)!);
  };
  return {
    rows: { inbox: pick('inbox'), progress: pick('progress'), snoozed: pick('snoozed'), done: pick('done') } as Record<TabId, Row[]>,
    whole: { inbox: tabs.inbox.length, progress: tabs.progress.length, snoozed: tabs.snoozed.length, done: tabs.done.length } as Record<TabId, number>,
  };
}

/** The board, column by column, as the site draws it (page-rules.ts `boardColumns`). */
export function phoneBoard(view: View, tabs: Record<TabId, Row[]>, display: Display, now: number) {
  const state = new Map<string, ThreadStateWord>();
  for (const [tab, word] of [['done', 'done'], ['snoozed', 'scheduled'], ['progress', 'running'], ['inbox', 'waiting']] as const) for (const r of tabs[tab]) state.set(r.id, word);
  const live = new Set(view.running.map((r: { itemId: string }) => r.itemId));
  const columns = boardColumns({
    items: view.items as any[], products: view.products as any[], display, now, me: null, live,
    stateOf: (i) => state.get(i.id) ?? null, projectOrder: view.products.map((p: { slug: string }) => p.slug),
  });
  // Your own board says what the tab says (Pages.tsx `InboxBoard`).
  return columns.map((c) => ({ ...c, label: c.state === 'waiting' ? 'Needs you' : c.label }));
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
  const items: any[] = view.items;
  const asks = new Map(Object.values(tabs ?? {}).flat().map((r) => [r.key, r.toApprove]));
  const { terms, phrase } = parseQuery(query);
  const runs = (text: string) => (terms.length ? splitHits(text, terms, phrase) : [{ text, hit: false }]);
  return searchThreads(items, query, { products: view.products as any[], people: [], me: null }).map(({ item, summary }: { item: any; summary: string }) => {
    const p = item.priority ?? 5;
    return {
      key: `${item.product}/${item.id}`, id: item.id, product: item.product,
      title: runs(rowTitle(item)), summary: runs(summary ?? ''), toApprove: asks.get(`${item.product}/${item.id}`) ?? '',
      bars: isUrgentRow(item) ? null : p >= 7 ? 3 : p <= 2 ? 1 : null,
      projectName: item.productName ?? '', when: stamp(item.updatedAt, now),
    };
  });
}
