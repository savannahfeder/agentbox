// A thread stuck on something outside its own work joins the one row for that
// cause, or opens it (shared/causes.mts). Which open cause is the same one is
// the stuck agent's call: it is told every open cause and picks.
import { listWorkItems, createItem, updateItem } from './work.mts';
import { CAUSE_KIND, CAUSE_LABEL, openCauses, waitingOn, cameBack, leadBrief, keeperOf, type CauseRow } from '../../shared/causes.mts';

const TITLE_CHARS = 80;

export type Joined = { causeId: string; opened: boolean; choose?: undefined } | { choose: { id: string; title: string | undefined; waiting: number }[]; causeId?: undefined; opened?: undefined };

export function joinCause({ thread, cause, ask = '', causeId = null, isNew = false, now = Date.now() }: {
  thread: { id: string; product: string };
  cause?: string; ask?: string; causeId?: string | null; isNew?: boolean; now?: number;
}): Joined {
  const all = listWorkItems({ includeDone: true, now }) as unknown as (CauseRow & { priority?: number })[];
  const open = openCauses(all);
  if (causeId) {
    const found = open.find((c) => c.id === causeId);
    if (!found) throw new Error(`${causeId} is not an open cause. Open causes: ${open.map((c) => `${c.id} "${c.title}"`).join(', ') || 'none'}.`);
    return { causeId: found.id, opened: false };
  }
  const same = open.find((c) => String(c.title ?? '').trim().toLowerCase() === String(cause ?? '').trim().toLowerCase());
  if (same) return { causeId: same.id, opened: false };
  if (open.length && !isNew) {
    return { choose: open.map((c) => ({ id: c.id, title: c.title, waiting: waitingOn(c, all).length })) };
  }
  const title = String(cause ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_CHARS);
  if (!title) throw new Error('name the cause in a few plain words, the way the person would say it');
  const from = all.find((i) => i.id === thread.id);
  const row = createItem(thread.product, {
    title,
    body: leadBrief({ cause: title, ask, from: from ? `"${from.label || from.title}" (${from.id})` : thread.id, again: cameBack(title, all, now) }),
    kind: CAUSE_KIND,
    labels: ['founder', CAUSE_LABEL],
    priority: from?.priority ?? 5,
  }, { source: 'system' });
  // Two threads stuck at the same moment both find no open cause and both open
  // one (fourth Codex power test). The oldest is kept and the other closes itself.
  const first = keeperOf(title, openCauses(listWorkItems({ now }) as unknown as CauseRow[]));
  if (first && first.id !== row.id) {
    updateItem(row.id, { status: 'done' }, { source: 'system' });
    return { causeId: first.id, opened: false };
  }
  return { causeId: row.id, opened: true };
}
