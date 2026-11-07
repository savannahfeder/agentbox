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

// `discard` and `keep` belong to ./discard-asks-first.ts, which borrows this
// strip for the one other question that has to stand in front of a press.
export type CloseAct = 'decide' | 'start' | 'drop' | 'ship' | 'close' | 'discard' | 'keep';
export interface CloseOption extends ParsedOption { act: CloseAct }
export interface CloseAsk { ask: string; options: CloseOption[] }

// The last numbered option rather than an esc row: a key drawn beside the
// numbers read as one more thing to work out.
export const KEEP_OPEN = 'Keep this thread open';

const WORDS = ['','one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const counted = (n: number) => WORDS[n] ?? String(n);

/** The question and its options for `waiting` tasks not yet started, or null
 *  when there are none and the close should simply go through. */
export function closeAsk(waiting: number): CloseAsk | null {
  if (waiting <= 0) return null;
  // Every option says who does what to which: "Approve it" read as the agent
  // approving, and "Drop it" said nothing about the task closing unstarted.
  if (waiting === 1) {
    return {
      ask: 'Before this thread closes, what happens to the task it filed?',
      options: [
        { n: 1, text: 'Start the task in a new thread, then close this one', recommended: true, act: 'start' },
        { n: 2, text: 'Close both without starting the task', recommended: false, act: 'drop' },
        { n: 3, text: KEEP_OPEN, recommended: false, act: 'keep' },
      ],
    };
  }
  const n = counted(waiting);
  // "both" for two, "all three" past that: the way it would be said.
  const them = waiting === 2 ? 'both' : `all ${n}`;
  return {
    ask: `Before this thread closes, what happens to the ${n} tasks it filed?`,
    options: [
      { n: 1, text: `Start ${them} in new threads, then close this one`, recommended: false, act: 'start' },
      { n: 2, text: `Close this thread and ${them} tasks without starting them`, recommended: false, act: 'drop' },
      // Several proposals are several decisions (ThreadsMade.tsx), made on
      // their own rows right above.
      { n: 3, text: 'Keep this thread open and decide each one', recommended: true, act: 'decide' },
    ],
  };
}

/** For a thread whose work never reached main (shared/not-shipped.mts). */
export function unshippedAsk(): CloseAsk {
  return {
    ask: "This thread's work never reached main.",
    options: [
      { n: 1, text: 'Have the agent ship it', recommended: true, act: 'ship' },
      { n: 2, text: 'Close it anyway', recommended: false, act: 'close' },
      { n: 3, text: KEEP_OPEN, recommended: false, act: 'keep' },
    ],
  };
}

/** The keys the question answers with while it is up. Every other key keeps
 *  its usual meaning: the question can be off screen, and a key that silently
 *  does nothing gives no hint that it is there. */
export function closeAskOwnsKey(key: string): boolean {
  return key === 'Escape' || key === 'Enter' || key === 'ArrowUp' || key === 'ArrowDown' || /^[1-9]$/.test(key);
}
