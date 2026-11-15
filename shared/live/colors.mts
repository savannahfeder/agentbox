// A colour each for the people in a live file, drawn on the dark page. Quiet,
// mid-strength tones that sit with the page rather than shout on it, still far
// enough apart to tell two cursors from each other, and never the red the app
// keeps for alarms.
export const LIVE_COLORS: readonly string[] = Object.freeze([
  '#8b9cf4', '#6fb7b0', '#d4a35f', '#b48ad6', '#86b87a', '#d98b74', '#6fa8d1', '#c9b86a',
  '#9a8fe0', '#5fb08a', '#d58fae', '#8fb3d9', '#b9a3dc', '#7fbfa8', '#d6a27c', '#a3bf6e',
]);

/** The same colour for one person on every copy. */
export function liveColorOf(id: unknown): string {
  let h = 2166136261;
  for (const ch of String(id ?? '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return LIVE_COLORS[(h >>> 0) % LIVE_COLORS.length];
}
