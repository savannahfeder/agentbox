import { needId, needsLeft } from '../../../shared/cloud-needs.mts';
import { keyWords } from '../../../shared/cloud-keys.mts';
import { HELD } from '../components/NeedCard';
import type { WorkItem } from '../types';

export type InboxAsk = { key: string; need: string; title: string; act: string; items: WorkItem[] };

// One ask per thing, not per thread: a key two threads wait on is one card, and saving it frees both
// (main/ipc.mts zero:cloud-key).
export function inboxAsks(items: WorkItem[], saved: readonly string[] = [], putOff: ReadonlySet<string> = new Set()): InboxAsk[] {
  const asks = new Map<string, InboxAsk>();
  // Oldest first: it has waited longest.
  const byAsk = [...items].sort((a, b) => (a.wrote?.result?.ts ?? 0) - (b.wrote?.result?.ts ?? 0));
  for (const item of byAsk) {
    for (const n of needsLeft(item, saved)) {
      const need = needId(n);
      if (HELD.get(item.id)?.some((h) => h.need === need)) continue;
      if (putOff.has(putOffKey(item, need))) continue;
      const ask: Omit<InboxAsk, 'items'> = n.kind === 'sign-in' ? { key: `s:${n.service.id}`, need, title: `Connect ${n.service.name}`, act: 'Connect' }
        : n.kind === 'key' ? { key: `k:${n.name}`, need, title: `Add the ${keyWords(n.what) ?? n.name}`, act: 'Add' }
        : n.kind === 'file' ? { key: `f:${item.id}:${n.path}`, need, title: `Send ${n.path.split('/').pop()}`, act: 'Send' }
        : { key: `c:${item.id}:${n.about}`, need, title: `Enter the ${n.about} code`, act: 'Enter code' };
      const had = asks.get(ask.key);
      if (had) { if (!had.items.includes(item)) had.items.push(item); } else asks.set(ask.key, { ...ask, items: [item] });
    }
  }
  return [...asks.values()];
}

// Keyed on the answer that asked, so the same thread asking again later gets its card back.
export const putOffKey = (item: WorkItem, need: string) => `${item.id}@${item.wrote?.result?.ts ?? 0}:${need}`;

/** Later on a card: every thread on it stops showing it until it asks again. */
export const putOffKeys = (ask: InboxAsk) => ask.items.map((i) => putOffKey(i, ask.need));

const PUT_OFF = 'agentbox.asksPutOff';
export function readPutOff(): Set<string> {
  try { return new Set(JSON.parse(globalThis.localStorage?.getItem(PUT_OFF) ?? '[]')); } catch { return new Set(); }
}
export function writePutOff(keys: ReadonlySet<string>) {
  // The newest few hundred are plenty; an old ask's thread has long since moved on.
  try { globalThis.localStorage?.setItem(PUT_OFF, JSON.stringify([...keys].slice(-300))); } catch { /* no storage */ }
}
