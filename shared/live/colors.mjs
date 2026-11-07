// A colour each for the people in a live file, drawn on the dark page: bright
// enough to find a cursor at a glance, never the red the app keeps for alarms.
export const LIVE_COLORS = Object.freeze([
  '#7aa2ff', '#5ad1c4', '#f2b35b', '#c792ea', '#7fd67a', '#ff9e7a', '#6cc6f0', '#e6d36a',
  '#a5a0ff', '#4fd39a', '#f59fc6', '#9ed0ff', '#d0b3ff', '#8fe0c0', '#ffc38a', '#b9e36d',
]);

/** The same colour for one person on every copy. */
export function liveColorOf(id) {
  let h = 2166136261;
  for (const ch of String(id ?? '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return LIVE_COLORS[(h >>> 0) % LIVE_COLORS.length];
}
