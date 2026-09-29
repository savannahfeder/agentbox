// Which keystrokes mean zoom. Kept apart from the menu so it imports without
// Electron and can be tested for real rather than asserted against source text.
//
// Her window has been sitting at zoom level 1 (1.2x) since before it was
// launched, because Chromium stores zoom per page URL in the profile and hands
// it back on every load. The chords are the only way out of that, so they have
// to arrive.
//
// "Cmd +" is really ⇧⌘= on a US keyboard, which reports key '+' and code
// 'Equal'. Matching on BOTH key and code is what makes the shifted form, the
// unshifted form and the numpad all land on the same command.

const IN = { Equal: 0.5, NumpadAdd: 0.5, Minus: -0.5, NumpadSubtract: -0.5, Digit0: 0, Numpad0: 0 };
const KEYS = { '=': 0.5, '+': 0.5, '-': -0.5, _: -0.5, 0: 0 };

/**
 * The zoom step a before-input-event describes, or null if it is not a zoom
 * chord. 0.5 in, -0.5 out, 0 actual size. The app is a real answer here, so
 * callers must test for null, not for falsiness.
 */
export function zoomDeltaFor(input) {
  if (!input || input.type !== 'keyDown') return null;
  if (!(input.meta || input.control)) return null;
  if (input.alt) return null; // ⌥⌘- and friends belong to whoever else wants them
  const byCode = IN[String(input.code ?? '')];
  if (byCode !== undefined) return byCode;
  const byKey = KEYS[String(input.key ?? '')];
  return byKey === undefined ? null : byKey;
}

// WHICH CONTENTS GETS ZOOMED, and why this is not just `getFocusedWebContents`.
//
// That is the CLICK, not the keystroke, and it rules out the accelerator being
// the only fault. A click had no contents of its own and asked for the focused
// one, which returns null whenever nothing on screen claims focus, and on macOS
// the menu itself holds the keyboard while she is choosing from it. Null was a
// silent no-op, and the silent no-op is the whole complaint.
//
// Electron hands a menu click the window it was chosen from, so the click now
// carries a target and never has to guess. This is the same move `Reload` made
// on 2026-08-06; zoom was the last item in this menu still guessing.

/**
 * The web contents a zoom should act on, first non-destroyed of: the one the
 * caller named (the keystroke's own contents, or the window a menu click came
 * from), then whatever is focused, then the app's own window. Returns null only
 * if there is genuinely nothing on screen.
 */
export function zoomTarget({ named = null, focused = null, appWindow = null } = {}) {
  for (const contents of [named, focused, appWindow]) {
    if (contents && !contents.isDestroyed?.()) return contents;
  }
  return null;
}
