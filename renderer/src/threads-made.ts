// PURE. The threads a thread made, and the words for where each one stands
// (w-2e8aa16f0f). Drawn by components/ThreadsMade.tsx under an opened task,
// and meant for the agent that answers in a chat with the tasks it opened.
import type { ThreadStateWord, WorkItem } from './types';
import { notStarted } from './list-rules';

type Row = Pick<WorkItem, 'id' | 'product' | 'createdAt'> & { parent?: string };

/** Every thread filed straight under this one, in its own project, oldest
 *  first. Finished ones stay: "done" is part of the answer to what it made. */
export function threadsMade<T extends Row>(items: readonly T[], thread: Pick<WorkItem, 'id' | 'product'>): T[] {
  return items
    .filter((i) => i.parent === thread.id && i.product === thread.product)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

// The list's own tab names, so a row says what the tab it sits in says.
const WORDS: Record<ThreadStateWord, string> = { waiting: 'Needs you', running: 'In progress', scheduled: 'Later', done: 'Done' };

export const stateWord = (state: ThreadStateWord | null | undefined): string => (state ? WORDS[state] : '');

/**
 * WHICH OF THEM IS WAITING ON A PRESS FROM YOU (w-9cf2b43110): "when an agent
 * files another agent i don't love that it ends up in my inbox with no clear
 * next step... better for it to file those and have an approval button in that
 * component."
 *
 * The same shape `resolve` in App.tsx already calls a proposal, stated here so
 * the list and the press cannot disagree about what a press would mean. A
 * thread an agent filed is a proposal: nothing runs on it until it is approved,
 * and approving writes the answer that starts it.
 *
 * FOUR KINDS OF ROW DELIBERATELY CARRY NO BUTTON, and each for its own reason:
 *
 *   a question or a review, because approving one means choosing between
 *   options that are only legible on the row itself. A one-click Approve in a
 *   list would be the E-key fault again (resolve's own comment): a press that
 *   silently picked the recommendation for her.
 *
 *   a thread she wrote herself (`founder`), which is not a proposal and needs
 *   nobody's approval; it is already queued.
 *
 *   one already answered, which is running or about to be, so there is nothing
 *   left to say go to. A WITHDRAWN approval is not an answer and comes back.
 *
 *   one written down and deliberately not begun. Approving it would write an
 *   answer and change nothing visible, because `notStarted` is what holds a
 *   worker off and it is read before anything else (list-rules.ts).
 *
 * AND THE TAB IT IS IN HAS THE LAST WORD, which the ledger alone does not.
 * Measured by pressing one in the built app: the word went to In progress and
 * the button stayed, because approving holds its write for the undo window and
 * the row's `answer` is still empty for those few seconds. The row IS already
 * moving — `pendingId` takes it out of the inbox and the In progress list
 * claims it that instant — so the button offering to start it again was the
 * list contradicting its own state word, on the one row you were looking at.
 * Reading the state the tabs computed settles it: anything that is not sitting
 * in Needs you is not waiting on a press, whatever its fields say yet.
 */
export function approvableFiled(
  i: Pick<WorkItem, 'status' | 'kind' | 'labels' | 'answer'> & { start?: 'later' | 'now' },
  state: ThreadStateWord | null,
): boolean {
  if (state !== 'waiting') return false;
  if (i.status !== 'open') return false;
  if (i.kind === 'question' || i.kind === 'review') return false;
  if ((i.labels ?? []).includes('founder')) return false;
  if (notStarted(i)) return false;
  return !(i.answer && i.answer !== '(withdrawn)');
}
