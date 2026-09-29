/**
 * THE MARKS OVER A FULL SCREEN DOCUMENT, AND WHEN THEY ARE THERE.
 *
 * So in full screen the bar is nothing at all and the document is the whole
 * window. The three marks float in the top right corner and are drawn only
 * while she is reaching for them.
 *
 * WHY A CORNER AND NOT THE WHOLE WINDOW. The obvious build listens for
 * mousemove and shows the marks whenever the pointer moves. It does not work
 * here, and the reason is the same one that made the resize grip capture its
 * pointer: the document is an iframe, and a pointer moving across an iframe
 * sends this document nothing at all. Full screen is the one layout where the
 * pointer is ALWAYS over the frame, so that listener would fire on the way in
 * and then never again.
 *
 * What works is a reach: a small transparent area of OUR document laid over
 * the corner the marks live in, above the frame. Moving the pointer up there
 * is what brings them back, which is also the thing she described. A move
 * anywhere else in our own chrome counts too, so coming from the sidebar wakes
 * them without a detour.
 */

/** How long the marks stay after the last movement, in ms. */
export const CHROME_HOLD = 1800;

/**
 * The corner that wakes them, in px: wide and tall enough to cover the marks
 * plus the air around them. It grew from 220x64 on 2026-09-22 when the marks
 * moved down out of the window's drag strip; a reach that stopped above them
 * would leave a band she could sit in without them appearing.
 */
export const CHROME_REACH = { width: 260, height: 110 };

/**
 * `awake` is the hold above, still running. `reaching` is the pointer inside
 * the corner. Reaching beats the clock, because the marks may not fade out
 * from under the hand that is on its way to press one.
 */
export function chromeIsUp(state: { reaching: boolean; awake: boolean }): boolean {
  return state.reaching || state.awake;
}
