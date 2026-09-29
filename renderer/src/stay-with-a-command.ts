// PURE. SHE STAYS ON THE TASK SHE RAN A COMMAND FROM, AND THE WAY OUT OF IT IS
// HER INBOX.
//
// TWO RULES, AND THEY ARE ONE THING. Sending a command is the only send whose
// whole point is what comes BACK, so it is the only send that does not put her
// back in the list: the row goes to In progress under her and she watches it
// answer. Every other reply hands the work to somebody else and advances her to
// the next task, which is `advance.ts` and is not touched here.
//
// AND THE ROW SHE WATCHED IS IN HER INBOX BY THE TIME SHE LEAVES IT. A command
// run comes back `blocked` carrying its answer, which is an inbox row. Leaving
// her on In progress, which is the tab she opened it from, would show her a list
// the row is no longer in. That is the exception she names.

import { commandPrompt } from '../../shared/claude-commands.mjs';
import { DEFAULT_ENGINE } from '../../shared/engines.mjs';

/**
 * The row she is watching a command run on. Product and id, because two
 *  products can hold the same id and the pane only ever shows one of them. */
export type Followed = { product: string; id: string } | null;

/**
 * DOES THIS SEND KEEP HER ON THE TASK.
 *
 * Only one of Claude Code's eight commands does, which is the same test the
 * supervisor uses to decide the run skips the brief (`commandPrompt`): if the
 * CLI is going to answer her in a few seconds, she should be looking at the row
 * when it does.
 *
 * An agent row is never one of these. Its reply goes into a session over a
 * socket, there is no ledger row to come back, and `replyToAgent` owns where
 * that leaves her.
 *
 * AND A CODEX ROW IS NEVER ONE OF THESE EITHER, which is the half that was
 * missing. `commandPrompt` alone is not the supervisor's test and never was: it
 * guards the same call with the engine, in both of the two places it makes it
 * (`continuation && engine === DEFAULT_ENGINE ? commandPrompt(item.answer):
 * null`, and the same clause on the queue). Codex knows none of the eight, so
 * the words stay in her prompt, the brief rides with them, and an ordinary turn
 * runs — minutes of work, not the four seconds this rule is paid for. The
 * reply-box menu does not offer them on a Codex row
 * (renderer/src/slash-menu.ts) and this is the half that holds when she types
 * one by hand, which is exactly the division main already makes.
 *
 * What it cost while it was missing: `following` was set, so Escape and the back
 * arrow both left her in her INBOX rather than on the In progress list she was
 * working through, waiting for a table that was never coming.
 *
 * `engine` IS THE WORD THE PANE WAS HANDED, not one derived here: `byItem[id] ??
 * workspace` off the snapshot, which is what the supervisor will spawn on.
 * Absent means Claude Code, because that is what every Mac with one coding agent
 * answers and what every payload written before `engines` existed carries.
 */
export function staysOnTheTask(
  item: { agent?: unknown } | null,
  text: string,
  engine?: string | null,
): boolean {
  if (!item || item.agent) return false;
  if ((engine ?? DEFAULT_ENGINE) !== DEFAULT_ENGINE) return false;
  return commandPrompt(text) !== null;
}

/**
 * IS SHE STILL ON THE ROW SHE RAN IT FROM.
 *
 * Written against the state rather than against each way out of a task, for the
 * same reason `heldByUrgent` is: Escape, the back arrow, clicking away and the
 * palette are four routes and fixing the ones you can find is how the fifth gets
 * missed. `null` focused means she has left, and then `wayOut` answers where to.
 *
 * A DIFFERENT ROW ENDS IT. An urgent row can take the pane over her head while
 * a command is running; from there the inbox is no longer a promise this rule
 * can keep, so it stops making it.
 */
export function stillFollowing(following: Followed, focused: { product: string; id: string } | null): Followed {
  if (!following) return null;
  if (!focused) return following;
  return focused.product === following.product && focused.id === following.id ? following : null;
}

/**
 * Where closing the task leaves her: her inbox when she was watching a command
 *  on it, and wherever she already was for every other task. */
export function wayOut(following: Followed, focused: unknown): 'inbox' | 'stay' {
  return !focused && following ? 'inbox' : 'stay';
}

/**
 * THE NEWEST COPY OF THE ROW SHE HAS OPEN, WHEN THE ROW HAS MOVED UNDER HER.
 *
 * WHY THIS IS NO LONGER ONLY FOR A COMMAND. The pane holds the copy of the item
 * she opened, and until this it only ever took a fresher one while she was
 * FOLLOWING a command. So an agent finishing a row she was sitting on wrote its
 * answer into a store she could not see: the list behind her had it, the main
 * process had it, and the open pane went on drawing the row as it stood when
 * she opened it, for as long as she stayed there.
 *
 * MEASURED in the real app before this changed: a result appended to the ledger
 * reached the main process within 5 seconds and the open pane had not changed
 * one character 25 seconds later.
 *
 * `updatedAt` IS THE GATE, and it is what keeps the old caution true. Every
 * snapshot hands back new objects, so `fresh !== focused` on its own is true on
 * every ten second poll whether anything happened or not, and swapping the item
 * on every poll is the "pane that redraws itself under someone reading it" this
 * rule was scoped narrowly to avoid. The moment stamped on the row is the honest
 * test of whether there is anything new to draw.
 *
 * A FOLLOWED ROW STILL TAKES EVERY COPY, unchanged. That case is watching a
 * command answer in four seconds and has never needed a reason to redraw.
 *
 * Returns the copy to take, or null for leave it alone.
 */
export function freshCopy<T extends { id: string; product: string; updatedAt?: number }>(
  items: readonly T[],
  focused: T | null,
  following: Followed,
): T | null {
  if (!focused) return null;
  const fresh = items.find((i) => i.id === focused.id && i.product === focused.product);
  if (!fresh || fresh === focused) return null;
  if (following) return fresh;
  return (fresh.updatedAt ?? 0) !== (focused.updatedAt ?? 0) ? fresh : null;
}
