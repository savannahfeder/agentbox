export const SWIPE_COMMIT = 96;
const FLICK = { speed: 0.8, reach: 40 };

/** What a row swiped sideways does when let go: left closes, right is Later. */
export function rowSwipe(dx: number, vx: number): 'close' | 'later' | null {
  const flick = Math.abs(vx) > FLICK.speed && Math.abs(dx) > FLICK.reach && Math.sign(vx) === Math.sign(dx);
  if (Math.abs(dx) <= SWIPE_COMMIT && !flick) return null;
  return dx < 0 ? 'close' : 'later';
}

/** A drag is the row's only when it is plainly sideways; the rest scroll the list. */
export function rowSwipeClaims(dx: number, dy: number): boolean {
  return Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5;
}
