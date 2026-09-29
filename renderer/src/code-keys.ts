// PURE. WHAT AN ARROW KEY MEANS INSIDE A CHANGE.
//
// The arrow keys were dead, and it was worse than reported. Measured on the real pane
// before anything here existed (scripts/qa-code-artifact.mjs, run of
// 2026-08-26, shots-qa-code-before/qa.json): ArrowDown, ArrowUp, ArrowRight,
// PageUp and PageDown ALL did nothing at all, in every place a person could put
// the keyboard. Seventeen of twenty-five actions passed; every one of the eight
// failures was an arrow.
//
// WHY THEY WERE DEAD, and it is one cause with three faces:
//
//   1. The change binds j and k on a window listener and bound nothing else.
//      No arrow was ever named, so no arrow ever did anything.
//   2. `.code-body` is the thing that scrolls, and it is a plain div. Nothing
//      focuses it, so the browser had no scroller to give the arrows to and
//      the column sat still.
//   3. EACH LINE IS ITS OWN one-line contentEditable. That is load bearing for
//      other reasons (CodeArtifact.tsx says why), but it means a caret in a
//      line is in a document ONE LINE LONG: down from it is nowhere, up from
//      it is nowhere, and right from its last character is nowhere. The
//      browser is not broken here; there is genuinely nothing below the caret
//      to move to, and only the app can know that the next line is a sibling.
//
// So an arrow has to be told what it means, and the answer depends on where her
// keyboard is. That decision is here, in one place, rather than in the
// component, because it was the disagreement between three copies of a key rule
// that caused.
//
// THE MAPPING, and the reason it is this and not something cleverer: it is what
// every editor already does, so nothing has to be learned.
//
//   in a line of code     the caret moves, and crosses into the next line
//   on the file tree      the arrows walk the files, like a sidebar
//   anywhere else         the arrows scroll the code, like a document
//
// J and K keep walking the files from everywhere, untouched. They are the keys
// that were already in a new user's hands.

/** Where her keyboard is, which is what decides what an arrow means. */
export type Where = 'line' | 'tree' | 'code';

/** Just enough of an element to decide, so this file never touches the DOM. */
export type Target = {
  isContentEditable?: boolean;
  className?: string;
  /** True when the element is inside (or is) the file tree. */
  inTree?: boolean;
  /** True when the element is inside (or is) a line of the change. */
  inLine?: boolean;
} | null | undefined;

export function whereIsShe(target: Target): Where {
  if (!target) return 'code';
  if (target.inLine) return 'line';
  if (target.inTree) return 'tree';
  return 'code';
}

/* ----------------------- who owns the key, app or change ------------------ */

/**
 * THE KEYS A CHANGE ANSWERS ITSELF, so the app behind it can stand down.
 *
 * A key pressed at this pane is pressed at the whole window, and the app
 * listens on the window too (App.tsx). BOTH acted. With her real inbox behind
 * the change, pressing J walked to the next FILE and, in the same press, walked
 * to the next TASK — so the change she was reading closed and a different card
 * came up under her hands. Round one's rig ran with a list one row long, where
 * "go to the next task" had nowhere to go and the fault was invisible; the
 * second row in the fixture is what made it show.
 *
 * The arrows are the same fault one surface over: with an offer live on the
 * card, ArrowDown scrolled the code AND moved the selected option, so a reader
 * scrolling through a diff was silently arming an answer she had not chosen.
 *
 * THE RULE IS APPLIED ONCE, TO THE KEY, rather than in each branch that could
 * act on it — the same shape as keys.ts, and for the same reason: fixing
 * branches is how the second branch gets missed.
 *
 * WHAT IS DELIBERATELY NOT IN HERE, because the change does not answer it and
 * she would lose something real: Escape (one step back out of the pane), E
 * (archive), R (reply), C (compose), Z (undo), Enter and the number keys. She
 * can still pick an option by its number while she reads the code; what she
 * cannot do is arrow onto one, and that is the price of the arrows meaning the
 * code, which is the surface she is looking at.
 *
 * J AND K ARE STILL IN HERE AND THEY NOW DO NOTHING, which is the one entry
 * that needs its reason written down. Her answer of 2026-08-27 21:03 took the
 * file-walking off them, and the obvious next step — drop them from this set
 * too — is the wrong one. This set is what makes the APP stand down, and the
 * app's J means "next task". Handing them back would mean a J pressed over a
 * change she is reading closes it and brings up a different card, which is
 * exactly the fault round two was filed for. Removing a convenience must not
 * install a surprise in its place, so the pane keeps the key and spends it on
 * nothing.
 */
export const CHANGE_OWNS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End',
  'j', 'k',
]);

/** True when a change open in the reading pane has already answered this key. */
export function changeOwnsKey(key: string): boolean {
  return CHANGE_OWNS.has(key.length === 1 ? key.toLowerCase() : key);
}

