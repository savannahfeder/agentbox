// THE CORNER TAG (w-dafae58a23): the rules, and nothing that touches a window.
//
// You lose track of agents once you are in another app, and the ones waiting on
// you sit idle. The answer is a small tag in a corner of the screen: the
// nine-dot mark and how many started waiting since you last had the app in
// front. When nothing is new it is gone (w-93b3a1a796), because a tag that is
// always there is a tag nobody reads.
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

/**
 * HOW FAR PAST THE EDGE SHE MAY PARK IT (2026-10-13). The resting rule used to
 * hold the whole tag inside the screen, so a drag to the right stopped with
 * the tag flush against the edge and sprang back from anything further: "I
 * can't seem to put it further to the right. It snaps back into place in this
 * slot but I often want it a little bit further to the right side of the
 * screen." It may now hang this far off any edge — enough to tuck it away,
 * never enough to lose it.
 */
export const EDGE_SLACK = 24;

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

/**
 * What the tag says: the mark and how many are new, or null, in which case it
 * is gone. A working count kept it on screen all day and made it wallpaper
 * (w-93b3a1a796), so working agents only appear in its list. "Waiting" won
 * over "ready" and "need you", and is what the tag says aloud.
 */
export function tagSays({ ready = 0 } = {}) {
  if (ready > 0) return { kind: 'ready', text: String(ready), label: `${ready} waiting` };
  return null;
}

/**
 * A page's measurement of itself, in screen points. A page drawn at a zoom
 * other than 100% measures in its own units, and the window and the Mac's
 * glass are placed in points: at 87% the glass stood out past the tag
 * (w-93b3a1a796). A zoom it cannot read counts as 100%.
 */
export function inPoints({ width, height, glass, radius }, zoom) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    width: width * z,
    height: height * z,
    glass: glass && { x: glass.x * z, y: glass.y * z, width: glass.width * z, height: glass.height * z },
    radius: Number.isFinite(radius) ? radius * z : radius,
  };
}

/**
 * What started waiting after you last looked, which is the last time the
 * app's window was in front, and whatever a notification told you about since
 * you were last at the app (`told`, { id, at }), dated from when it told you.
 * Before you have ever looked, everything counts.
 */
export function newSince(ready, lookedAt, told = []) {
  const toldAt = new Map();
  for (const t of told ?? []) if (t?.id != null) toldAt.set(t.id, Number.isFinite(t.at) ? t.at : 0);
  const out = [];
  for (const r of ready ?? []) {
    const own = Number.isFinite(r.since) ? r.since : null;
    if (toldAt.has(r.id)) out.push(own != null && own >= toldAt.get(r.id) ? r : { ...r, since: toldAt.get(r.id) });
    else if (!(lookedAt > 0) || (own != null && own > lookedAt)) out.push(r);
  }
  return out;
}

/**
 * What is left once you have crossed some off the tray (`dismissed`, id to
 * when). A thread stays off until it has something newer than that.
 */
export function notDismissed(list, dismissed = {}) {
  return (list ?? []).filter((r) => {
    const at = dismissed?.[r.id];
    return !(Number.isFinite(at) && !(r.since > at));
  });
}

/**
 * HOW BIG THE TAG DRAWS, from the width of the screen it rests on (2026-10-13).
 * One number: the page multiplies everything in the tag and its list by it, so
 * the words, the chevron, the nine-dot mark and the padding grow together.
 *
 * She reads the tray on a 32" screen and on a laptop, and 28px was too small on
 * both, worst on the big one: "a little bigger... esp on my 32 inch screen but
 * also maybe on smaller screens too". So it is a ladder off the screen's own
 * width in points, not one size for everything and not a setting to find.
 *
 * The first ladder climbed too gently — "34 px on a 32-inch screen is still far
 * too small so you need to scale it more with screen size" — so the steps are
 * now 31px on a laptop, 36px, 42px, and 48px on a screen as wide as hers
 * (3413 points). 1 would be the old 28px tag, which nothing asks for any more.
 *
 * THE STEPS ARE WHOLE PIXELS, and the scale is worked back from them. A tag
 * 30.8px tall puts its bottom border on half a device pixel, where it goes
 * soft and its bottom corners break up; she saw exactly that and called it
 * messed up (2026-10-13). Whole heights keep every edge on a real pixel.
 */
export const TAG_BASE = 28;
export const TAG_HEIGHTS = [
  { from: 0, px: 31 },
  { from: 1900, px: 36 },
  { from: 2400, px: 42 },
  { from: 3000, px: 48 },
];

/** How tall the tag draws on a screen this many points wide, in whole pixels. */
export function tagHeight(width) {
  const w = Number.isFinite(width) ? width : 0;
  let px = TAG_HEIGHTS[0].px;
  for (const step of TAG_HEIGHTS) if (w >= step.from) px = step.px;
  return px;
}

/** The one number the page multiplies everything by. */
export function tagScale(width) {
  return tagHeight(width) / TAG_BASE;
}

