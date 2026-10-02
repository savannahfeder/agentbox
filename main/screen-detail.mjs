// WHICH SET OF PICTURES A SCREEN GETS., 2026-08-22.
//
// Kept out of main.mjs and free of Electron, like zoom-keys.mjs, so the rule can
// be tested against made-up displays instead of against whatever monitor the
// machine running the tests happens to have.
//
// WHY THE BUILT-IN PANEL AND NOT A WIDTH. Three numbers were on the table and
// two of them lie:
//
//   - device pixels across the screen: her laptop reports 3420 and the 34" is
//     3440. A 20px gap is not a signal.
//   - devicePixelRatio in the window: she runs the app at 120% zoom, so the
//     laptop reads 2.4 and the 34" would read 1.2. Correct today and it flips
//     the moment she presses Cmd+minus a few times, because Chromium folds page
//     zoom into that number.
//   - the display's own scaleFactor and `internal` flag, which the main process
//     reads off the window server. Neither moves when the page zooms.
//
// So: the built-in panel of a Retina laptop is the small dense screen, and
// everything plugged into it is the big one. That is her sentence, not a
// threshold anybody has to defend later. Measured on her machine 2026-08-22
// through the running app: one display, `internal: true`, `scaleFactor: 2`,
// 1710x1107 points, window zoom 1.2.

/** @typedef {'soft' | 'sharp'} ScreenDetail */

/**
 * Which picture set a display should paint.
 *
 * Anything unrecognisable answers 'sharp', because the sharp set is what every
 * screen got before this existed and an unreadable display is not a reason to
 * quietly downgrade one. `internal` is undefined on some platforms; that is a
 * 'sharp' too, for the same reason.
 *
 * @param {{ internal?: boolean, scaleFactor?: number } | null | undefined} display
 * @returns {ScreenDetail}
 */
export function screenDetailFor(display) {
  if (!display || typeof display !== 'object') return 'sharp';
  if (display.internal !== true) return 'sharp';
  const s = display.scaleFactor;
  if (typeof s !== 'number' || !Number.isFinite(s)) return 'sharp';
  return s >= 2 ? 'soft' : 'sharp';
}
