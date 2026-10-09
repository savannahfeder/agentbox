// THE CORNER TAG (w-dafae58a23): the rules, and nothing that touches a window.
//
// You lose track of agents once you are in another app, and the ones waiting on
// you sit idle. The answer that survived eight rounds of drawings is a small tag
// in a corner of the screen that says "2 ready for you" when an agent has
// something for you and "20 working" when none does. Twenty agents running is
// ordinary, so working agents are a count and never a list: only what is ready
// for you is worth a line.
//
// It must never become a nag. So it hides for a while and comes back on its
// own, there is no one-click way to make it gone for good (that becomes a thing
// you closed once and forgot existed), it is turned off only in Settings, and
// it steps aside while you are in the app itself.
//
// main/corner-tag.mjs owns the window and renderer/src/corner-tag owns the
// page; both decide through this file so the tests pin behaviour, not wiring.

/** Space between the tag and the edge of the screen when it rests in a corner. */
export const MARGIN = 18;

/** The ways to hide it. All of them come back; none of them is permanent. */
export const HIDE_CHOICES = [
  { key: '5m', label: '5 min' },
  { key: '30m', label: '30 min' },
  { key: 'today', label: 'Today' },
];

/** When a hide chosen at `now` runs out. 0 means "not hidden". */
export function hiddenUntil(choice, now) {
  if (choice === '5m') return now + 5 * 60_000;
  if (choice === '30m') return now + 30 * 60_000;
  if (choice === 'today') {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
  return 0;
}

/** The words on the tag, or null when there is nothing to say. */
export function tagSays({ ready = 0, working = 0 } = {}) {
  if (ready > 0) return { kind: 'ready', text: `${ready} ready for you` };
  if (working > 0) return { kind: 'working', text: `${working} working` };
  return null;
}

/** Whether the tag is on screen right now. */
export function tagShows({ on, hiddenUntil: until = 0, now, inApp, ready = 0, working = 0 }) {
  if (on === false) return false;
  if (until > now) return false;
  // In the app itself the inbox already says all of this, bigger.
  if (inApp) return false;
  return !!tagSays({ ready, working });
}

/** How long something has waited, in units. */
export function waitedFor(since, now) {
  if (!Number.isFinite(since)) return '';
  const min = Math.floor((now - since) / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
}

/** The lines under the tag: the longest wait first, five at most. */
export function cardLines(ready, now, max = 5) {
  const sorted = [...(ready ?? [])].sort((a, b) => (a.since ?? now) - (b.since ?? now));
  const lines = sorted.slice(0, max).map((r) => ({ ...r, waited: waitedFor(r.since, now) }));
  return { lines, more: Math.max(0, sorted.length - lines.length) };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function areaFor(point, areas) {
  return areas.find((a) => point.x >= a.x && point.x < a.x + a.width && point.y >= a.y && point.y < a.y + a.height) ?? areas[0];
}

/**
 * Where the tag goes when it appears: back where you last dragged it, pulled
 * onto a screen if that screen is gone, or the bottom-right corner the first
 * time. `spot` is the tag's top-left, `areas` are the screens' work areas.
 */
export function restingSpot(spot, size, areas) {
  if (!spot) {
    const a = areas[0];
    return { x: a.x + a.width - MARGIN - size.width, y: a.y + a.height - MARGIN - size.height };
  }
  const a = areaFor({ x: spot.x + size.width / 2, y: spot.y + size.height / 2 }, areas) ?? areas[0];
  return {
    x: clamp(spot.x, a.x, a.x + a.width - size.width),
    y: clamp(spot.y, a.y, a.y + a.height - size.height),
  };
}

function inRightHalf(r, a) { return r.x + r.width / 2 > a.x + a.width / 2; }
function inLowerHalf(r, a) { return r.y + r.height / 2 > a.y + a.height / 2; }

/**
 * The tag's new bounds when its words change length. The edge nearest its
 * corner stays put, so "2 ready for you" turning into "20 working" does not
 * walk the tag away from the edge you parked it against.
 */
export function keepCorner(bounds, size, area) {
  const x = inRightHalf(bounds, area) ? bounds.x + bounds.width - size.width : bounds.x;
  const y = inLowerHalf(bounds, area) ? bounds.y + bounds.height - size.height : bounds.y;
  return { x, y, width: size.width, height: size.height };
}

/**
 * Where the list opens when you point at the tag: toward the middle of the
 * screen, so it never runs off an edge, lined up with the tag's outer edge.
 */
export function cardPlacement(tag, card, area, gap = 8) {
  let above = inLowerHalf(tag, area);
  const alignRight = inRightHalf(tag, area);
  const x = clamp(alignRight ? tag.x + tag.width - card.width : tag.x, area.x, area.x + area.width - card.width);
  const up = tag.y - gap - card.height;
  const down = tag.y + tag.height + gap;
  // A tall list near a short screen's middle may not fit the side it prefers.
  if (above && up < area.y) above = false;
  else if (!above && down + card.height > area.y + area.height) above = true;
  const y = clamp(above ? up : down, area.y, area.y + area.height - card.height);
  return { above, alignRight, card: { x, y, width: card.width, height: card.height } };
}
