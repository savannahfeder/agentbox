// WHOSE THREADS THE PAGE SHOWS (w-05ff3d1438, 2026-10-01).
//
// The Inbox and the Team page became one page: the Inbox's tabs, and a small
// row of faces at the end of the tab bar that picks whose threads are on it.
// You are picked by default, so the page opens as your inbox; picking a
// teammate puts their threads in the same table, under the same tabs, with a
// Person column. Pure, so tests read it directly
// (tests/team-one-page-shows-the-people-you-pick.test.mjs).
import type { Person, Product, ThreadCard, WorkItem } from '../types';
import { priorityIdOf, type PriorityId } from '../priority';
import { finishedAt, rowSharing, type Display } from './page-rules';

const KEY = 'threads.people';

/** The people picked, as the page left them, or null when nothing was kept. */
export function readPicked(store: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): string[] | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : null;
  } catch {
    return null;
  }
}

export function writePicked(picked: string[], store: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { store?.setItem(KEY, JSON.stringify(picked)); } catch { /* private mode */ }
}

/** Only people still on the team, and never nobody: you, when nothing is left. */
export function normalizePicked(picked: string[] | null, me: string | null, known: string[]): string[] {
  const kept = (picked ?? []).filter((id) => known.includes(id));
  return kept.length ? kept : me ? [me] : [];
}

/** A face is a switch. The last one picked stays picked: an empty page says nothing. */
export function togglePicked(picked: string[], id: string, _me: string | null): string[] {
  if (!picked.includes(id)) return [...picked, id];
  const left = picked.filter((p) => p !== id);
  return left.length ? left : picked;
}

export const othersInView = (picked: string[], me: string | null) => picked.some((p) => p !== me);

/** The first tab: Needs you on your own page, Waiting once anyone else is on it. */
export const needsWord = (picked: string[], me: string | null) => (othersInView(picked, me) ? 'Waiting' : 'Needs you');

/**
 * WHOSE THREADS ARE ON THE PAGE, IN ONE PHRASE (w-57034cf3c0). The bar used to
 * end in up to four face chips and a "+N", which is five things to read at the
 * end of the one row that has to stay quiet, and which say nothing at a glance
 * that a phrase does not say better. One filter stands there now, and this is
 * the word in it: Everyone, Just you, You and Maya, You and 2 others.
 */
export function whoseWord(everyone: Person[], picked: string[], me: string | null): string {
  const first = (p: Person) => (p.name || p.email || 'Someone').split(/[\s@]/)[0];
  const shown = everyone.filter((p) => picked.includes(p.id));
  if (everyone.length > 1 && shown.length === everyone.length) return 'Everyone';
  const others = shown.filter((p) => p.id !== me);
  if (!others.length) return 'Just you';
  const youToo = me !== null && picked.includes(me);
  if (others.length === 1) return youToo ? `You and ${first(others[0])}` : first(others[0]);
  return youToo ? `You and ${others.length} others` : `${others.length} people`;
}

/**
 * THE FACES ON THE VIEW AND FILTERS BUTTON (w-14bb56c833). Whose threads are on
 * the page, said with faces on the button that changes it, so the choice needs
 * no row of its own over the board. You first, then the others by name, three
 * at most and a count for the rest. Null on a team of one: nothing to choose.
 */
export function facesOnButton(everyone: Person[], picked: string[], me: string | null, max = 3): { faces: Person[]; more: number } | null {
  if (!everyone.some((p) => p.id !== me)) return null;
  const name = (p: Person) => p.name || p.email || '';
  const shown = everyone.filter((p) => picked.includes(p.id));
  const ordered = [...shown.filter((p) => p.id === me), ...shown.filter((p) => p.id !== me).sort((a, b) => name(a).localeCompare(name(b)))];
  return { faces: ordered.slice(0, max), more: Math.max(0, ordered.length - max) };
}

/**
 * WHETHER THE PEOPLE CHOICE LIGHTS THE FILTERS DOT. The dot says something is
 * being held back from you. Just you is the everyday state and the expected
 * one, so it lights nothing (their words: "we don't want to distract people
 * with that little dot"); everyone lights nothing either. Any other narrowing
 * hides somebody's threads, and does.
 */
