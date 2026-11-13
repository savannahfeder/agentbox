// PURE. A task an agent was asked for in a chat answers in that chat
// (w-dbe62a2841): while its answer waits on you, Needs you lists the chat,
// where the teammate's message and the answer are read together, and not the
// task as a thread of its own.
import { askedIn, CHAT_AGENTS } from './agent-mentions';

type Row = { id: string; product: string; labels?: readonly string[] };
type Stamped = { wrote?: Partial<Record<string, { ts?: number } | undefined>> };

/**
 * The newest answer an agent gave in this chat after its last message, for the
 * chat's row to preview in place of that message: who, its first line in plain
 * words, and when. Null when a person has written since, or nothing answered.
 */
export function agentSaidLast(
  chat: { product: string; id: string } & Stamped,
  items: ReadonlyArray<Row & Stamped & { result?: string; engine?: string }>,
): { who: string; text: string; at: number } | null {
  const lastMessage = Math.max(chat.wrote?.body?.ts ?? 0, chat.wrote?.answer?.ts ?? 0);
  let best: { who: string; text: string; at: number } | null = null;
  for (const i of items) {
    const where = askedIn(i);
    const at = i.wrote?.result?.ts ?? 0;
    if (!where || where.product !== chat.product || where.id !== chat.id || !i.result?.trim() || at <= lastMessage) continue;
    if (best && best.at >= at) continue;
    const line = i.result.split('\n').map((l) => l.replace(/^[\s#>-]+/, '').replace(/\*\*|__|`/g, '').trim()).find(Boolean) ?? '';
    best = { who: CHAT_AGENTS.find((a) => a.engine === (i.engine ?? 'claude'))?.label ?? 'Claude Code', text: line, at };
  }
  return best;
}

const keyOf = (i: { product: string; id: string }) => `${i.product}/${i.id}`;

/**
 * `hide`: the tasks taken out of Needs you, by `product/id`.
 * `lift`: the chats put in instead, each with the tasks that put it there.
 *
 * `inInbox` is the inbox's own answer for a row. `ownRow` is true for a task
 * only its own row can answer (a permission card, a run that will not start
 * again), and that one stays. So does a task whose chat this copy does not
 * have, because hiding it there would leave it nowhere.
 */
export function answersInTheirChat<T extends Row>(
  items: readonly T[],
  { inInbox, ownRow }: { inInbox: (i: T) => boolean; ownRow: (i: T) => boolean },
): { hide: Set<string>; lift: Map<string, T[]> } {
  const hide = new Set<string>();
  const lift = new Map<string, T[]>();
  const here = new Set(items.map(keyOf));
  for (const i of items) {
    const chat = askedIn(i);
    if (!chat || !here.has(keyOf(chat)) || ownRow(i) || !inInbox(i)) continue;
    hide.add(keyOf(i));
    lift.set(keyOf(chat), [...(lift.get(keyOf(chat)) ?? []), i]);
  }
  return { hide, lift };
}
