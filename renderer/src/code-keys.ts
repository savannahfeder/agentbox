// Pure rules for what a key means inside a change. Each line is its own
// one-line contentEditable (CodeArtifact.tsx says why), so the browser has no
// line above or below the caret to move to, and `.code-body` is a plain div
// nothing focuses, so it gets no arrow keys either. The mapping is what every
// editor does: in a line the caret moves and crosses lines, on the file tree
// the arrows walk the files, anywhere else they scroll the code.

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

/**
 * The keys a change answers itself, so the app's own window listener (App.tsx)
 * stands down. Without it one press acted twice: J closed the change and opened
 * the next task, and ArrowDown scrolled the code and moved a card's selected
 * option. Escape, E, R, C, Z, Enter and the number keys stay with the app.
 *
 * J and K walk nothing in a change but stay in the set, because the app's J
 * means "next task" and would close the change she is reading.
 */
export const CHANGE_OWNS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End',
  'j', 'k',
  // Next and previous change, see nextChange.
  ']', '[',
]);

/**
 * Where ] and [ go: the start of the next change below the top of the column,
 * or of the one before, or null at either end. `starts` are where each change
 * begins in the column, in order; `top` is where the column is scrolled. The
 * slack makes ] on a change go to the next one rather than the same one
 * (tests/the-next-change-is-one-key-away.test.mjs).
 */
export function nextChange(starts: number[], top: number, dir: 1 | -1, slack = 4): number | null {
  if (dir > 0) return starts.find((s) => s > top + slack) ?? null;
  for (let i = starts.length - 1; i >= 0; i--) if (starts[i] < top - slack) return starts[i];
  return null;
}

/** True when a change open in the reading pane has already answered this key. */
export function changeOwnsKey(key: string): boolean {
  return CHANGE_OWNS.has(key.length === 1 ? key.toLowerCase() : key);
}

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
 * not one this surface answers. A page is a screenful less two rows, so the
 * last two lines read stay on screen. ⌘↑ and ⌘↓ go to the ends, as on a Mac.
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

/**
 * Which file the tree lands on after an arrow, Home or End, or null for any
 * other key. It stops at the ends rather than wrapping, so the pane never jumps
 * from the last file to the first on its own.
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
  /** Which column to land on in that line. `Infinity` means the end of it. */
  col: number;
};

/**
 * What an arrow does to a caret in a one-line editable, or null when the
 * browser handles it. Only moves off the edge of the line are ours: inside a
 * line the browser already handles accented characters, selections and
 * right-to-left text. A shifted arrow is a selection, answered by `extendHead`,
 * so this returns null for it.
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

/** The moving end of a selection: which line it is in, and how far into it. */
export type Head = { line: number; col: number };

/**
 * Where the moving end of a selection goes after one shifted key, or null when
 * the key is not one that extends a selection. Each line is its own editing
 * host, so a native shifted arrow has nothing beyond the line to extend into.
 *
 * It counts every drawn line, removed ones too, as the mouse does; code-copy.ts
 * drops removed lines from the clipboard. `lens` is the length of every drawn
 * line, in drawn order. It stops at the ends, like walkFiles.
 */
export function extendHead(key: string, head: Head, lens: number[]): Head | null {
  if (!lens.length) return null;
  const line = Math.max(0, Math.min(lens.length - 1, head.line));
  const clamp = (n: number) => Math.max(0, Math.min(lens.length - 1, n));
  const at = (n: number, col: number) => ({ line: n, col: Math.max(0, Math.min(col, lens[n])) });
  switch (key) {
    case 'ArrowDown': return line >= lens.length - 1 ? at(line, lens[line]) : at(clamp(line + 1), head.col);
    case 'ArrowUp': return line <= 0 ? at(line, 0) : at(clamp(line - 1), head.col);
    // Off the end of a line the selection carries on into the next one.
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
 * Which file the code at the top of the column belongs to. The tree highlights
 * it, and the pane's open-file mark opens it. `offsets` are the file header tops
 * in the column's own coordinates. The answer is the last file whose header has
 * passed the top, or the first file before any has.
 */
export function fileOnScreen(offsets: number[], top: number, slack = 12): number {
  let at = 0;
  for (let i = 0; i < offsets.length; i++) if (offsets[i] - top <= slack) at = i;
  return at;
}

/**
 * True when a keystroke would change her code, so it is refused while the
 * selection spans more than one line. Each line is its own contentEditable, so
 * the browser's delete stops at the end of the line it is in and would change
 * only one of the selected lines.
 *
 * Refusing beats implementing the edit: these are diff rows, and a selection
 * can cross a removed line or a hunk boundary where no file edit is right. The
 * selection stays, so ⌘C still works. Undo and redo stay with the line that has
 * the keyboard.
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
