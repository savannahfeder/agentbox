// XTERM'S OWN ASSERTION, CAUGHT WHERE WE CAN REACH IT.
//
// @xterm/xterm 6.0.0's AccessibilityManager listens on the document for
// 'selectionchange', maps the selection onto terminal rows and columns, and
// does `throw new Error('invalid range')` when the result covers no cells,
// under its own comment "This should not happen unless we have some bugs". It
// happens. Three ordinary selections reach it, measured against the published
// bundle; the test beside this file
// (tests/a-selection-that-covers-no-terminal-cells-is-not-a-crash.test.mjs)
// lists them and says how.
//
// Only a screen reader user gets that handler at all, because the pane asks
// `app.accessibilitySupportEnabled` before turning `screenReaderMode` on. For
// them the throw escapes as an unhandled renderer error, and the terminal keeps
// whatever was selected before it, so a copy afterwards takes stale text.
//
// WHY A WRAPPER AND NOT A PATCHED BUNDLE. What we build against is minified
// `lib/xterm.mjs`, and rewriting a file inside node_modules at build time is
// machinery that has to hold through `npm ci` on two CI runners and every
// release. xterm dispatches the handler as `() => this._handleSelectionChange()`,
// off the instance, so one own property on the manager shadows it and the
// wrapper dies with the terminal.
//
// IT SWALLOWS ONE MESSAGE AND NOTHING ELSE. The same handler warns about two
// genuine race conditions and returns; anything that is not this exact
// assertion is somebody's bug and goes on up.
//
// This is a workaround, and the upstream fix is the assertion becoming a
// clearSelection and a return. When an xterm release carries that, the test
// above turns red on the bundle it reads, and this file goes.
export const INVALID_RANGE = 'invalid range';

/**
 * Wrap the accessibility manager's selection handler on `terminal`, which must
 * already be open. Answers whether there was one to wrap: false when
 * screenReaderMode is off, which is every install not running a screen reader,
 * and false when it is already wrapped.
 */
export function guardInvalidRange(terminal, { warn = console.warn } = {}) {
  const manager = terminal?._core?._accessibilityManager?.value;
  const handler = manager?._handleSelectionChange;
  if (typeof handler !== 'function' || handler.guardsInvalidRange) return false;
  const guarded = function (...args) {
    try {
      return handler.apply(this, args);
    } catch (e) {
      // Message, not instanceof: an Error from another realm is still this bug.
      if (e?.message !== INVALID_RANGE) throw e;
      warn(`xterm mapped the selection onto no cells and threw "${INVALID_RANGE}"; cleared the terminal's selection instead`);
      // It threw before mirroring the selection, so the terminal is still
      // holding the previous one. Nothing is selected; say that.
      terminal.clearSelection();
    }
  };
  guarded.guardsInvalidRange = true;
  manager._handleSelectionChange = guarded;
  return true;
}
