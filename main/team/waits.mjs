// Each sync, the waits people set that have ended come back to Needs you
// (shared/thread-waits.mjs), and so do the tasks you hold whose blocks have
// ended (shared/team-tasks.mjs). The wait is cleared as it is told, so it is
// told once.
import { endedWaits } from '../../shared/thread-waits.mjs';
import { endedTaskBlocks } from '../../shared/team-tasks.mjs';

const lastWordIn = (rows, person) => {
  let last = 0;
  for (const row of rows) {
    for (const w of Object.values(row.wrote ?? {})) if (w?.by === person && (w.ts ?? 0) > last) last = w.ts;
    for (const said of row.talk?.chat ?? []) if (said.by === person && said.ts > last) last = said.ts;
  }
  return last;
};

export function noticeEndedWaits({ products, read, write, cards, nameOf, now, me = null }) {
  const chats = products.filter((p) => p.team?.direct);
  const lastWordFrom = (person) => Math.max(0, ...chats
    .filter((p) => new Set([...(p.team.people ?? []), ...(p.team.sharedBy ? [p.team.sharedBy] : [])]).has(person))
    .filter((p) => new Set([...(p.team.people ?? []), ...(p.team.sharedBy ? [p.team.sharedBy] : [])]).size <= 2)
    .map((p) => lastWordIn(read(p), person)));
  let told = 0;
  const everything = me ? products.flatMap((p) => read(p)) : [];
  for (const product of products) {
    const items = read(product);
    // Only the holder's Mac clears a task's block: the clear syncs, the telling
    // does not, so a giver's copy clearing first would leave the holder untold.
    const ended = product.team?.direct
      ? (me ? endedTaskBlocks(items, { items: everything, cards, me, lastWordFrom, nameOf }) : [])
      : endedWaits(items, { items, cards, lastWordFrom, nameOf, now });
    for (const { item, said } of ended) {
      write(product.dir, item.id, { blockedBy: [], waitEnded: { said, at: now } });
      told += 1;
    }
  }
  return told;
}
