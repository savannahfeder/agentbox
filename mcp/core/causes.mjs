// A thread stuck on something outside its own work joins the one row for that
// cause, or opens it (shared/causes.mjs). Which open cause is the same one is
// the stuck agent's call: it is told every open cause and picks.
import { listWorkItems, createItem } from './work.mjs';
import { CAUSE_KIND, CAUSE_LABEL, openCauses, waitingOn, cameBack, leadBrief } from '../../shared/causes.mjs';

const TITLE_CHARS = 80;

/**
 * @returns {{ causeId: string, opened: boolean } | { choose: { id: string, title: string, waiting: number }[] }}
 */
export function joinCause({ thread, cause, ask = '', causeId = null, isNew = false, now = Date.now() }) {
  const all = listWorkItems({ includeDone: true, now });
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
  return { causeId: row.id, opened: true };
}
