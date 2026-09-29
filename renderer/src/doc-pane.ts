// PURE. What the document pane opens, what it calls the file, and how wide it is.
//
// The look of the pane is settled and lives in styles.css and DocPane.tsx. This
// file is the arithmetic and the naming, kept out of the component so it can be
// tested without a window.

/**
 * The kinds of file the pane draws, and nothing else.
 *
 * `code` IS THE THIRD ONE AND IT IS NEW.A change the agent made is written by
 * the run as a file with a path, exactly like the drawing and the report
 * already are, so it opens here the same way and needs no second idea of what
 * an artifact is.
 *
 * `image` IS THE FOURTH AND IT REVERSES THE RULE BELOW.*/
export type DocKind = 'html' | 'markdown' | 'code' | 'image';

/**
 * What the pane would do with this path, or null when it should be handed to
 * the operating system the way every other file always has been.
 *
 * A pdf opens in Preview and a source file in her editor. Those are still
 * better than anything this pane could draw.
 *
 * A PNG USED TO BE ON THAT LIST AND IS NOT ANY MORE. She asked for the picture
 * back on 2026-09-20. Preview is still one press away: the open mark in the
 * pane's own header hands the file to it, exactly as it does for a page.
 */
export function docKind(path: string | undefined | null): DocKind | null {
  if (!path) return null;
  const clean = String(path).split(/[?#]/)[0];
  if (/\.html?$/i.test(clean)) return 'html';
  if (/\.(md|markdown)$/i.test(clean)) return 'markdown';
  if (/\.change$/i.test(clean)) return 'code';
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(clean)) return 'image';
  return null;
}

/** Is this a file the pane can open at all. */
export function opensInPane(path: string | undefined | null): boolean {
  return docKind(path) !== null;
}

/**
 * It is cut down to what she would say out loud. An absolute path resolved by
 * the main process is ten segments of machine (`/Users/you/Zero/accounts/
 * 00000000-/astral/designs//pane-card/the-card-you-picked.html`), and the only
 * part of that she has ever named is the tail. So the crumb keeps the
 * product's own folder and everything under it, and drops the account plumbing
 * above it; when no root matches it keeps the last three segments, which is
 * enough to say which file this is without printing a disk layout.
 */
export function crumbParts(fullPath: string, roots: string[] = []): string[] {
  const clean = String(fullPath ?? '').replace(/^file:\/\//, '').replace(/\/+$/, '');
  if (!clean) return [];
  // The deepest root that actually contains the file wins, so `designs/` inside
  // the docs dir does not swallow the folder the drawing is in.
  let best = '';
  for (const root of roots) {
    if (!root) continue;
    const r = root.replace(/\/+$/, '');
    if ((clean === r || clean.startsWith(`${r}/`)) && r.length > best.length) best = r;
  }
  if (best) {
    // The root's own last segment leads, because "astral" and "landing" are
    // what she calls these places.
    const head = best.split('/').filter(Boolean).slice(-1);
    const rest = clean.slice(best.length + 1).split('/').filter(Boolean);
    return [...head, ...rest];
  }
  const parts = clean.split('/').filter(Boolean);
  return parts.slice(-3);
}

/** The file's own name, for a title attribute and for the collapsed line. */
export function docName(fullPath: string): string {
  const parts = crumbParts(fullPath);
  return parts[parts.length - 1] ?? '';
}

// HER SPLIT IS EVEN AND FULLY RESIZABLE, and these two numbers are the whole of
// the limit on it. Measured on the drawn screen 2026-08-20 (pane-round2/
// drag-sweep.txt): on her 1920 display the reading line holds its full 716px
// out to 59% of the window and the document is already 1093px wide there, so
// nearly all of the useful travel is inside these bounds anyway. The floors
// exist so a stray drag cannot leave either half as a sliver she then has to
// find the edge of again.
export const MIN_SPLIT = 0.25;
export const MAX_SPLIT = 0.75;
export const EVEN_SPLIT = 0.5;

// WHERE THE DIVIDER OPENS BEFORE SHE HAS DRAGGED IT HERSELF.
//
// It is a fraction of the window the FILE takes, so three quarters is the file
// and the remaining quarter is her task. Written here rather than in the
// stylesheet because the pane's width is an inline flex-basis the divider
// writes, so this is the one number the pane, the grip's floor and any shot
// script all have to read from one place.
//
// 0.72 RATHER THAN 0.75 IS DELIBERATE: MAX_SPLIT is 0.75, and opening exactly
// on the ceiling means her first drag can only go one way, which reads as a
// divider that is stuck. Opening just inside it leaves travel in both
// directions on the first pull, and travel is her second sentence.
//
// WHAT IT COSTS, measured on the drawn screen 2026-08-22 and worth keeping next
// to the number: the file goes from 821.5 to 1197 points wide, +46%, and her
// own words on the left drop from 96 characters a line to 56.
export const OPENING_SPLIT = 0.72;

/** Keep a fraction of the window inside the two floors. */
export function clampSplit(fraction: number): number {
  if (!Number.isFinite(fraction)) return EVEN_SPLIT;
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, fraction));
}

