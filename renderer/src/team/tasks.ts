// What a task says about the agent it was handed to, and a teammate's task card's word on the Team view.
import { isTaskRow } from '../../../shared/team-rules.mts';
import { blockedWords } from '../../../shared/team-tasks.mts';
import { taskWords } from './company';
import { handedFromLabel } from '../threads/composer-rules';
import { teammateIdOf } from '../../../shared/teammates.mts';
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

/** Where that agent thread stands, in the strip over the task: working on it, answered and waiting, or finished. */
export function agentOnTaskWord(on: { name: string; item: Pick<WorkItem, 'status' | 'result'> }): string {
  const who = on.name === 'an agent' ? 'The agent' : on.name;
  if (on.item.status === 'done') return `${who} finished`;
  if (on.item.status !== 'claimed' && on.item.result) return `${who} answered`;
  return `With ${on.name}`;
}

/**
 * What a teammate's task card says on the Team view, in the task row's own
 * words: the task as this Mac holds it, or the card's own block. Null when it
 * is not a task, or says nothing past its state.
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
