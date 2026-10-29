// "COPY" IN THE RIGHT-CLICK MENU ALWAYS PUTS SOMETHING ON THE CLIPBOARD.
//
// The founder, w-f7d2841075 (2026-09-26): right-click a link, press Copy, paste,
// and what comes out is whatever was on the clipboard before. Third report of
// the same thing (w-71f790a6eb, w-b108b1d596), and each earlier fix was
// measured on a bare test page where the copy did land.
//
// MEASURED this time on the real app: a seeded message, a real right-click on a
// link (on a Mac that selects the link's words, so "Copy" is the top item), and
// the real native menu item pressed through the accessibility API. The click
// handler ran, `contents.copy()` was called, and the clipboard still held the
// sentinel written before the click. "Copy Link Address", which writes the
// clipboard directly from here, landed every time.
//
// `contents.copy()` asks the page to run its own copy command, and whether that
// lands depends on focus and selection state inside the page at the moment the
// menu closes, which this process cannot see. The words she right-clicked on
// are already in hand: Chromium hands them over as `params.selectionText` at the
// moment of the click. So the page still gets the first go, because its copy
// carries the rich version (pictures inlined, our file links unwrapped, see
// renderer/src/copy-out.ts), and if nothing has landed shortly after, the words
// are written directly. Either way the old clipboard is gone.

/**
 * Copy what a context menu was raised on.
 *
 * @param {{ copy: () => void }} contents the web contents the menu was raised on
 * @param {string} selectionText `params.selectionText` from the context-menu event
 * @param {{ clear: () => void, availableFormats: () => string[], writeText: (t: string) => void }} clipboard
 * @param {{ waitMs?: number, stepMs?: number, sleep?: (ms: number) => Promise<void> }} [opts]
 * @returns {Promise<'page' | 'direct'>} which of the two put it there
 */
export async function copySelection(contents, selectionText, clipboard, opts = {}) {
  const waitMs = opts.waitMs ?? 600;
  const stepMs = opts.stepMs ?? 25;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  // Nothing selected (a Copy in an empty text box) has no words to fall back
  // on, and clearing would throw away her clipboard for nothing.
  if (!selectionText) {
    try { contents.copy(); } catch { /* nothing to copy anyway */ }
    return 'page';
  }
  // Cleared first, so "something is on the clipboard" can only mean this copy
  // put it there. The words are written below if the page does not, so a
  // cleared clipboard never outlives this function.
  clipboard.clear();
  try { contents.copy(); } catch { /* a destroyed contents; the words still go */ }
  for (let waited = 0; waited < waitMs; waited += stepMs) {
    if (clipboard.availableFormats().length) return 'page';
    await sleep(stepMs);
  }
  if (clipboard.availableFormats().length) return 'page';
  clipboard.writeText(selectionText);
  return 'direct';
}
