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
import { rowSharing, type Display } from './page-rules';

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

/**
 * THE FACES DRAWN, AT MOST FOUR MARKS. You first, then whoever is picked, then
 * the rest by name. Past four people, three faces and "+N", so the row never
 * grows with the team. Alone on a team there is nobody to pick and nothing is
 * drawn.
 */
export function facesShown(everyone: Person[], picked: string[], me: string | null, max = 4): { faces: Person[]; more: number } {
  if (everyone.filter((p) => p.id !== me).length === 0) return { faces: [], more: 0 };
  const byName = (a: Person, b: Person) => (a.name || a.email || '').localeCompare(b.name || b.email || '');
  const mine = everyone.filter((p) => p.id === me);
  const others = everyone.filter((p) => p.id !== me);
  const ordered = [...mine, ...others.filter((p) => picked.includes(p.id)).sort(byName), ...others.filter((p) => !picked.includes(p.id)).sort(byName)];
  if (ordered.length <= max) return { faces: ordered, more: 0 };
  return { faces: ordered.slice(0, max - 1), more: ordered.length - (max - 1) };
}

/** The first tab: Needs you on your own page, Waiting once anyone else is on it. */
export const needsWord = (picked: string[], me: string | null) => (othersInView(picked, me) ? 'Waiting' : 'Needs you');

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
 * first of yours that is less urgent.
 */
export function mergeRows(mine: WorkItem[], theirs: ThreadCard[], sort: Display['sort']): MixedRow[] {
  const updated = sort === 'updated';
  const cards = theirs.slice().sort((a, b) => (updated ? 0 : RANK[priorityIdOf(a.priority)] - RANK[priorityIdOf(b.priority)]) || b.updatedAt - a.updatedAt);
  const ahead = (c: ThreadCard, i: WorkItem) => (updated
    ? c.updatedAt > i.updatedAt
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
 * THE LOCK, WHERE IT TELLS YOU SOMETHING. On a thread of yours the team cannot
 * see, while a teammate is on the page beside you: that is when "they cannot
 * see this one" is news. On your page alone every row is yours, and nearly all
 * of them are private, so a
 * lock there would be on every line and say nothing.
 */
export function privateMark(
  item: Pick<WorkItem, 'visibility' | 'createdAt' | 'createdBy' | 'agent'>,
  product: Product | undefined | null,
  team: { me: string | null; since?: number | null } | null,
  withOthers: boolean,
): boolean {
  return withOthers && rowSharing(item, product, team) === 'private';
}
