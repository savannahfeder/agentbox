// PURE. Which keys still belong to the APP while the keyboard is inside an
// open artifact.
//
// MEASURED BEFORE ANYTHING WAS TOUCHED, on the real renderer with her real
// cards and her real files (scripts/measure-keys-with-an-artifact.mjs, run
// 2026-08-24). "Inside the file" is one click in the artifact, which is what a
// person does with an artifact:
//
//   markdown, caret in the file    ⌘K dead    j dead    Escape dead
//   page, clicked inside it        ⌘K dead    j dead    Escape closes it
//   change, caret in a line        ⌘K works   j dead    Escape dead
//
// THREE MECHANISMS, AND THAT IS WHY THIS FILE EXISTS RATHER THAN THREE PATCHES.
//
//   1. The markdown editor swallowed every key it saw. `DocText` stopped
//      propagation on every keydown so that a letter typed into a file is not
//      also a shortcut — right intent, and the app already refuses letters by
//      itself (`inInput` in App.tsx) — but the app's own window listener sits
//      ABOVE the React root, so the same line also swallowed ⌘K and Escape.
//   2. A page is its own document in its own origin, so no key crosses into
//      the app at all. Main forwards from below the page, and it forwarded
//      exactly one key, Escape.
//   3. A line of a change is a contentEditable, so `inInput` is true and the
//      app's guard returns on everything single-letter — including Escape,
//      which is the one key that has to work from in there.
//
// So the rule is written once, here, and applied at all three: A CHORD IS NEVER
// TEXT, AND ESCAPE IS ALWAYS THE WAY BACK. Everything else typed inside a file
// is typing, and the app keeps its hands off it, which is the part that was
// already right.

/**
 * Does this press belong to the app even though the keyboard is in the file?
 *
 * Escape, and any Command or Control chord. NOT Option on its own: on a Mac
 * option-e is a letter she is typing, and treating it as a chord would take
 * accented characters away from a file she is editing.
 *
 * ⌘S IS DELIBERATELY IN HERE even though it is the file's own save. The save
 * listener is a window listener too (`DocText`), so it was dead for exactly the
 * same reason and by exactly the same line: her "Saved." never appeared when
 * the caret was in the document, which is the only place ⌘S is ever pressed.
 * Letting the chord through is what makes that one work again as well.
 */
export function theAppKeepsThisKey(e) {
  if (!e || typeof e.key !== 'string') return false;
  if (e.key === 'Escape') return true;
  return !!(e.metaKey || e.ctrlKey);
}

/**
 * The same question asked from the main process, where a key arrives as an
 * Electron `input` rather than a DOM event. One rule, two vocabularies.
 */
export function theAppKeepsThisInput(input) {
  if (!input || typeof input.key !== 'string') return false;
  return theAppKeepsThisKey({ key: input.key, metaKey: !!input.meta, ctrlKey: !!input.control, altKey: !!input.alt });
}

/**
 * What the app does with a key that came up from inside a page in the pane.
 *
 * 'close' is Escape, which has meant "out of the file" since. 'palette' is ⌘K,
 * which is the app's own and which a page drawn in a frame has no claim on.
 * 'app' is one of her letters coming up out of a PAGE, where nothing is text.
 * The pane hands it straight back to the app's own handler rather than
 * restating what any letter means, so E archives, J and K walk, R replies, and
 * each of them keeps every guard the app already puts in front of it. null is
 * every other chord: ⌘R, ⌘=, ⌘Y and the rest are answered in the main process
 * already, and the window must not answer them a second time.
 */
export function whatTheFileSentUp(k) {
  if (!k || typeof k.key !== 'string') return null;
  if (k.key === 'Escape') return 'close';
  if ((k.meta || k.ctrl) && k.key.toLowerCase() === 'k') return 'palette';
  if (theAppKeepsThisLetterInAPage({ key: k.key, meta: k.meta, control: k.ctrl, alt: k.alt })) return 'app';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A PAGE HAS NOTHING TO TYPE IN, SO IT KEEPS NONE OF HER LETTERS.
//
// MEASURED BEFORE ANYTHING WAS TOUCHED
// (scripts/measure-keys-with-an-artifact.mjs, the run recorded in
// shots//e-before.json). E is not dead the way ⌘K was dead. With the keyboard
// ON THE MESSAGE it archives the card whether a file is open beside it or not;
// the app's handler runs, `inInput` is false, and the write goes through. It
// dies only once she clicks INTO the artifact, and there the three kinds are
// not the same thing at all:
//
//   markdown, caret in the file    E is a letter she is typing.  Correct.
//   change, caret in a line        E is a letter she is typing.  Correct.
//   page, clicked inside it        E is nothing at all.          The bug.
//
// Escape hands the keyboard back and then E works, which is the idiom the whole
// of this file is built on.
//
// A page is the odd one. There is nothing in it to type, so no key in it is
// text, and the only reason E was dead is that the list of keys the app asks
// for from below the page was Escape and chords — the list above. Her letters
// were never on it. So they go on it, here, once.
//
// WHAT IS DELIBERATELY NOT ON IT:
//   Arrows, Enter, space, Tab   the page's own. Arrows SCROLL a page; taking
//                               them would break reading the very thing she
//                               opened. Tab walks the page's own links.
//   1 through 9                 those APPROVE an option, and approval in this
//                               app only ever happens deliberately (App.tsx
//                               says so where E used to approve and burned
//                               her). A forwarded digit is not deliberate.
export const HER_LETTERS_IN_A_PAGE = new Set(['e', 'j', 'k', 'r', 'c', 'n', 's', 'z', 'b', 'g', '/', '\\']);

/**
 * Is this one of her letters, arriving from inside a page where there is
 * nothing to type?
 *
 * Bare or shifted only. A chord is already answered by theAppKeepsThisInput
 * above, and Option-e is a letter on a Mac, so neither belongs here.
 */
export function theAppKeepsThisLetterInAPage(input) {
  if (!input || typeof input.key !== 'string') return false;
  if (input.meta || input.control || input.alt) return false;
  return HER_LETTERS_IN_A_PAGE.has(input.key.toLowerCase());
}

/**
 * The one question main cannot answer by itself: is she typing INSIDE the page?
 *
 * A page is her own html and 15 of the 406 under her product's designs, reports
 * and landing folders carry a real text field (counted 2026-08-24). If she is
 * in one of those, every letter she types is text and none of it is a shortcut
 * — the same rule the app applies to its own fields, applied one document down.
 * Main asks the frame this, because only the frame can see its own focus.
 */
export const IS_SHE_TYPING_IN_THE_PAGE = `(() => {
  const a = document.activeElement;
  if (!a) return false;
  const t = String(a.tagName || '').toUpperCase();
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || !!a.isContentEditable;
})()`;