/**
 * HER OWN SIZE, KEPT AS A MULTIPLE OF THE AUTOMATIC ONE (2026-10-13), set a
 * notch at a time from the list's Size steps or the tag's menu.
 *
 * What she sets is not a height in pixels but how much bigger or smaller than
 * the automatic size she wants it, because the automatic size is the thing
 * that knows about screens: a tag she grows by a fifth on her laptop is a
 * fifth bigger on the 32" too, rather than shrinking back to a laptop's
 * number the moment she plugs the big screen in.
 */
export const TAG_ZOOM = { min: 0.75, max: 2, step: 0.1 };
/** However many notches she takes, the tag stays a tag. */
export const TAG_LIMITS = { min: 24, max: 80 };

/** Her multiple, kept sane; nothing stored means the automatic size. */
export function tagZoom(zoom) {
  const z = Number.isFinite(zoom) ? zoom : 1;
  return clamp(Math.round(z * 100) / 100, TAG_ZOOM.min, TAG_ZOOM.max);
}

/** How tall the tag draws on this screen, with her multiple applied. */
export function tagHeightOn(width, zoom) {
  return clamp(Math.round(tagHeight(width) * tagZoom(zoom)), TAG_LIMITS.min, TAG_LIMITS.max);
}

/** The scale the page is handed: the automatic size times her multiple. */
export function tagScaleOn(width, zoom) {
  return tagHeightOn(width, zoom) / TAG_BASE;
}

/** One notch bigger or smaller, for the tag's own menu. */
export function zoomStep(zoom, by) {
  return tagZoom(tagZoom(zoom) + by * TAG_ZOOM.step);
}

/** The four corners of a screen the tag can be placed in. */
export const GRIPS = ['tl', 'tr', 'bl', 'br'];

/**
 * HOW MUCH OF THE TAG'S SIZE THE LIST TAKES (2026-10-13). The tag is a glance
 * from across a desk and wants to be big on a big screen; the list is read a
 * line at a time and does not. At the tag's full scale on her 32" the rows came
 * out "really, really big... way bigger than anything else I'm used to seeing
 * on the screen", so the list follows the tag less than a third of the way and
 * stops at a quarter bigger than the app's own text.
 */
export function cardScale(scale) {
  const s = Number.isFinite(scale) ? scale : 1;
  return clamp(Math.round((1 + (s - 1) * 0.3) * 1000) / 1000, 1, 1.25);
}

/**
 * THE NINE DOTS ARE ONE DRAWING, not nine boxes (2026-10-13).
 *
 * They were boxes in a grid, and twice the fix was to give the dot and the gap
 * whole pixels. That only holds on a screen whose point is a whole device
 * pixel. Hers is not: a Mac in a scaled mode draws 1.5 device pixels to the
 * point, so a 3pt dot is 4.5 and a 1pt gap is 1.5, and the browser snaps every
 * box on its own — 5,5,5 across with gaps of 2 and 1. Rasterised through the
 * real page, 16 of 28 sizes came out uneven at that scale and none at 1x or
 * 2x. "It's the same issue we've had six times before."
 *
 * An svg of nine circles on one pitch is rasterised in one go, so the spacing
 * cannot round apart whatever the screen does, and the geometry can go back to
 * the launch film's own: dots of 2.7 and gaps of 0.95 in a box of 10.
 */
export const LATTICE = { box: 10, dot: 2.7, gap: 0.95 };

/**
 * The mark for a box this many points across, on a screen drawing this many
 * device pixels to the point.
 *
 * THE PITCH IS A WHOLE NUMBER OF DEVICE PIXELS. That is the whole trick. Every
 * dot then sits at the same distance from a device-pixel boundary as every
 * other, so all nine are rasterised identically and the spacing cannot round
 * apart — however the mark's own corner happens to land. Whole POINTS were the
 * old rule, and a point on her screen is 1.5 device pixels, which is why it
 * kept coming back.
 */
export function latticeGrid(box, dpr = 1) {
  const px = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const want = (Number.isFinite(box) && box > 0 ? box : LATTICE.box) * px;
  // Both whole numbers either side of the film's dot and gap, and the pair
  // whose mark comes closest to the size asked for — a dot and a gap rounded
  // on their own can leave the mark a fifth too big, which shows.
  const ideal = { dot: (want * LATTICE.dot) / LATTICE.box, gap: (want * LATTICE.gap) / LATTICE.box };
  const ways = [];
  for (const dot of [Math.floor(ideal.dot), Math.ceil(ideal.dot)]) {
    for (const gap of [Math.floor(ideal.gap), Math.ceil(ideal.gap)]) {
      const d = Math.max(2, dot);
      const g = Math.max(1, Math.min(gap, d - 1));
      ways.push({ dot: d, gap: g, side: 3 * d + 2 * g });
    }
  }
  // A dot five times its gap is a mark whose dots all but touch, and one twice
  // its gap is a loose one; the film's is 2.84. Keep inside that band if any
  // pair can, and among those take the closest size.
  const inBand = ways.filter((w) => w.dot / w.gap >= 2 && w.dot / w.gap <= 4);
  const pick = (inBand.length ? inBand : ways)
    .sort((a, b) => Math.abs(a.side - want) - Math.abs(b.side - want)
      || Math.abs(a.dot / a.gap - LATTICE.dot / LATTICE.gap) - Math.abs(b.dot / b.gap - LATTICE.dot / LATTICE.gap));
  const { dot, gap, side } = pick[0];
  const pitch = dot + gap;
  const at = [0, 1, 2].map((i) => dot / 2 + i * pitch);
  return { dot, gap, pitch, side, size: side / px, dots: at.flatMap((cy) => at.map((cx) => ({ cx, cy }))) };
}