/**
 * Where a drag puts the divider, as a fraction of the window the DOCUMENT takes.
 * The pointer is on the divider, so everything right of it is the document.
 */
export function splitFromPointer(clientX: number, windowWidth: number): number {
  if (!windowWidth) return EVEN_SPLIT;
  return clampSplit((windowWidth - clientX) / windowWidth);
}

// She resized it once; it stays where she put it. Written under a versioned key
// so a later change to what the number means cannot read an old one back.
export const SPLIT_KEY = 'zero.docPane.split.v1';

/**
 * Read the remembered split, falling back to where it opens. Never throws.
 *
 * WHAT SHE DRAGGED OUTRANKS THE OPENING FRACTION, and an unset key is the only
 * case that takes OPENING_SPLIT: a window she has already sized is a window she
 * has already answered this question on, and moving it under her on the next
 * launch would be the app forgetting.
 */
export function readSplit(store: Pick<Storage, 'getItem'> | null | undefined): number {
  try {
    const raw = store?.getItem(SPLIT_KEY);
    if (!raw) return OPENING_SPLIT;
    const parsed = Number.parseFloat(raw);
    // NO READABLE PREFERENCE IS THE SAME ANSWER AS NO PREFERENCE, and it is
    // checked here rather than left to clampSplit because that function is the
    // general clamp: `splitFromPointer` wants an even split back when it is
    // handed a window with no width, and this wants where the pane opens.
    if (!Number.isFinite(parsed)) return OPENING_SPLIT;
    return clampSplit(parsed);
  } catch {
    return OPENING_SPLIT;
  }
}

/** Remember the split. Never throws. */
export function writeSplit(store: Pick<Storage, 'setItem'> | null | undefined, fraction: number): void {
  try { store?.setItem(SPLIT_KEY, String(clampSplit(fraction))); } catch { /* private mode, nothing to do */ }
}

// THERE IS NO ZOOM IN HERE, AND THAT IS THE ANSWER, NOT AN OMISSION.
//
// So the size of an open file is the size of the window, and Command minus is
// the whole control. The pane is an ordinary part of the page, so the app zoom
// already carries it. Do not add a second one here.
/**
 * Does esc close the document, or leave the task?
 *
 * It closes a document SHE opened, because she opened it and esc is how she
 * puts a thing down. It does not stand in the way of one the card opened by
 * itself: once most cards open a document on arrival (message-artifacts.ts
 * counts 505 of 619), esc-to-leave would cost two presses on nearly every card
 * in her inbox, and she never asked for the pane on any of them.
 */
export function escapeClosesDoc(doc: { auto?: boolean } | null | undefined): boolean {
  return !!doc && !doc.auto;
}

/**
 * The same key, pressed with the keyboard INSIDE the open file.
 *
 * WHY THIS IS NOT THE RULE ABOVE, AND NOT A CHANGE TO IT. A keydown never
 * crosses a document boundary: the page in the frame is its own document, in
 * its own origin, so once her click lands inside it the app's own window
 * listener stops hearing the key entirely. Main forwards it instead
 * (before-input-event in main/main.mjs), and this decides what it means when it
 * arrives.
 *
 * It is the FILE, always, including one the card opened by itself. The rule
 * above is about a press on the MESSAGE, where a pane she never asked for must
 * not cost her a keystroke on nearly every card in her inbox. A press inside
 * the page is not that press. She is in the file, and back means out of it.
 */
export function escapeInTheFileClosesIt(doc: { auto?: boolean } | null | undefined): boolean {
  return !!doc;
}

// HOW THE ARTIFACT IS HELD, AND IT IS ANSWERED. The code, a markdown file and a
// page were each drawn both in the card and flush to the window's edge, and
// compared.
//
// So the frame is not a setting and never was: it is a property of the KIND.
// A change is flush, a markdown file and a page keep the card. The switch that
// existed to shoot both ways is deleted, and the
// stylesheet keys off doc-code like it already keys off doc-md and
// doc-html. Do not add a preference back.
//
// B AND C WERE THE SAME SCREEN.The only difference was the agent's own sentence
// drawn over each change, and she turned that sentence down in the same answer,
// so B is what got built.

/** The class on the frame the file is drawn in (DocPane.tsx, styles.css). */
export const DOC_FRAME_CLASS = 'doc-view';

/**
 * Is the keyboard inside the open file rather than on the app's own page?
 *
 * When focus is inside a frame, the parent document's `activeElement` is the
 * frame ELEMENT itself — measured on Electron 43, 2026-08-21: IFRAME#f while
 * the file had the keyboard, DIV#log the moment the app took it back. That is
 * the whole test, and it is what keeps the forwarded key from being answered
 * twice: main only forwards from a frame, and this refuses anything that
 * arrives while the app's own page has the keyboard.
 */
export function focusIsInTheFile(
  active: { tagName?: string; classList?: { contains(c: string): boolean } } | null | undefined,
): boolean {
  if (!active) return false;
  if (String(active.tagName ?? '').toUpperCase() !== 'IFRAME') return false;
  return !!active.classList?.contains(DOC_FRAME_CLASS);
}
