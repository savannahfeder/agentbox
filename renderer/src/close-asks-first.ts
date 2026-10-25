// PURE. WHAT A CLOSE ASKS WHEN THE THREAD STILL HAS TASKS WAITING ON YOU
// (w-d2744c6daa).
//
// "I feel like I often miss these filed tasks from this thread that need my
// review." Measured on the real store, 2026-10-07: one had waited 22 hours under
// a thread already closed. Its answer offered one option, "Close this task", and
// nothing stood between that press and the task it skipped.
//
// So a close on such a thread asks this instead, in the options strip, in the
// words chosen off the drawings. App.tsx `markDone` decides when to ask and
// `answerCloseAsk` does what the answer says; this is only the words.
import type { ParsedOption } from './format';

export type CloseAct = 'decide' | 'start' | 'drop' | 'ship' | 'close';
export interface CloseOption extends ParsedOption { act: CloseAct }
export interface CloseAsk { ask: string; options: CloseOption[] }

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const counted = (n: number) => WORDS[n] ?? String(n);

/** The question and its options for `waiting` tasks not yet started, or null
 *  when there are none and the close should simply go through. */
export function closeAsk(waiting: number): CloseAsk | null {
  if (waiting <= 0) return null;
  if (waiting === 1) {
    return {
      ask: 'Before this closes: one task it filed has not started.',
      options: [
        { n: 1, text: 'Approve it, then close', recommended: true, act: 'start' },
        { n: 2, text: 'Drop it, then close', recommended: false, act: 'drop' },
      ],
    };
  }
  // "both" for two, "all three" past that: the way it would be said.
  const them = waiting === 2 ? 'both' : `all ${counted(waiting)}`;
  return {
    ask: `Before this closes: ${counted(waiting)} tasks it filed have not started.`,
    options: [
      // DECIDING EACH ONE COMES FIRST. Three proposals are three decisions
      // (ThreadsMade.tsx); the rows below are there because the drawing that
      // was chosen carried them.
      { n: 1, text: 'Decide each one', recommended: true, act: 'decide' },
      { n: 2, text: `Start ${them}, then close`, recommended: false, act: 'start' },
      { n: 3, text: `Drop ${them}, then close`, recommended: false, act: 'drop' },
    ],
  };
}

/** For a thread whose work never reached main (shared/not-shipped.mjs). */
export function unshippedAsk(): CloseAsk {
  return {
    ask: "This thread's work never reached main.",
    options: [
      { n: 1, text: 'Have the agent ship it', recommended: true, act: 'ship' },
      { n: 2, text: 'Close it anyway', recommended: false, act: 'close' },
    ],
  };
}

/** The row under the options that keeps the thread open, keyed esc. */
export const KEEP_OPEN = 'Keep this thread open';

/** The keys the question answers with while it is up. Every other key keeps
 *  its usual meaning: the question can be off screen, and a key that silently
 *  does nothing gives no hint that it is there. */
export function closeAskOwnsKey(key: string): boolean {
  return key === 'Escape' || key === 'Enter' || key === 'ArrowUp' || key === 'ArrowDown' || /^[1-9]$/.test(key);
}