/* ------------------------------ scrolling --------------------------------- */

export type ScrollView = {
  /** The height of one row of code, in pixels. */
  row: number;
  /** The height of the visible column. */
  view: number;
  /** Where it is scrolled to now. */
  top: number;
  /** The furthest it can scroll, i.e. scrollHeight - clientHeight. */
  max: number;
};

/**
 * Where the running column should be after one press, or null when the key is
 * not one this surface answers.
 *
 * A PAGE IS A SCREENFUL LESS TWO ROWS, which is the overlap every reader
 * expects: the last two lines she read stay on the screen so she does not have
 * to find her place again. Home and End go to the ends, and ⌘↑ / ⌘↓ mean the
 * same thing because that is what they mean on a Mac.
 */
export function codeScroll(
  key: string,
  view: ScrollView,
  { meta = false }: { meta?: boolean } = {},
): number | null {
  const max = Math.max(0, view.max);
  const clamp = (n: number) => Math.max(0, Math.min(max, Math.round(n)));
  const row = view.row > 0 ? view.row : 19;
  const page = Math.max(row, view.view - row * 2);
  switch (key) {
    case 'ArrowDown': return meta ? max : clamp(view.top + row);
    case 'ArrowUp': return meta ? 0 : clamp(view.top - row);
    case 'PageDown': return clamp(view.top + page);
    case 'PageUp': return clamp(view.top - page);
    case 'Home': return 0;
    case 'End': return max;
    default: return null;
  }
}

/* ------------------------------- the tree --------------------------------- */

/**
 * Which file the tree lands on after one press, or null when the key is not
 * ours. It STOPS at the ends rather than wrapping: a list that wraps sends her
 * from the last file to the first without her asking, and in a change of
 * eighteen that reads as the pane losing her place.
 *
 * THE ARROWS ONLY.
 *
 * The legend that advertised them was struck the day before (the pane prints
 * no key hints now) and this is the other half: the keys themselves. What is
 * left is what a person would try without being told — the arrows on the tree,
 * Home and End to its ends — and nothing that has to be learned.
 */
