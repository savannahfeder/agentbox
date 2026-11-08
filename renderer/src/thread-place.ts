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

const places = new Map<string, Parts & { news?: number }>();

export const placeKey = (t: { product: string; id: string }): string => `${t.product}\n${t.id}`;

/** A piece of where she is, written while she is still in the thread. */
export function keepPlace(key: string, parts: Parts): void {
  places.set(key, { ...places.get(key), ...parts });
}

/** She has left the thread; `news` is its newest answer at that moment. */
export function leavePlace(key: string, news: number, parts: Parts): void {
  places.set(key, { ...places.get(key), ...parts, news });
}

/** Where to put her back, or null to open the thread as new. */
export function placeToReturnTo(key: string, news: number): ThreadPlace | null {
  const kept = places.get(key);
  if (!kept || kept.news === undefined) return null;
  if (kept.news !== news) {
    places.delete(key);
    return null;
  }
  return kept as ThreadPlace;
}

export function forgetPlaces(): void {
  places.clear();
}
