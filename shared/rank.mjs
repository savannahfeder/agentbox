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
 * The same score, except that A CONVERSATION WITH A PERSON RANKS WITH YOUR TOP
 * PROJECT (w-2e8aa16f0f, 2026-10-05).
 *
 * A conversation lives in its own direct project, and nobody places that in
 * the running order, so it scored zero and a High message from a teammate sat
 * under every Low task. Her call: "it should def be based on priority. The
 * issue is the project itself. For now it can just be treated as ranked with
 * your top project." So it borrows the top place, and its own level decides
 * where it sits among that project's threads. With no order there is no place
 * to borrow and it scores nothing, like everything else.
 *
 * `direct` is the set of conversation project slugs, which only the caller can
 * know (it reads them off the products). Without it this is productRankScore.
 * The fleet does not need it: a conversation is held by a person and never
 * spawns, so the supervisor's score never meets one.
 */
export function placeScore(order, slug, direct) {
  if (direct?.has(slug)) return order.length * RANK_STEP;
  return productRankScore(order, slug);
}

/**
 * The number an item carries into that score.
 *
 * A LEVEL COUNTS WHOEVER SET IT (w-5ac9c9006d, 2026-10-16). An agent's tag
 * used to count for nothing, because agents once tagged 127 of 442 rows at 7
 * or higher on an old brief rule. That made every level an agent wrote a lie
 * on screen, and her answer was to stop discarding them: "If agent-determined
 * priorities are ignored, then it seems like the whole prioritization system
 * is ignored. If an agent sets something and I'm like, 'Oh that's the wrong
 * priority,' I'll fix it. We should also always treat priorities as the
 * source of truth, regardless of where they came from." Her fix is a new
 * level, and the fold keeps hers over an agent's.
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
  const n = item.priority;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRIORITY;
}

/**
 * THE LEVEL A THREAD SHOWS IS THE LEVEL IT RUNS AT (w-5ac9c9006d, 2026-10-15).
 *
 * Every screen drew the raw stored number while the fleet ran `itemPriority`,
 * so a thread an agent filed untagged read Low and ran as Medium, and an
 * agent's own 8 read High and ran as Medium. In Progress then showed three
 * "Low" threads running while a "High" and a "Medium" waited. An agent's level
 * now counts (above); an untagged row reads Medium here as it runs.
 *
 * A CONVERSATION keeps the number it carries: its level is the message
 * sorter's (main/message-priority.mjs), written as an agent on purpose, and a
 * conversation never spawns, so there is no running order for it to disagree
 * with. `conversation` is the caller's to say, since only it knows the product.
 */
export function shownPriority(item, conversation = false) {
  if (conversation) return item?.priority ?? null;
  return itemPriority(item);
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
 * Is this row Urgent?
 *
 * Whoever set it, since 2026-10-16 (itemPriority). Everything downstream of
 * this predicate takes a running session away from something else, so an
 * agent's nine interrupts like hers; a wrong one is hers to lower.
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
 * A THREAD'S OWN PLACE, SET BY DRAGGING IT IN THE LIST (w-6e5b532a95,
 * 2026-10-07). Her words: "sometimes there are tasks that are higher priority
 * than other projects and it's hard to articulate. I'd rather be able to drag
 * things around here ... and have that priority remembered and that's how the
 * app processes it." A project's place and a thread's level could never say
 * that one Low thread matters more today than a whole project above it.
 *
 * So a dragged thread carries a PLACE: a number on the same scale as the score
 * it would otherwise have, which replaces that score outright. It is a number
 * and not a list of ids so that everything it was not dragged past keeps
 * sorting the way it always did: a new Urgent thread still lands by its level,
 * next to the placed ones rather than under all of them.
 */
export function placedScore(place, natural) {
  return Number.isFinite(place) ? place : natural;
}

/**
 * The places a drop writes. `rows` is the list as drawn, top first, each with
 * the score it sorts by (its place, or its project and level); `from` is the
 * dragged row and `to` the row it was let go in front of, or the length for
 * the end, both counted in `rows`. Null when it lands where it was.
 *
 * The dragged row goes between its new neighbours. When those two TIE (two
 * Medium threads in one project, whose order is only which changed last) no
 * number fits between them, so the tied rows above the drop are given places
 * of their own first, spread in the order they were drawn. The rows below are
 * never written.
 */
export function dropPlaces(rows, from, to) {
  if (!Array.isArray(rows) || from < 0 || from >= rows.length) return null;
  const rest = rows.filter((_, i) => i !== from);
  const at = Math.max(0, Math.min(rest.length, to > from ? to - 1 : to));
  if (at === from || !rest.length) return null;
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  const below = rest[at]?.score;
  const floor = below ?? rest[at - 1].score - 2;
  // The run of rows just above the drop that tie with the floor.
  let top = at;
  while (top > 0 && close(rest[top - 1].score, floor)) top -= 1;
  const ceiling = top > 0 ? rest[top - 1].score : floor + 2;
  const run = rest.slice(top, at);
  const step = (ceiling - floor) / (run.length + 2);
  const out = {};
  run.forEach((r, j) => { out[r.id] = floor + (run.length + 1 - j) * step; });
  out[rows[from].id] = floor + step;
  return out;
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
