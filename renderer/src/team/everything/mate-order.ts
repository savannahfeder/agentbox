// Your AI teammates' faces run most recently used first. The order is settled
// once a day and kept, so a face does not jump left each time you use it.
const MATE = 'mate:';

export interface MateOrder { day: string; keys: string[] }

/** When each of your AI teammates last worked: the newest of its runs, by teammate id. */
export function lastUsedByMate<T extends { updatedAt?: number; createdAt?: number }>(items: readonly T[], mateOf: (item: T) => string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) {
    const id = mateOf(i);
    if (!id) continue;
    const at = i.updatedAt ?? i.createdAt ?? 0;
    if (at > (out.get(id) ?? -1)) out.set(id, at);
  }
  return out;
}

/**
 * Your AI teammates put in order, everyone else left where they were. On a new
 * day the order is most recently used first; within a day it is the one
 * settled that morning, with a teammate made since at the end.
 */
export function settleMateOrder<T extends { key: string }>(members: readonly T[], { lastUsed, saved, day }: {
  lastUsed: ReadonlyMap<string, number>; saved: MateOrder | null; day: string;
}): { members: T[]; saved: MateOrder } {
  const mates = members.filter((m) => m.key.startsWith(MATE));
  let order: T[];
  let kept = saved;
  // An order settled before the teammates had loaded settles nothing.
  if (saved && saved.day === day && saved.keys.length) {
    const at = new Map(saved.keys.map((k, n) => [k, n]));
    order = mates.slice().sort((a, b) => (at.get(a.key) ?? Infinity) - (at.get(b.key) ?? Infinity));
  } else {
    const used = (m: T) => lastUsed.get(m.key.slice(MATE.length)) ?? -1;
    order = mates.slice().sort((a, b) => used(b) - used(a));
    kept = { day, keys: order.map((m) => m.key) };
  }
  let n = 0;
  return { members: members.map((m) => (m.key.startsWith(MATE) ? order[n++] : m)), saved: kept! };
}

const KEY = 'agentbox.faces.mateOrder';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): Store => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function readMateOrder(store: Store = local()): MateOrder | null {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? 'null');
    return v && typeof v.day === 'string' && Array.isArray(v.keys) && v.keys.every((k: unknown) => typeof k === 'string') ? { day: v.day, keys: v.keys } : null;
  } catch { return null; }
}

export function writeMateOrder(order: MateOrder, store: Store = local()) {
  try { store?.setItem(KEY, JSON.stringify(order)); } catch { /* kept for this window only */ }
}
