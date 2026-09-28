// The founder's running order over her companies, and the one scoring rule
// derived from it.
//
// This file exists because the rule was written twice: once in the supervisor
// (which decides what to spawn) and once in the renderer (which decides what
// the inbox shows first). Two copies of "what matters most" is two answers to
// the same question, and the day they disagree is the day the top of the inbox
// stops being what the agents are actually working on. There is one copy now,
// imported by both.
//
// The model is an ORDER, not a set of buckets (founder's call, 2026-08-06).
// Buckets leave every tie inside a bucket unanswered, and "which of these two
// comes first" is the question the fleet needs settled.

// A place in the order is worth this much, so it dominates any item's own
// priority (which runs 0..9). A project one step higher in the order beats
// anything filed under a project one step lower, whatever its tag says.
export const RANK_STEP = 100;

/** Clean a proposed order: strings only, no blanks, no duplicates. */
export function normalizeOrder(slugs) {
  if (!Array.isArray(slugs)) return [];
  const seen = new Set();
  const out = [];
  for (const slug of slugs) {
    if (typeof slug !== 'string' || !slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/**
 * The score contributed by a product's place in the order. Higher is sooner.
 *
 * An UNRANKED product scores zero, which puts it below every ranked one and
 * ties it with the other unranked. That is deliberate: a product the founder
 * has never placed must not silently outrank one she has, and an empty order
 * has to behave exactly like the flat inbox that existed before ranking did.
 */
export function productRankScore(order, slug) {
  const idx = order.indexOf(slug);
  if (idx === -1) return 0;
  return (order.length - idx) * RANK_STEP;
}

/**
 * The number an item carries into that score.
 *
 * An AGENT'S tag counts for nothing. Agents used to set this themselves, on a
 * rule in the worker brief that told them 7 meant blocking; of the 442 items
 * agents filed, 127 came in at 7 or higher, which is not an order, it is
 * noise. She asked for the ordering to be the app's job, the rule is out of
 * the brief, and this is the half that also covers the items already sitting
 * in the store carrying an agent's 8.
 *
 * Everything else counts, and the test for "hers" is deliberately wide: her
 * compose box writes the number as 'system' rather than 'founder' (the split
 * in store.composeItem is words-versus-lifecycle, not authority), and a repeat
 * rule's number arrives the same way. Reading only 'founder' here would have
 * thrown away the Urgent tag on the very row she complained about
 * (tests/urgent-does-not-wait-behind-medium.test.mjs).
 *
 * Nought means untagged, not bottom. It is the seed the fold starts an item
 * at and the default her compose sends when she picks no number, and her own
 * scale starts at Low, which is 2. An untagged row therefore sits in the
 * middle with everything else and her order over the products, then age,
 * decides it.
 */
export const DEFAULT_PRIORITY = 5;

export function itemPriority(item) {
  if (!item) return DEFAULT_PRIORITY;
  if (item.wrote?.priority?.source === 'agent') return DEFAULT_PRIORITY;
  const n = item.priority;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRIORITY;
}

/**
 * The top of her own scale, and the only level that INTERRUPTS.
 *
 * The number is the renderer's (renderer/src/priority.ts: Urgent is 9), and it
 * is named here because the supervisor needs the same answer and importing a
 * .ts module into the main process is not available to it. Same reason the
 * whole file exists: the day the two copies disagree is the day Urgent stops
 * meaning urgent in one half of the app.
 */
export const URGENT_PRIORITY = 9;

/**
 * Is this HER urgent row?
 *
 * itemPriority already throws away an agent's number, so this cannot be
 * reached by a worker tagging its own proposal a nine. That matters more here
 * than anywhere else in this file: everything downstream of this predicate
 * takes a running session away from something else.
 */
export function isUrgent(item) {
  return itemPriority(item) >= URGENT_PRIORITY;
}

/**
 * Migration from the three-bucket model. Only ever runs against state written
 * before the order existed, and preserves the founder's intent: everything she
 * called high comes first, then untagged, then everything she called low.
 */
export function orderFromTiers(tiers) {
  if (!tiers || typeof tiers !== 'object') return [];
  const slugs = Object.keys(tiers);
  const rank = (s) => (tiers[s] > 0 ? 0 : tiers[s] < 0 ? 2 : 1);
  return normalizeOrder(slugs.filter((s) => tiers[s] !== 0).sort((a, b) => rank(a) - rank(b)));
}

/**
 * Where a dragged chip would land, in READING ORDER, given the chips' boxes and
 * the pointer. Returns an index to insert BEFORE; the length means "at the end".
 *
 * This is pure geometry and lives here rather than in the component because it
 * is the half of ranking that was wrong. The first version compared the pointer
 * against chip centres on the X axis alone, which is right for one row and
 * useless for four: with twenty two projects the chips WRAP, every row spans
 * the same X range, and dragging up or down moved nothing at all (founder,
 * 2026-08-06). Row first, then position within the row.
 */
export function landingIndex(rects, x, y) {
  if (!Array.isArray(rects)) return 0;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (!r) continue;
    if (y < r.top) return i;                                 // above this row entirely
    if (y <= r.bottom && x < r.left + r.width / 2) return i;  // this row, left of centre
  }
  return rects.length;
}

/**
 * Move one product to a new index, returning a fresh order. Products that were
 * never in the order join it on their first move, so dragging an unranked chip
 * is how it gets ranked at all.
 */
export function moveProduct(order, slug, toIndex) {
  const base = normalizeOrder(order).filter((s) => s !== slug);
  const at = Math.max(0, Math.min(base.length, Math.trunc(toIndex)));
  base.splice(at, 0, slug);
  return base;
}
