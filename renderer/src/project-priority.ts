// The rules behind Settings > Project priority (components/ProjectPriority.tsx).
//
// The order itself and what it is worth are shared/rank.mjs, and nothing here
// re-derives them. This only answers the page's own questions: which projects
// it lists, and what the full order becomes after a drop or a nudge.
//
// THE PAGE SHOWS FEWER PROJECTS THAN THE ORDER HOLDS. Conversations between
// people and the practice project never run an agent, so ranking them is
// meaningless and listing them would be noise. Every move is therefore worked
// out against the FULL order, so those rows keep the place they already had
// rather than falling out of it.

import { moveProduct } from '../../shared/rank.mjs';

interface Rankable {
  slug: string;
  practice?: boolean;
  team?: unknown;
}

const isConversation = (p: Rankable) => (p.team as { direct?: unknown } | null | undefined)?.direct === true;

/** The projects the page lists, in the running order they arrive in. */
export function priorityList<T extends Rankable>(ranked: readonly T[]): T[] {
  return ranked.filter((p) => !p.practice && !isConversation(p));
}

/**
 * Put `slug` just before `before` (null for the end) in the full order. Null
 * when nothing would change, so the caller does not write an order it already has.
 */
export function placeBefore(full: readonly string[], slug: string, before: string | null): string[] | null {
  if (before === slug) return null;
  const rest = full.filter((s) => s !== slug);
  const at = before ? rest.indexOf(before) : rest.length;
  const next = moveProduct(rest, slug, at < 0 ? rest.length : at);
  return next.join('\n') === full.join('\n') ? null : next;
}

/**
 * One step up (-1) or down (+1) past the neighbouring row AS SHOWN. Null at
 * either end, where the button is drawn disabled anyway.
 */
export function nudge(full: readonly string[], shown: readonly string[], slug: string, step: -1 | 1): string[] | null {
  const i = shown.indexOf(slug);
  const j = i + step;
  if (i < 0 || j < 0 || j >= shown.length) return null;
  // Up lands just before the row above, down just after the row below.
  const rest = full.filter((s) => s !== slug);
  const k = rest.indexOf(shown[j]);
  if (k < 0) return null;
  return moveProduct(rest, slug, step < 0 ? k : k + 1);
}

/**
 * Where a dragged row lands in a single column: the first row whose middle is
 * below the pointer, or the end. shared/rank.mjs's `landingIndex` is for
 * wrapped chips and reads the X axis too, which in one column would make the
 * right half of a row mean "after it".
 */
export function landingRow(rects: readonly { top: number; bottom: number }[], y: number): number {
  for (let i = 0; i < rects.length; i += 1) {
    if (y < (rects[i].top + rects[i].bottom) / 2) return i;
  }
  return rects.length;
}
