// PURE. Where she was in each thread, kept for as long as the window is open,
// so coming back to one puts her there: after an urgent thread took the screen,
// or any other way back.
//
// Only while the thread has no newer answer than when she left it. A new answer
// is what she came back for, so the thread opens at its end as it always did.
import type { ArtifactMode } from './artifact-layout';

export interface PlaceDoc { product: string; src: string; auto?: boolean; at?: string }

export interface ThreadPlace {
  /** The thread's newest answer (unread.ts: arrivedAt) when she left it. */
  news: number;
  /** How far she had scrolled the conversation herself; absent, she was at its end. */
  top?: number;
  /** The file open beside it; null, she had closed it. */
  doc?: PlaceDoc | null;
  mode?: ArtifactMode;
  /** Show earlier messages / Show what the agent did, opened. */
  earlier?: boolean;
  /** The middle of a long conversation, asked back. */
  whole?: boolean;
  /** The folded runs of steps she opened, by name. */
  runs?: string[];
  /** The single steps she opened, and how far. */
  lines?: [string, number][];
}

type Parts = Partial<Omit<ThreadPlace, 'news'>>;
type Kept = Parts & { news?: number };

// Kept in storage too, so a reload or a restart does not fold the thread she
// was reading. The newest threads only.
const STORED = 'zero.threadPlaces';
const MOST = 50;
interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }

let store: Store | null = (globalThis as { localStorage?: Store }).localStorage ?? null;
let places: Map<string, Kept> | null = null;

function all(): Map<string, Kept> {
  if (places) return places;
  places = new Map();
  try {
    const read = JSON.parse(store?.getItem(STORED) ?? '[]') as [string, Kept][];
    if (Array.isArray(read)) for (const [k, v] of read) if (typeof k === 'string' && v && typeof v === 'object') places.set(k, v);
  } catch { /* unreadable: start empty */ }
  return places;
}

function put(key: string, kept: Kept | null): void {
  const m = all();
  m.delete(key);
  if (kept) m.set(key, kept);
  while (m.size > MOST) m.delete(m.keys().next().value as string);
  try { store?.setItem(STORED, JSON.stringify([...m])); } catch { /* full or private: memory only */ }
}

export const placeKey = (t: { product: string; id: string }): string => `${t.product}\n${t.id}`;

/** A piece of where she is, written while she is still in the thread. */
export function keepPlace(key: string, parts: Parts): void {
  put(key, { ...all().get(key), ...parts });
}

/** She has left the thread; `news` is its newest answer at that moment. */
export function leavePlace(key: string, news: number, parts: Parts): void {
  put(key, { ...all().get(key), ...parts, news });
}

/** Where to put her back, or null to open the thread as new. */
export function placeToReturnTo(key: string, news: number): ThreadPlace | null {
  const kept = all().get(key);
  if (!kept || kept.news === undefined) return null;
  if (kept.news !== news) {
    put(key, null);
    return null;
  }
  return kept as ThreadPlace;
}

/** Drops what is in memory; `to` swaps the storage behind it (tests). */
export function forgetPlaces(to?: Store | null): void {
  if (to !== undefined) store = to;
  places = null;
}
