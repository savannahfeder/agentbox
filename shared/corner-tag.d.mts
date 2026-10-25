// Types for shared/corner-tag.mjs, the corner tag's rules, which main (Node)
// and the tag's page (Vite) share one copy of. Only what the page calls is
// declared; the window placement is main's half.

export type HideChoice = { key: '5m' | '30m' | 'today'; label: string };
export const HIDE_CHOICES: HideChoice[];

/** text is the count on the tag; label is what it says aloud ("2 waiting"). */
export function tagSays(counts: { ready?: number }): { kind: 'ready'; text: string; label: string } | null;

export type ReadyLine = { id: string; title: string; says: string; since?: number; open?: string | null };
export function cardLines<T extends ReadyLine>(ready: T[], now: number, max?: number): {
  lines: (T & { waited: string })[];
  more: number;
};

/** The four corners that resize it, and the arrow each one draws. */
export const GRIPS: readonly ['tl', 'tr', 'bl', 'br'];
export type Grip = 'tl' | 'tr' | 'bl' | 'br';

/** The nine dots, in whole pixels, for a tag this tall. */
export const LATTICE: { box: number; dot: number; gap: number };
export function latticeGrid(box: number, dpr?: number): {
  dot: number; gap: number; pitch: number; side: number; size: number;
  dots: { cx: number; cy: number }[];
};

/** How much of the tag's size the list takes; it is read, not glanced at. */
export function cardScale(scale: number): number;

type Rect = { x: number; y: number; width: number; height: number };
/** A page's measurement of itself, in screen points at the zoom it is drawn at. */
export function inPoints(
  m: { width: number; height: number; glass?: Rect; radius?: number },
  zoom?: number,
): { width: number; height: number; glass?: Rect; radius?: number };
