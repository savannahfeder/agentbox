// What the zoom readout says. Kept apart from the menu, like zoom-keys.mjs, so
// it imports without Electron and the ladder can be tested for real.
//
// So this file computes one number and nothing else. Chromium's zoom factor is
// 1.2 to the power of the level, which is why her ladder reads 76, 83, 91, 100,
// 110, 120 rather than the round numbers other apps step through. Moving the
// ladder onto 75/80/90/100/110/125 was offered and she did not ask for it, so
// the steps stay exactly as they were and only the readout is new.

const CHROMIUM_ZOOM_BASE = 1.2;

/**
 * The percentage to show for a Chromium zoom level. Level 0 is 100%, level 1 is
 * 120%, level -0.5 is 91%. Returns null for a level that is not a number, so a
 * caller can tell "no readout" from a readout of 0.
 */
export function zoomPercentFor(level) {
  if (typeof level !== 'number' || !Number.isFinite(level)) return null;
  return Math.round(CHROMIUM_ZOOM_BASE ** level * 100);
}
