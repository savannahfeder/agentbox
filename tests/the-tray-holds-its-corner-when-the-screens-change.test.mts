// 2026-10-13, from the running app: "when switching monitors the agent tray
// jumps around quite a bit. it should stay in relatively the same place on
// each screen."
//
// Its spot was remembered as a point on the whole desktop. Plug a monitor in
// and every screen's coordinates move underneath that point, so the tag landed
// wherever the arithmetic put it — often clamped against an edge of a screen
// she was not looking at. A corner and a gap mean the same thing on any
// screen, so that is what is remembered now.
import { describe, expect, it } from 'vitest';
import { EDGE_SLACK, MARGIN, cornerPlace, restingSpot, spotFor } from '../shared/corner-tag.mts';

const laptop = { x: 0, y: 0, width: 1728, height: 1080 };
// a 32" to the right of the laptop, as macOS lays them out
const big = { x: 1728, y: 0, width: 3413, height: 1920 };
const size = { width: 120, height: 31 };

const parked = (area, corner, dx = MARGIN, dy = MARGIN) => ({ ...spotFor({ corner, dx, dy }, size, area), ...size });

describe('the tag remembers a corner, not a point on the desktop', () => {
  it('reads back the corner it is parked in, with the gap it was left at', () => {
    expect(cornerPlace(parked(laptop, 'br'), laptop)).toEqual({ corner: 'br', dx: 18, dy: 18 });
    expect(cornerPlace(parked(laptop, 'tl', 40, 12), laptop)).toEqual({ corner: 'tl', dx: 40, dy: 12 });
    expect(cornerPlace(parked(laptop, 'tr', 5, 60), laptop)).toEqual({ corner: 'tr', dx: 5, dy: 60 });
    expect(cornerPlace(parked(laptop, 'bl', 0, 0), laptop)).toEqual({ corner: 'bl', dx: 0, dy: 0 });
  });

  it('lands in the same corner, the same gap in, on a screen of another size', () => {
    const place = cornerPlace(parked(laptop, 'br'), laptop);
    const onBig = spotFor(place, size, big);
    expect(big.x + big.width - (onBig.x + size.width)).toBe(18);
    expect(big.y + big.height - (onBig.y + size.height)).toBe(18);
    // and it really is on that screen, not at the old desktop point
    expect(onBig.x).toBeGreaterThanOrEqual(big.x);
    expect(onBig.x + size.width).toBeLessThanOrEqual(big.x + big.width);
  });

  it('holds every corner across the move, including the ones with an offset', () => {
    for (const corner of ['br', 'bl', 'tr', 'tl']) {
      const place = cornerPlace(parked(laptop, corner, 30, 70), laptop);
      expect(cornerPlace({ ...spotFor(place, size, big), ...size }, big)).toEqual(place);
    }
  });

  it('keeps the whole tag on a screen too small for the gap it remembers', () => {
    const tiny = { x: 0, y: 0, width: 140, height: 40 };
    const spot = spotFor({ corner: 'br', dx: 900, dy: 900 }, size, tiny);
    expect(spot.x).toBeGreaterThanOrEqual(tiny.x);
    expect(spot.y).toBeGreaterThanOrEqual(tiny.y);
    expect(spot.x + size.width).toBeLessThanOrEqual(tiny.x + tiny.width);
    expect(spot.y + size.height).toBeLessThanOrEqual(tiny.y + tiny.height);
  });

  it('says nothing when it has never been parked, so the first run still starts bottom right', () => {
    expect(spotFor(null, size, laptop)).toBe(null);
    expect(spotFor({}, size, laptop)).toBe(null);
  });
});

describe('she may park it past the edge', () => {
  // "I can't seem to put it further to the right. It snaps back into place in
  // this slot but I often want it a little bit further to the right side of
  // the screen." The resting rule used to hold the whole tag on screen, so a
  // drag to the right stopped flush against the edge and sprang back from
  // anything beyond it.
  const parkable = (a) => ({
    x: a.x - EDGE_SLACK, y: a.y - EDGE_SLACK,
    width: a.width + 2 * EDGE_SLACK, height: a.height + 2 * EDGE_SLACK,
  });

  it('lets a hard drag to the right hang it off the edge, by the slack and no more', () => {
    const spot = restingSpot({ x: 5000, y: 900 }, size, [parkable(laptop)]);
    const past = spot.x + size.width - (laptop.x + laptop.width);
    expect(past).toBe(EDGE_SLACK);
  });

  it('keeps that tuck when the screens change, instead of snapping it back', () => {
    const tucked = { ...spotFor({ corner: 'br', dx: -EDGE_SLACK, dy: MARGIN }, size, laptop), ...size };
    expect(laptop.x + laptop.width - (tucked.x + tucked.width)).toBe(-EDGE_SLACK);
    const place = cornerPlace(tucked, laptop);
    expect(place.dx).toBe(-EDGE_SLACK);
    const onBig = spotFor(place, size, big);
    expect(big.x + big.width - (onBig.x + size.width)).toBe(-EDGE_SLACK);
  });

  it('still never loses it: the slack is a tuck, not a disappearance', () => {
    const spot = spotFor({ corner: 'br', dx: -9000, dy: -9000 }, size, laptop);
    expect(laptop.x + laptop.width - (spot.x + size.width)).toBe(-EDGE_SLACK);
    expect(EDGE_SLACK).toBeLessThan(size.width / 2);
  });
});
