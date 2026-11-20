// Each sync, the waits people set that have ended come back to Needs you
// (shared/thread-waits.mts), and so do the tasks you hold whose blocks have
// ended (shared/team-tasks.mts). The wait is cleared as it is told, so it is
// told once.
import { endedWaits } from '../../shared/thread-waits.mts';
import { endedTaskBlocks } from '../../shared/team-tasks.mts';
import type { TeamProduct } from './index.mts';
import type { TaskRow } from '../../shared/team-tasks.mts';
import type { WaitCard } from '../../shared/thread-waits.mts';

export type WaitRow = TaskRow & { id: string };

const lastWordIn = (rows: WaitRow[], person: string): { ts: number; text: string | null } => {
  let last = { ts: 0, text: null as string | null };
  for (const row of rows) {
    for (const [field, w] of Object.entries(row.wrote ?? {})) {
      const text = (row as unknown as Record<string, unknown>)[field];
      if (w?.by === person && (w.ts ?? 0) > last.ts) last = { ts: w.ts, text: typeof text === 'string' ? text : null };
    }
    for (const said of row.talk?.chat ?? []) if (said.by === person && said.ts > last.ts) last = { ts: said.ts, text: said.text ?? null };
  }
  return last;
};

export function noticeEndedWaits({ products, read, write, cards, nameOf, now, me = null }: {
  products: TeamProduct[];
  read: (product: TeamProduct) => WaitRow[];
  write: (dir: string, id: string, patch: Record<string, unknown>) => unknown;
  cards: readonly WaitCard[];
  nameOf: (id: string) => string;
  now: number;
  me?: string | null;
}): number {
  const chats = products.filter((p) => p.team?.direct);
  // `chats` holds only projects with a team record.
  const lastIn = (person: string) => chats
    .filter((p) => new Set([...(p.team!.people ?? []), ...(p.team!.sharedBy ? [p.team!.sharedBy] : [])]).has(person))
    .filter((p) => new Set([...(p.team!.people ?? []), ...(p.team!.sharedBy ? [p.team!.sharedBy] : [])]).size <= 2)
    .map((p) => lastWordIn(read(p), person))
    .reduce((a, b) => (b.ts > a.ts ? b : a), { ts: 0, text: null as string | null });
  const lastWordFrom = (person: string) => lastIn(person).ts;
  const lastWordsFrom = (person: string) => lastIn(person).text;
  let told = 0;
  const everything = me ? products.flatMap((p) => read(p)) : [];
  for (const product of products) {
    const items = read(product);
    // Only the holder's Mac clears a task's block: the clear syncs, the telling
    // does not, so a giver's copy clearing first would leave the holder untold.
    const ended = product.team?.direct
      ? (me ? endedTaskBlocks(items, { items: everything, cards, me, lastWordFrom, nameOf }) : [])
      : endedWaits(items, { items, cards, lastWordFrom, lastWordsFrom, nameOf, now });
    for (const { item, said } of ended) {
      write(product.dir, item.id, { blockedBy: [], waitEnded: { said, at: now } });
      told += 1;
    }
  }
  return told;
}