export function peopleWorthADot(everyone: Person[], picked: string[], me: string | null): boolean {
  if (!everyone.some((p) => p.id !== me)) return false;
  const shown = everyone.filter((p) => picked.includes(p.id));
  if (shown.length === everyone.length) return false;
  return !(shown.length === 1 && shown[0].id === me);
}

type Tab = 'inbox' | 'progress' | 'snoozed' | 'done' | 'all';
const TAB_STATE: Record<Tab, (s: ThreadCard['state']) => boolean> = {
  inbox: (s) => s === 'waiting',
  progress: (s) => s === 'running',
  snoozed: (s) => s === 'scheduled',
  done: (s) => s === 'done',
  all: (s) => s !== 'done',
};

const startOfDay = (now: number) => { const t = new Date(now); t.setHours(0, 0, 0, 0); return t.getTime(); };

/**
 * A PICKED TEAMMATE'S THREADS FOR ONE TAB, from the cards their Macs publish.
 * A private thread publishes no card, so it is never here; a card of your own
 * is skipped because your own rows come from this Mac.
 */
export function teammateRows(cards: ThreadCard[], { tab, picked, me, display, products, now }: {
  tab: string; picked: string[]; me: string | null; display: Display; products: Product[]; now: number;
}): ThreadCard[] {
  const inTab = TAB_STATE[tab as Tab];
  if (!inTab) return [];
  const slugOf = new Map(products.map((p) => [p.name, p.slug]));
  return cards.filter((c) => {
    if (c.personId === me || !picked.includes(c.personId) || !c.visible) return false;
    if (!inTab(c.state)) return false;
    if (display.priorities.length && !display.priorities.includes(priorityIdOf(c.priority))) return false;
    if (display.projects.length && !display.projects.includes(slugOf.get(c.project ?? '') ?? '')) return false;
    if (display.updated === 'today' && !(c.updatedAt >= startOfDay(now))) return false;
    if (display.updated === 'week' && !(c.updatedAt >= now - 7 * 86_400_000)) return false;
    return true;
  });
}

export type MixedRow = { item: WorkItem; card?: undefined } | { card: ThreadCard; item?: undefined };

const RANK: Record<PriorityId, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * ONE TABLE, YOURS AND THEIRS. Yours arrive already in the order the tab keeps
 * them, and that order is never broken. Theirs fall in by the same sort: by
 * Updated, newest first across everyone; by Priority, a card goes ahead of the
 * first of yours that is less urgent. On the Done tab ('done') by when each
 * finished, newest first; a card says only when it last changed, so that
 * stands in for it.
 */
export function mergeRows(mine: WorkItem[], theirs: ThreadCard[], sort: Display['sort'] | 'done'): MixedRow[] {
  const updated = sort !== 'priority';
  const cards = theirs.slice().sort((a, b) => (updated ? 0 : RANK[priorityIdOf(a.priority)] - RANK[priorityIdOf(b.priority)]) || b.updatedAt - a.updatedAt);
  const ahead = (c: ThreadCard, i: WorkItem) => (updated
    ? c.updatedAt > (sort === 'done' ? finishedAt(i) : i.updatedAt)
    : RANK[priorityIdOf(c.priority)] < RANK[priorityIdOf(i.priority)]);
  const out: MixedRow[] = [];
  let k = 0;
  for (const i of mine) {
    while (k < cards.length && ahead(cards[k], i)) out.push({ card: cards[k++] });
    out.push({ item: i });
  }
  while (k < cards.length) out.push({ card: cards[k++] });
  return out;
}

/**
 * THE LOCK, ON EVERY THREAD ONLY YOU CAN SEE.
 *
 * It used to be drawn only while a teammate's threads were on the page, on the
 * reasoning that a lock on every line says nothing. The cost of that was
 * worse: the same row said "only you can see this" or said nothing depending
 * on which faces were lit at the top of the page, so the mark could not be
 * read at all. It is unconditional now, and so is the people mark that says
 * the opposite, so a row carries exactly one of them and always the same one.
 *
 * `withOthers` is kept and ignored on purpose: every caller passes what it
 * knows, and the next reader of one of them should see that the answer no
 * longer turns on it.
 */
export function privateMark(
  item: Pick<WorkItem, 'visibility' | 'createdAt' | 'createdBy' | 'agent'>,
  product: Product | undefined | null,
  team: { me: string | null; since?: number | null } | null,
  _withOthers?: boolean,
): boolean {
  return rowSharing(item, product, team) === 'private';
}
