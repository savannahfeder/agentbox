// PURE. THE LOGO, RUNNING ROUND ITS RING, WHILE SOMETHING LOADS.
//
// The logo is the thinking mark standing still: nine dots, one of them orange.
// This puts it back in motion. The orange dot leaves its corner and runs the
// ring of eight clockwise at the thinking mark's own step (LiveMark.tsx), with
// a short fading tail, and the centre stays grey. Picked from five drawn
// ideas on w-eb1e55360c.
//
// The website (components/LogoOrbit.tsx) and the phone app
// (mobile/src/ui/LogoOrbit.tsx) both read it from here, so the two cannot
// drift apart. The CSS keyframes copy ORBIT_KEYS, and a test holds them to it.
// Why: tests/the-phone-waits-on-the-logo-running-round-its-ring.

/** Cells in reading order, 0 1 2 / 3 4 5 / 6 7 8. The logo's orange dot is the top right. */
export const ORBIT_CORNER = 2;
export const ORBIT_CENTRE = 4;

/** Clockwise from the orange corner: down the right, along the bottom, up the left, along the top. */
export const ORBIT_CELLS = [2, 5, 8, 7, 6, 3, 0, 1] as const;

/** The thinking mark's step, 155ms scaled by 1.2, and the eight of them a lap. */
export const ORBIT_STEP_MS = 186;
export const ORBIT_CYCLE_MS = ORBIT_STEP_MS * 8;

/** The logo's own two colours, the same in every theme. */
export const ORBIT_GREY = '#5f5e5c';
export const ORBIT_ORANGE = '#ee6018';

/**
 * How orange one dot is across its own lap, as [fraction of the lap, opacity
 * of the orange over the grey]. It holds for under one step, so only one dot
 * is ever fully orange, then fades out over the next two.
 */
export const ORBIT_KEYS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.06, 1],
  [0.14, 0.45],
  [0.26, 0],
  [1, 0],
];

/** Where a dot starts its lap. Negative, so the ring is already moving on the first frame. */
export function orbitDelay(cell: number): number | null {
  const at = (ORBIT_CELLS as readonly number[]).indexOf(cell);
  return at < 0 ? null : at * ORBIT_STEP_MS - ORBIT_CYCLE_MS;
}

/**
 * One dot's lap for a clock running 0 to 1, as the points the phone app
 * interpolates straight lines between. Every key shifted by the dot's place in
 * the ring, the two ends of the clock, and the instant the dot snaps on, which
 * needs a point on each side of it or the line fades the dot back up across
 * the whole of its lap instead.
 */
export function orbitLap(cell: number): { inputRange: number[]; outputRange: number[] } | null {
  const delay = orbitDelay(cell);
  if (delay === null) return null;
  const snap = (delay + ORBIT_CYCLE_MS) / ORBIT_CYCLE_MS;
  const points = [0, 1, ...ORBIT_KEYS.slice(0, -1).map(([u]) => (u + snap) % 1)];
  if (snap > 0) points.push(snap - 1e-4);
  const inputRange = [...new Set(points.map((u) => Math.round(u * 1e6) / 1e6))].sort((a, b) => a - b);
  // At the very end of the clock it is the moment before the lap starts over.
  const outputRange = inputRange.map((u) => orangeAt(cell, u * ORBIT_CYCLE_MS - (u === 1 ? 1e-6 : 0)));
  return { inputRange, outputRange };
}

/** How orange a dot is at a moment, for the phone app's interpolation and for the tests. */
export function orangeAt(cell: number, ms: number): number {
  const delay = orbitDelay(cell);
  if (delay === null) return 0;
  const u = ((((ms - delay) % ORBIT_CYCLE_MS) + ORBIT_CYCLE_MS) % ORBIT_CYCLE_MS) / ORBIT_CYCLE_MS;
  for (let k = 1; k < ORBIT_KEYS.length; k += 1) {
    const [u1, v1] = ORBIT_KEYS[k - 1];
    const [u2, v2] = ORBIT_KEYS[k];
    if (u <= u2) return v1 + ((u - u1) / (u2 - u1)) * (v2 - v1);
  }
  return 0;
}
