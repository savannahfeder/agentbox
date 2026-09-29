// PURE. THE LINE BREAKS A WORKER TYPED INSIDE A BLOCK, TAKEN BACK OUT ON COPY.
//
// WHAT IS ACTUALLY WRONG, MEASURED rather than guessed. The block she copied is
// the email draft on, and it is in her store: the last patch of 2026-08-29
// carries a fenced block whose prose lines are 75 to 82 characters and then
// STOP. Those are real newline characters in the stored text, not the pane
// wrapping a long line, so `innerText` copies them faithfully and the mail
// client draws every one of them as a break. Her own screenshots prove it from
// the other end: in the third one she has joined the first paragraph by hand
// and it reflows with the window, while the two paragraphs below it break at
// exactly the same words as the block she copied from. A soft wrap would have
// moved.
//
// It is not one bad message either. Across her five product ledgers on
// 2026-08-30 there were 70 fenced blocks, and 12 of them, on 9 items in 5
// products, are prose hard wrapped this way. Workers write drafts at 80 columns
// because that is how they write everything.
//
// SO THE FIX IS ON THE WAY OUT, NOT IN THE MESSAGE. Rewriting the workers'
// habit only helps the next draft; unwrapping at copy time also fixes every one
// of the twelve already sitting in her store, including the one she is holding.
//
// WHAT MUST NOT HAPPEN is a shell command losing its newlines. 58 of those 70
// blocks are real code, and a code block is what this feature was built for
// (w-…, 2026-08-05: workers hand her commands to paste). So the test is
// deliberately narrow and refusing is always the safe answer: when this module
// is unsure, it hands the text back exactly as it found it.
//
// THE TEST FOR A WRAPPED LINE, and it is the whole idea: a break is MECHANICAL
// when the line before it is nearly as long as the longest line in the block.
// That is what a wrap looks like and nothing else does.

/** A bullet or a numbered item never gets folded into the line above it. */
const BULLET = /^\s*([-*+•]|\d+[.)])\s/;

/**
 * The marks that say a line is code rather than a sentence. Sparse ones are
 * tolerated, because an email signature carries <name@host> and a sentence
 * carries a stray bracket; it is the DENSITY that tells the two apart.
 */
const CODEY = /[{}<>]|=>|&&|\|\||`|:\/\/|;\s*$|^\s*[$#>]\s|^\s*(const|let|var|function|class|def|import|export|return|if|for|while|echo|cd|npm|git|sudo)\b/;

/**
 * Two or more spaces inside a line: the tell of a COLUMN, which is the one
 * mistake this made when it was first driven against her store. Their newlines
 * are the rows, so folding them is the same damage this module exists to
 * prevent, just on a table instead of a command.
 */
const COLUMNAR = /\S {2,}\S/;

/** How much of a line has to be filled before its break counts as a wrap. */
const FULL = 0.8;

/** Below this the block is a narrow column, not wrapped prose. */
const MIN_WIDTH = 40;

/** Fraction of lines allowed to look like code before the block is left alone. */
const CODEY_SHARE = 0.2;

/** Indentation has to be the rule, not a table inside a letter, to give up. */
const INDENT_SHARE = 0.4;

/** Below this a block is a list of paths or urls, whose newlines are the list. */
const MIN_WORDS_PER_LINE = 4;

function filledLines(text: string): string[] {
  return text.split('\n').filter((l) => l.trim().length > 0);
}

/**
 * Is this block prose that someone hard wrapped?
 *
 * Exported because it is the whole judgement, and the test drives it against
 * real blocks out of her store rather than through the DOM.
 */
export function isWrappedProse(text: string): boolean {
  const filled = filledLines(text);
  if (filled.length < 2) return false;

  // Indentation is code's plainest tell, but it is not a whole-block one: her
  // letter to the accountant on is 51 lines of wrapped prose with an indented
  // cost table sitting in the middle of it, and 13 indented lines out of 51 had
  // this refusing the whole letter. So the block is only given up when
  // indentation is the RULE, and an indented line is never folded either way
  // (see `folds`), which leaves that table exactly as it was drawn.
  const indented = filled.filter((l) => /^[ \t]/.test(l)).length;
  if (indented / filled.length > INDENT_SHARE) return false;

  const codey = filled.filter((l) => CODEY.test(l)).length;
  if (codey / filled.length > CODEY_SHARE) return false;

  const columnar = filled.filter((l) => COLUMNAR.test(l)).length;
  if (columnar / filled.length > CODEY_SHARE) return false;

  // Sentences run long. A block of long but wordless lines is a list of paths or
  // urls, one per line, and those newlines are the list. Four is deliberately
  // low: such a list scores one or two, while a short note that is half greeting
  // and signature can score five and is still a letter.
  const words = filled.reduce((n, l) => n + l.trim().split(/\s+/).length, 0);
  if (words / filled.length < MIN_WORDS_PER_LINE) return false;

  const width = Math.max(...filled.map((l) => l.length));
  if (width < MIN_WIDTH) return false;

  // And there has to be at least one break that a wrap would explain, or there
  // is nothing here to undo.
  return foldPoints(text.split('\n'), width) > 0;
}

/** Would the break at the end of line `a` be explained by a wrap at `width`? */
function folds(a: string, b: string, width: number): boolean {
  if (!a.trim() || !b.trim()) return false;
  if (BULLET.test(b) || /^[ \t]/.test(b)) return false;
  if (BULLET.test(a) || /^[ \t]/.test(a)) return false;
  return a.length >= width * FULL;
}

function foldPoints(lines: string[], width: number): number {
  let n = 0;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (folds(lines[i], lines[i + 1], width)) n += 1;
  }
  return n;
}

/**
 * Give back the block with its wrapped lines rejoined, or exactly the text that
 * came in when it is not wrapped prose.
 *
 * Blank lines are left alone, so the paragraphs she can see stay the paragraphs
 * she gets. Only the breaks INSIDE a paragraph go, which are the ones she never
 * asked for.
 */
export function unwrapWrappedProse(text: string): string {
  if (!isWrappedProse(text)) return text;
  const filled = filledLines(text);
  const width = Math.max(...filled.map((l) => l.length));
  const lines = text.split('\n');

  const out: string[] = [];
  // The SOURCE line that ended the last row of `out`, not the row itself. Once a
  // paragraph has been joined the row is longer than any width, so measuring the
  // row would make every break after it look mechanical and would swallow a
  // short line that was meant to stand on its own.
  let previous: string | null = null;
  for (const line of lines) {
    if (previous !== null && out.length && folds(previous, line, width)) {
      const last = out[out.length - 1];
      out[out.length - 1] = `${last.replace(/\s+$/, '')} ${line.trim()}`;
    } else {
      out.push(line);
    }
    previous = line;
  }
  return out.join('\n');
}