/**
 * Newest first. Something with no moment it became ready (an agent stopped on
 * a yes, right now) sorts as now.
 */
export function readyNow(ready, now) {
  return [...(ready ?? [])]
    .sort((a, b) => (Number.isFinite(b.since) ? b.since : now) - (Number.isFinite(a.since) ? a.since : now));
}

/**
 * 'light' or 'dark' from how bright the screen behind the tray is, 0 to 1, or
 * null without a reading. Near the middle it keeps the tone it had, so a
 * mid-grey page does not flip the ink every time the reading drifts.
 */
export function toneFromLuma(luma, was = null) {
  if (typeof luma !== 'number' || !(luma >= 0 && luma <= 1)) return null;
  if (was === 'light' && luma >= 0.4) return 'light';
  if (was === 'dark' && luma <= 0.6) return 'dark';
  return luma >= 0.5 ? 'light' : 'dark';
}

/** Whether the tag is on screen right now; `ready` is how many are new. */
export function tagShows({ on, hiddenUntil: until = 0, now, inApp, ready = 0 }) {
  if (on === false) return false;
  if (until > now) return false;
  // In the app itself the inbox already says all of this, bigger.
  if (inApp) return false;
  return !!tagSays({ ready });
}

/** How long something has waited, in units. */
export function waitedFor(since, now) {
  if (!Number.isFinite(since)) return '';
  const min = Math.floor((now - since) / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
}

/** The lines under the tag: the newest first, three at most. */
export function cardLines(ready, now, max = 3) {
  const sorted = readyNow(ready, now, Infinity);
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
/**
 * WHERE THE TAG IS PARKED, SAID IN A WAY THAT SURVIVES A CHANGE OF SCREEN
 * (2026-10-13). Its spot used to be remembered as a point on the whole desktop,
 * so plugging in a monitor, or unplugging one, moved every screen's
 * coordinates underneath it and the tag "jumps around quite a bit". A corner
 * and a gap mean the same thing on any screen: bottom right, 18 points in.
 */
export function cornerPlace(bounds, area) {
  const right = inRightHalf(bounds, area);
  const lower = inLowerHalf(bounds, area);
  return {
    corner: `${lower ? 'b' : 't'}${right ? 'r' : 'l'}`,
    dx: Math.round(right ? area.x + area.width - (bounds.x + bounds.width) : bounds.x - area.x),
    dy: Math.round(lower ? area.y + area.height - (bounds.y + bounds.height) : bounds.y - area.y),
  };
}

/** That same place on this screen, wholly on it however small it is. */
export function spotFor(place, size, area) {
  if (!place?.corner) return null;
  const right = place.corner.endsWith('r');
  const lower = place.corner.startsWith('b');
  // A gap may be negative: that is the tag tucked past the edge, which she
  // asked for and which the resting rule now allows.
  const dx = clamp(Number.isFinite(place.dx) ? place.dx : MARGIN, -EDGE_SLACK, Math.max(0, area.width - size.width));
  const dy = clamp(Number.isFinite(place.dy) ? place.dy : MARGIN, -EDGE_SLACK, Math.max(0, area.height - size.height));
  return {
    x: right ? area.x + area.width - size.width - dx : area.x + dx,
    y: lower ? area.y + area.height - size.height - dy : area.y + dy,
  };
}

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
  const alignRight = inRightHalf(tag, area);
  const x = clamp(alignRight ? tag.x + tag.width - card.width : tag.x, area.x, area.x + area.width - card.width);
  // Which side has the room. The list may never cover the tag: she adjusts the
  // tray's size from this list ("you still need to see the component to be able
  // to make those decisions"), and a list over the thing it is sizing is no
  // use. So the side is picked by which has more room, the list is kept on
  // that side of the tag, and only then is it brought onto the screen — a list
  // taller than its side runs off the screen's edge rather than over the tag.
  const room = { above: tag.y - area.y, below: area.y + area.height - (tag.y + tag.height) };
  let above = inLowerHalf(tag, area);
  if (above && room.above < card.height + gap && room.below > room.above) above = false;
  else if (!above && room.below < card.height + gap && room.above > room.below) above = true;
  const y = above
    ? Math.min(tag.y - gap - card.height, Math.max(area.y, tag.y - gap - card.height))
    : Math.max(tag.y + tag.height + gap, Math.min(area.y + area.height - card.height, tag.y + tag.height + gap));
  return { above, alignRight, card: { x, y, width: card.width, height: card.height } };
}