export function walkFiles(key: string, at: number, count: number): number | null {
  if (count <= 0) return null;
  const to = (n: number) => Math.max(0, Math.min(count - 1, n));
  switch (key) {
    case 'ArrowDown': return to(at + 1);
    case 'ArrowUp': return to(at - 1);
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/* -------------------------------- the caret -------------------------------- */

/** Where the caret is in the line it is in. */
export type Caret = {
  /** How many characters are to its left. */
  col: number;
  /** How long the line is. */
  len: number;
};

export type CaretStep = {
  /** -1 for the line above, 1 for the line below. */
  move: -1 | 1;
  /**
   * Which column to land on in that line. `Infinity` means the end of it,
   * which is what ArrowLeft off the front of a line has always meant.
   */
  col: number;
};

/**
 * What an arrow does to a caret sitting in a one-line editable, or null when
 * the browser can do it perfectly well by itself.
 *
 * ONLY THE EDGES ARE OURS. ArrowLeft in the middle of a line is the browser's
 * and must stay the browser's, or every accented character, every text
 * selection and every right-to-left run would have to be reimplemented here.
 * We answer exactly the three moves that fall off the end of a one-line
 * document: up, down, and running off either side.
 *
 * SHIFT IS NOT THE CARET'S. A shifted arrow is not a move, it is a selection,
 * and it is answered by `extendHead` below rather than here. This one returns
 * null for it so the caret never moves under a selection that is being made.
 */
export function caretStep(
  key: string,
  caret: Caret,
  { shift = false, meta = false }: { shift?: boolean; meta?: boolean } = {},
): CaretStep | null {
  if (shift) return null;
  if (meta) return null;
  switch (key) {
    case 'ArrowUp': return { move: -1, col: caret.col };
    case 'ArrowDown': return { move: 1, col: caret.col };
    case 'ArrowLeft': return caret.col === 0 ? { move: -1, col: Infinity } : null;
    case 'ArrowRight': return caret.col >= caret.len ? { move: 1, col: 0 } : null;
    default: return null;
  }
}

/* --------------------- SELECTING WITH THE KEYBOARD ------------------------ */

/** The moving end of a selection: which line it is in, and how far into it. */
export type Head = { line: number; col: number };

/**
 * Where the moving end of a selection goes after one shifted key, or null when
 * the key is not one that extends a selection.
 *
 * MEASURED 2026-08-27, on the real pane: holding shift and pressing down twice
 * from the end of a line reached ZERO lines of the change, and shift with up
 * reached one — the line she was already in. So there was no way at all to
 * take a block of code out of a change without a mouse. Round three fixed the
 * drag; this is the same wall from the keyboard side, and the same cause a
 * fourth time: every line is its own editing host, so a native shifted arrow
 * has nothing below the caret to extend into.
 *
 * IT COUNTS EVERY LINE DRAWN, not only the ones she may type in, because that
 * is what the mouse does and a selection that skipped the red lines under her
 * cursor would jump. What lands on the CLIPBOARD is a different question and
 * is answered in code-copy.ts, which drops the removed lines there.
 *
 * `lens` is the length of every drawn line, in the order drawn. It STOPS at
 * the ends rather than wrapping, the same as walkFiles and for the same
 * reason.
 */
export function extendHead(key: string, head: Head, lens: number[]): Head | null {
  if (!lens.length) return null;
  const line = Math.max(0, Math.min(lens.length - 1, head.line));
  const clamp = (n: number) => Math.max(0, Math.min(lens.length - 1, n));
  const at = (n: number, col: number) => ({ line: n, col: Math.max(0, Math.min(col, lens[n])) });
  switch (key) {
    case 'ArrowDown': return line >= lens.length - 1 ? at(line, lens[line]) : at(clamp(line + 1), head.col);
    case 'ArrowUp': return line <= 0 ? at(line, 0) : at(clamp(line - 1), head.col);
    // Off the end of a line the selection carries on into the next one, which
    // is what a shifted right arrow means in any editor and is the same edge
    // caretStep answers for an unshifted one.
    case 'ArrowRight': return head.col >= lens[line]
      ? (line >= lens.length - 1 ? null : at(clamp(line + 1), 0))
      : at(line, head.col + 1);
    case 'ArrowLeft': return head.col <= 0
      ? (line <= 0 ? null : at(clamp(line - 1), lens[clamp(line - 1)]))
      : at(line, head.col - 1);
    case 'Home': return at(line, 0);
    case 'End': return at(line, lens[line]);
    default: return null;
  }
}

/** True when a shifted key is one that extends a selection in the change. */
export function extendsSelection(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft'
    || key === 'ArrowRight' || key === 'Home' || key === 'End';
}

/**
 * Which file the code on screen belongs to, given where each file's header sits
 * relative to the top of the column.
 *
 * THIS IS WHY THE TREE USED TO LIE. Measured 2026-08-26 on the real pane: with
 * the column scrolled 12,240px down to `renderer/src/fixtures.ts`, the tree was
 * still highlighting `designs/2026-08-12-artifact-shelf.html`, the first file
 * in the change. That is not only wrong on the screen — the mark top right of
 * the pane opens THE FILE THE TREE SAYS SHE IS ON, so pressing it would have
 * opened a file she was nowhere near.
 *
 * `offsets` are the header tops in the column's own coordinates. The answer is
 * the last file whose header has passed the top, and the first file before any
 * of them has.
 */
export function fileOnScreen(offsets: number[], top: number, slack = 12): number {
  let at = 0;
  for (let i = 0; i < offsets.length; i++) if (offsets[i] - top <= slack) at = i;
  return at;
}

/* ------------------- AN EDIT THAT WOULD ONLY HALF LAND ---------------------- */

/**
 * True when a keystroke would change her code, and so must be refused while
 * the selection reaches across more than one line.
 *
 * MEASURED 2026-08-27, on the real pane: four lines selected, one press of
 * Backspace, and exactly ONE of the four changed. Typing over the same four did
 * the same. The change still drew 833 lines before and after, so nothing on the
 * screen said that three of the four lines she had selected had been left
 * exactly as they were.
 *
 * The cause is the one this whole item keeps arriving at: every line is its own
 * contentEditable, so the browser's delete reaches the end of the host it is in
 * and stops. It cannot see the other three.
 *
 * SO THE ANSWER IS TO REFUSE THE PRESS, NOT TO IMPLEMENT THE DELETE, and the
 * reason is not effort. These are diff rows, not a document: a selection can
 * run across a red line that is not in the file any more and across a hunk
 * boundary where two lines are not neighbours in any file. A partial
 * copy has no answer there. A press that does nothing is one she can see; a press that takes a
 * quarter of what she selected is one she finds out about later.
 *
 * The selection is LEFT STANDING, so ⌘C still works on it — taking a block of
 * code out of a change is what round four built it for.
 *
 * UNDO AND REDO ARE NOT IN HERE. They belong to whichever line has the
 * keyboard and reach nothing outside it, which is measured and correct.
 */
export function editsAcrossLines(key: string, mods: { meta?: boolean; ctrl?: boolean; alt?: boolean } = {}): boolean {
  if (mods.meta || mods.ctrl || mods.alt) return false;
  if (key === 'Backspace' || key === 'Delete' || key === 'Enter') return true;
  // A printable character is one key long. Every named key ('Shift', 'Tab',
  // 'ArrowUp') is longer, so this needs no list to fall out of date.
  return key.length === 1;
}

/** The same question asked of a beforeinput, which is what catches a paste. */
export function inputChangesText(inputType: string): boolean {
  return inputType.startsWith('insert') || inputType.startsWith('delete');
}
