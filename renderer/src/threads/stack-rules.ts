// YOUR THREADS AS ONE LIST (w-b5f23cff71): In progress, then Later, then what
// you finished today, each under a header you can fold. The rows arrive already
// filtered and sorted the way each tab sorts them; this only stacks them.
import type { WorkItem } from '../types';
import { finishedAt } from './page-rules';

export type StackKey = 'progress' | 'later' | 'done' | NeedsKey;
export type StackTab = 'progress' | 'snoozed' | 'done' | 'inbox';
/** Who a row in Needs you waits on you for: a person, or an agent (an AI teammate is one). */
export type NeedsKey = 'people' | 'agents';

export interface StackSection {
  key: StackKey; label: string; count: number; tab: StackTab; folded: boolean;
  /** Drawn with no header: it is the only section and its name is the tab's. */
  bare?: boolean;
}

export interface Stack {
  sections: StackSection[];
  /** The rows of the open sections, in the order they are drawn and walked. */
  rows: WorkItem[];
  sectionOf: (item: WorkItem) => StackKey;
  /** The tab a row's keys and time column belong to. */
  tabOf: (item: WorkItem) => StackTab;
}

const PARTS: { key: StackKey; label: string; tab: StackTab }[] = [
  { key: 'progress', label: 'In progress', tab: 'progress' },
  { key: 'later', label: 'Later', tab: 'snoozed' },
  { key: 'done', label: 'Done today', tab: 'done' },
];

export function stackRows({ progress, later, done, dayStart, folded, laterRules = 0, isChat = () => false }: {
  progress: WorkItem[]; later: WorkItem[]; done: WorkItem[]; dayStart: number; folded: ReadonlySet<string>;
  /** Repeating tasks drawn at the head of Later: a Later with only those still has a header. */
  laterRules?: number;
  /** A conversation with people, which replying closes: not finished work. */
  isChat?: (item: WorkItem) => boolean;
}): Stack {
  const bySection: Partial<Record<StackKey, WorkItem[]>> = { progress, later, done: done.filter((i) => finishedAt(i) >= dayStart && !isChat(i)) };
  const where = new Map<string, StackKey>();
  const sections: StackSection[] = [];
  const rows: WorkItem[] = [];
  for (const part of PARTS) {
    // A thread in two of the lists is in the first, as the tabs settle it (App `tabState`).
    const items = (bySection[part.key] ?? []).filter((i) => !where.has(i.id));
    if (!items.length && !(part.key === 'later' && laterRules > 0)) continue;
    const shut = folded.has(part.key);
    sections.push({ ...part, count: items.length, folded: shut });
    for (const i of items) where.set(i.id, part.key);
    if (!shut) rows.push(...items);
  }
  // With no header left to unfold it, a folded lone section would hide its rows for good.
  if (sections.length === 1 && sections[0].key === 'progress') {
    if (sections[0].folded) rows.push(...(bySection.progress ?? []));
    sections[0] = { ...sections[0], bare: true, folded: false };
  }
  const sectionOf = (item: WorkItem) => where.get(item.id) ?? 'progress';
  const tabOf = (item: WorkItem) => PARTS.find((p) => p.key === sectionOf(item))!.tab;
  return { sections, rows, sectionOf, tabOf };
}

const WHO: { key: NeedsKey; label: string }[] = [
  { key: 'people', label: 'People' },
  { key: 'agents', label: 'Agents' },
];

/** Your own threads, without the runs your AI teammates hold on their own place. */
export const yoursOnly = (rows: WorkItem[], mateOf: (item: WorkItem) => string | null): WorkItem[] => rows.filter((i) => !mateOf(i));

/** A run an AI teammate stopped is an agent's, whoever asked for it; a person's task or direct message is a person's. */
export function whoIsWaiting(item: WorkItem, { me, isMate, isDirect }: { me: string | null; isMate: (i: WorkItem) => boolean; isDirect: (i: WorkItem) => boolean }): NeedsKey {
  if (isMate(item)) return 'agents';
  return (item.createdBy && item.createdBy !== me) || isDirect(item) ? 'people' : 'agents';
}

/**
 * Group by Who: Needs you split in two, people first, keeping each row's place
 * in the order it came in. One kind alone is drawn with no header.
 */
export function needsByWho(rows: WorkItem[], whoOf: (item: WorkItem) => NeedsKey, folded: ReadonlySet<string> = new Set(), alsoPeople = 0): Stack | null {
  const kind = new Map(rows.map((i) => [i.id, whoOf(i)]));
  // Mentions and news are drawn over the list, but they are from people, so they count there.
  const extra = (key: NeedsKey) => (key === 'people' ? alsoPeople : 0);
  const parts = WHO.map((w) => ({ ...w, items: rows.filter((i) => kind.get(i.id) === w.key) })).filter((p) => p.items.length + extra(p.key) > 0);
  if (parts.length < 2) return null;
  const sections: StackSection[] = parts.map((p) => ({ key: p.key, label: p.label, count: p.items.length + extra(p.key), tab: 'inbox', folded: folded.has(p.key) }));
  const shown = parts.flatMap((p) => (folded.has(p.key) ? [] : p.items));
  return { sections, rows: shown, sectionOf: (i) => kind.get(i.id) ?? 'agents', tabOf: () => 'inbox' };
}

const FOLDED_KEY = 'agentbox.yourThreads.folded';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): Store => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export type NeedsGroup = 'none' | 'who';
const GROUP_KEY = 'agentbox.needs.group';

export function readNeedsGroup(store: Store = local()): NeedsGroup {
  try { return store?.getItem(GROUP_KEY) === 'who' ? 'who' : 'none'; } catch { return 'none'; }
}

export function writeNeedsGroup(group: NeedsGroup, store: Store = local()) {
  try { store?.setItem(GROUP_KEY, group); } catch { /* kept for this window only */ }
}

export function readFolded(store: Store = local()): Set<StackKey> {
  try {
    const v = JSON.parse(store?.getItem(FOLDED_KEY) ?? '[]');
    return new Set((Array.isArray(v) ? v : []).filter((k): k is StackKey => PARTS.some((p) => p.key === k)));
  } catch { return new Set(); }
}

export function toggleFolded(key: StackKey, store: Store = local()): Set<StackKey> {
  const next = readFolded(store);
  if (next.has(key)) next.delete(key); else next.add(key);
  try { store?.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch { /* kept for this window only */ }
  return next;
}
