/** Where a sheet goes when the finger leaves it, from how far down and how fast. */
export function sheetLetGo(dy: number, vy: number, height: number): 'away' | 'back' {
  return dy > height / 3 || vy > 0.9 ? 'away' : 'back';
}

/** How far the sheet moves for a pull: all the way down, a little up. */
export function sheetPull(dy: number): number {
  return dy >= 0 ? dy : -Math.sqrt(-dy) * 1.6;
}
