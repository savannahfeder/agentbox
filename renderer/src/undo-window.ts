// PURE. WHAT A Z MEANS, AND IT DEPENDS ENTIRELY ON HOW OLD THE THING IS.
//
// A ROW CLOSED AT 1:18PM CAME BACK AT 1:21PM, written to the ledger as the
// user (w-da37b95d1a): a task marked done stayed in the inbox and showed as
// moved a minute ago. That was a bug. Nothing else touched the row between
// those two times, and the whole app has exactly one path that writes a bare
// `status: open` as the user minutes after a close: the undo entry the close
// itself had pushed, popped by a later Z.
//
// WHAT WAS ACTUALLY WRONG, and it is not the key and it was never the clock.
// `undoStack` grew and never aged, and Z acted on its top SILENTLY. The close is
// announced for two and a half seconds and then nothing on the screen says
// anything about Z again, so a single letter typed minutes later, into a window
// where the caret had left the reply box, quietly reopened the last row she
// closed. The same stale pop can withdraw her last approval or cancel her last
// schedule.
//
// THE FIRST FIX WAS A DEADLINE AND IT WAS THE WRONG SHAPE. A minute, then thirty
// seconds, and thirty seconds turned out to be too short in use. The answer
// is not another number, and it is better than any number, because the danger was
// never that the undo was old. It was that it was invisible.
//
// SO THERE ARE TWO TIERS AND ONLY THE FIRST ONE IS SILENT.
//
//   Inside thirty seconds   Z acts at once, exactly as it always has. This is
//                           the reflex press, and it is nearly all of them:
//                           measured on a real store, over nine in ten undos
//                           inside a minute landed inside sixteen seconds.
//   After that, for ever    Z ASKS. It names what it would undo and how long ago
//                           it was, and a second Z inside a few seconds does it.
//                           Any other key answers no.
//
// So a row closed this morning is still undoable this afternoon, and a letter
// that misses the reply box costs a toast instead of a decision. There is deliberately no outer limit now: an undo that
// has to be confirmed by name cannot happen by accident, so an expiry would only
// take something away from her for nothing.
export const UNDO_STRAIGHT_AWAY_MS = 30_000;

/**
 * HOW LONG THE QUESTION STANDS. Long enough to read a toast and answer it,
 * short enough that a Z now and a Z in ten minutes are two separate questions
 * rather than one accidental yes.
 */
export const UNDO_ASK_STANDS_MS = 8_000;

/** Just enough of an entry to age it. */
export type Aged = { at: number };

export type NextUndo<T> = {
  /** The entry Z is about, or null when there is nothing to undo. */
  take: T | null;
  /** The stack to keep if it runs. */
  rest: T[];
  /** True when it is recent enough to just do, false when it has to ask first. */
  instant: boolean;
};

/**
 * What Z is pointed at, and whether it may act without asking.
 *
 * Only ever the top of the stack. Entries are pushed in the order they happened,
 * so the newest is the only one she could mean, and the ones under it are
 * reached by pressing Z again once this one is gone.
 */
export function nextUndo<T extends Aged>(stack: readonly T[], now: number): NextUndo<T> {
  const top = stack[stack.length - 1];
  if (!top) return { take: null, rest: [], instant: false };
  return { take: top, rest: stack.slice(0, -1), instant: now - top.at <= UNDO_STRAIGHT_AWAY_MS };
}

/** Is the question she was just asked still the one on the screen? */
export function askStillStands(askedAt: number, now: number): boolean {
  return now - askedAt <= UNDO_ASK_STANDS_MS;
}

/**
 * THE QUESTION. ONE SENTENCE, ONE VERB, NO COLONS.
 *
 * It took three goes to get here. The second one was hard to understand: the
 * toast had multiple sentences and even multiple levels of colons.
 *
 * It read like this:
 *
 *     Press Z again and this happens: Reopened: The reply box says which mode
 *     it is in. That was 41s ago.
 *
 * TWO COLONS AND THREE CLAUSES, and the cause was reuse. Every entry on the
 * pile carries a `label`, which is the line said AFTERWARDS, once the undo has
 * happened ("Reopened: the reply box row"). Dropping a finished announcement
 * into the middle of a question gives you a sentence with two subjects and the
 * app's own punctuation inside it.
 *
 * So an entry now carries `undoes` as well: the plain verb phrase that finishes
 * "press Z again to ___", written where the entry is made, by the code that
 * knows what it did. The age came out with the colons. It was true and it was
 * the third clause of a sentence nobody reads that far into.
 */
export function undoAsk(undoes: string): string {
  return `Press Z again to ${undoes}.`;
}

/** And what a Z says when there is nothing on the pile at all. */
export const NOTHING_TO_UNDO = 'Nothing to undo yet.';

/**
 * THE KEYS THAT ARE NOT AN ANSWER. Every other key means no to the question
 * above, but a modifier on its own is not a key she pressed, it is one she is
 * holding on the way to pressing the Z. Without this, shift-Z would cancel the
 * question with the shift and then re-ask it with the Z, for ever.
 */
export const HOLDS_A_KEY = new Set(['Shift', 'Meta', 'Control', 'Alt', 'CapsLock']);
