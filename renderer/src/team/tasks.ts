// The Tasks page: every task on the team, one row each, with who has it, who
// gave it, when it is due and what blocks it. Tasks only, never agent threads.
import { isTaskRow, taskGiver } from '../../../shared/team-rules.mjs';
import { blockedWords, deadlineOf, dueSaid, taskBlocks } from '../../../shared/team-tasks.mjs';
import { waitParts } from '../../../shared/thread-waits.mjs';
import { shownTitle } from '../../../shared/thread-title.mjs';
import { taskWords } from './company';
import { rangeOf } from './today';
import { handedFromLabel } from '../threads/composer-rules';
import { teammateIdOf } from '../../../shared/teammates.mjs';
import type { Product, ThreadCard, WorkItem } from '../types';

/** The agent thread handed this task, newest and open first: who it is, and the thread to open. */
export function agentOnTask(items: readonly WorkItem[], task: Pick<WorkItem, 'product' | 'id'>, mates: readonly { id: string; name: string }[] = []): { name: string; item: WorkItem } | null {
  const label = handedFromLabel(task.product, task.id);
  const item = items.filter((i) => i.labels?.includes(label))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  if (!item) return null;
  const mate = mates.find((t) => t.id === teammateIdOf(item));
  return { name: mate?.name ?? 'an agent', item };
}

export interface TaskBlock {
  /** "Jordan", "you", "Dev’s “Restyle”". */
  on: string;
  /** The task or thread it waits on, when this Mac can open it. */
  opens?: { item?: WorkItem; card?: ThreadCard };
}

export interface TaskRow {
  key: string;
  title: string;
  holder: string | null;
  giver: string | null;
  due: { word: string; late: boolean; at: number } | null;
  block: TaskBlock | null;
  /** The other person wrote on it since you last did. */
  unread: boolean;
  done: boolean;
  at: number;
  item?: WorkItem;
  card?: ThreadCard;
  /** The agent this Mac handed it to. */
  agent?: { name: string; item: WorkItem } | null;
}

export interface TaskGroups { late: TaskRow[]; blocked: TaskRow[]; open: TaskRow[]; done: TaskRow[] }

const dueOf = (d: { at: number; clock: boolean } | null, now: number) => {
  const w = dueSaid(d, now, { ahead: true });
  return w && d ? { ...w, at: d.at } : null;
};

export function teamTasks({ items, products, cards, me, now, nameOf, mates = [] }: {
  items: readonly WorkItem[]; products: readonly Product[]; cards: readonly ThreadCard[];
  me: string | null; now: number;
  mates?: readonly { id: string; name: string }[];
  /** A teammate's first name. */
  nameOf: (id: string) => string;
}): TaskGroups {
  const direct = new Map(products.filter((p) => p.team?.direct).map((p) => [p.slug, p]));
  const weekFrom = rangeOf('week', now).from;
  const lookup = { items: items as WorkItem[], cards: cards as ThreadCard[], me, nameOf };

  const opensFor = (id: string): TaskBlock['opens'] => {
    const w = waitParts(id);
    if (w.kind !== 'card') return undefined;
    const item = items.find((i) => i.id === w.thread && !i.agent);
    if (item) return { item };
    const card = cards.find((c) => c.personId === w.person && c.threadId === w.thread);
    return card ? { card } : undefined;
  };
  const blockOf = (row: { id: string; labels: string[]; status: string; blockedBy: string[] }): TaskBlock | null => {
    const said = blockedWords(row, lookup);
    if (!said) return null;
    const opens = opensFor(taskBlocks(row)[0]);
    return { on: said.on, ...(opens ? { opens } : {}) };
  };

  const rows: TaskRow[] = [];
  const here = new Set<string>();
  for (const item of items) {
    const product = direct.get(item.product);
    if (item.agent || !product || !isTaskRow(item)) continue;
    here.add(item.id);
    const done = item.status === 'done';
    const at = done ? item.wrote?.status?.ts ?? item.updatedAt : item.updatedAt;
    if (done && at < weekFrom) continue;
    const words = taskWords(item, product, me, nameOf, false, lookup);
    rows.push({
      key: `${item.product}/${item.id}`, title: shownTitle(item), holder: item.assignee ?? null, giver: taskGiver(item),
      due: done ? null : dueOf(deadlineOf(item, me), now), block: done ? null : blockOf(item as never),
      unread: !!words?.unread, done, at, item, agent: agentOnTask(items, item, mates),
    });
  }
  for (const c of cards) {
    // A task its giver kept between the two of them has no title on its card.
    if (!c.task || c.title == null || c.personId === me || here.has(c.threadId)) continue;
    const done = c.state === 'done';
    if (done && c.updatedAt < weekFrom) continue;
    const pseudo = { id: c.threadId, labels: ['given-task'], status: 'open', blockedBy: c.blockedBy.map((b) => b.id) };
    rows.push({
      key: `card/${c.personId}/${c.threadId}`, title: c.title, holder: c.personId, giver: c.task.from ?? null,
      due: done || !Number.isFinite(c.task.dueAt) ? null : dueOf({ at: c.task.dueAt!, clock: !!c.task.clock }, now),
      block: done ? null : blockOf(pseudo), unread: false, done, at: c.updatedAt, card: c,
    });
  }

  const soonest = (a: TaskRow, b: TaskRow) => ((a.due?.at ?? Infinity) - (b.due?.at ?? Infinity)) || (b.at - a.at);
  const out: TaskGroups = { late: [], blocked: [], open: [], done: [] };
  for (const r of rows) {
    if (r.done) out.done.push(r);
    else if (r.due?.late) out.late.push(r);
    else if (r.block) out.blocked.push(r);
    else out.open.push(r);
  }
  out.late.sort(soonest);
  out.blocked.sort(soonest);
  out.open.sort(soonest);
  out.done.sort((a, b) => b.at - a.at);
  return out;
}

/** The one line over the page. */
export function tasksLine(g: TaskGroups): string {
  const open = g.late.length + g.blocked.length + g.open.length;
  if (!open) return 'No open tasks on the team';
  const parts = [`${open} open ${open === 1 ? 'task' : 'tasks'}`];
  if (g.late.length) parts.push(`${g.late.length} late`);
  if (g.blocked.length) parts.push(`${g.blocked.length} blocked`);
  return parts.join(', ');
}

/** The rows J and K stop on, in the order they are drawn; done ones only when shown. */
export const tasksInOrder = (g: TaskGroups, doneShown: boolean): TaskRow[] => [...g.late, ...g.blocked, ...g.open, ...(doneShown ? g.done : [])];

/**
 * What a teammate's task card says on the Team view, in the Tasks tab's words:
 * the task as this Mac holds it, or the card's own block. Null when it is not a
 * task, or says nothing past its state.
 */
export function cardTaskWord(card: ThreadCard, { items, products, cards, me, nameOf }: {
  items: readonly WorkItem[]; products: readonly Product[]; cards: readonly ThreadCard[]; me: string | null; nameOf: (id: string) => string;
}): string | null {
  if (!card.task) return null;
  const lookup = { items: items as WorkItem[], cards: cards as ThreadCard[], me, nameOf };
  const row = items.find((i) => i.id === card.threadId && !i.agent && isTaskRow(i));
  const product = row && products.find((p) => p.slug === row.product);
  if (row && product) return taskWords(row, product, me, nameOf, false, lookup)?.word ?? null;
  const pseudo = { id: card.threadId, labels: ['given-task'], status: 'open', blockedBy: card.blockedBy.map((b) => b.id) };
  return blockedWords(pseudo, lookup)?.word ?? null;
}
