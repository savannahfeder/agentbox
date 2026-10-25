// PURE. Which words open the thread on a row that was filed from another one.
//
// Three different things used to compete for the space above the message,
// wearing the same grey box: the parent row's agent message, the parent row's
// answer, and the user's own reply on this row. Read top to bottom the pane
// showed the agent at 27m, her at 2m, then the agent again at 17m, so her
// newest words sat above a message written before them, and a row she had
// already dealt with looked exactly like a fresh ask.
//
// Nothing is drawn there now. What survives is the one piece that was never
// context about the row but the conversation's own first line: the words she
// wrote on the parent that asked for this thread. Focus.tsx hands them to the
// thread as its opening message.

import type { WorkItem } from './types';
import type { LedgerLine } from './thread-history';

/* `said` IS DATA FOR THE THREAD, AND NEVER A BOX. `openingSaid` in Focus.tsx
   puts these words at the TOP OF THE THREAD as its first message, which is
   where a conversation's opening line belongs (w-23db941885). Nothing built
   here reaches her as a quotation above the message. */
export type Recap =
  // Her last words in the thread, said on the row before this one. FOR THE
  // THREAD'S FIRST MESSAGE ONLY. Nothing is drawn above the message.
  | { kind: 'said'; text: string; at: number; on: string }
  | null;

// '(withdrawn)' is the tombstone an undone send leaves behind. It is not words.
function words(text?: string): string | null {
  const clean = text?.trim();
  return clean && clean !== '(withdrawn)' ? clean : null;
}

function when(item: WorkItem, field: string): number {
  return item.wrote?.[field]?.ts ?? item.updatedAt;
}

// Who ended this row. One word, two opposite events, and the fold has always
// known which is which: her close is FILING, and an agent's close on a thread
// she has spoken on is NEWS SHE HAS NOT RECEIVED, which is the only reason such
// a row is in her inbox at all (see belongsInInbox in list-rules.ts).
export function closedBy(item: WorkItem): 'founder' | 'agent' | null {
  if (item.status !== 'done') return null;
  return item.wrote?.status?.source === 'founder' ? 'founder' : 'agent';
}

// A CLOSED ROW'S RESULT IS THE MESSAGE. Its body is the ask, written before the
// answer that settled it, and a worker that closes something is under no
// obligation to have rewritten it.
//
// is the case: the agent wrote `status: done` and a result saying "closed, the
// thing this was blocked on came back as a no, there is nothing here left to
// build or merge", and never touched the title or the body. So the row still
// opened "Merging is the only thing left", still recommended merging, still
// offered three options to pick, and the truth sat in an appendix under all of
// it.).
//
// The stale title is the worker's to fix and briefs/worker.md now says so. What
// the pane can do is stop leading with a recommendation that has been withdrawn.
export function resultLeads(item: WorkItem): boolean {
  return closedBy(item) === 'agent' && !!item.result?.trim();
}

// THE ASK IS THE OLDEST THING ON THE ROW, AND IT LED THE PANE.
//
// It led because it used to be the only thing there. On a directive the user
// wrote herself it costs the whole screen: 1,500 words of her own text above
// the one line saying where the work actually is.
//
// So the newest thing leads. Where the ask went is now ONE place, the thread
// history behind the time (renderer/src/thread-history.ts): there is one way
// to look back under a task's title, not two. The four-field
// conversation this file used to assemble for a second toggle is gone with it,
// and it was always the poorer of the two — the fold keeps only the latest
// value per field, so it could never show the reply before the last one, the
// pickups, or the renames. The ledger has all of them.

// The newest thing an agent said, which is what the pane leads with. A result
// outranks a checkpoint: the result is the finished word, a checkpoint is
// progress toward one.
export function leadField(item: WorkItem): 'result' | 'note' | null {
  if (words(item.result)) return 'result';
  if (words(item.note)) return 'note';
  return null;
}

// THE LAST THING SHE SAID ON A ROW AT OR BEFORE A MOMENT, read from its ledger
// lines. A send she took back writes '(withdrawn)' over it, so that line takes
// the reply it withdrew off the pile rather than being a reply itself.
export function askedBefore(lines: readonly LedgerLine[], moment: number): { text: string; at: number } | null {
  const pile: { text: string; at: number }[] = [];
  for (const line of lines) {
    if (line.ts > moment) continue;
    const answer = line.patch?.answer;
    if (typeof answer !== 'string') continue;
    if (answer.trim() === '(withdrawn)') { pile.pop(); continue; }
    const text = words(answer);
    if (text) pile.push({ text, at: line.ts });
  }
  return pile[pile.length - 1] ?? null;
}

// A THREAD FILED FROM ANOTHER OPENS WITH THE MESSAGE THAT ASKED FOR IT. That is
// the parent's reply at or before this row was filed, not its newest one: the
// fold keeps only the newest, so every later reply on the parent used to
// replace this thread's opening line with something written after it existed
// (tests/a-filed-thread-opens-with-the-message-that-asked-for-it). When the
// parent's newest reply is later than this row, only `parentLines` can say what
// came before it, and until they are read this says nothing rather than
// something wrong.
export function recapFor(item: WorkItem, parent: WorkItem | null, parentLines?: readonly LedgerLine[]): Recap {
  // A ROW SHE HAS ANSWERED OPENS ON NOTHING. Nothing is being asked of her
  // here, so the parent's ask is no longer the thread's first line.
  if (words(item.answer)) return null;
  if (!parent) return null;

  const onParent = words(parent.answer);
  const repliedAt = parent.wrote?.answer?.ts;
  const afterThis = onParent != null && Number.isFinite(repliedAt) && Number.isFinite(item.createdAt) && (repliedAt as number) > item.createdAt;
  if (onParent && !afterThis) {
    return { kind: 'said', text: onParent, at: when(parent, 'answer'), on: parent.title };
  }
  if (afterThis) {
    if (!parentLines) return null;
    const asked = askedBefore(parentLines, item.createdAt);
    if (asked) return { kind: 'said', text: asked.text, at: asked.at, on: parent.title };
  }

  // A directive is a row she composed, so its body is the user's words even though no
  // answer was ever typed on it.
  if (parent.kind === 'directive') {
    const composed = words(parent.body) ?? parent.title;
    return { kind: 'said', text: composed, at: parent.createdAt, on: parent.title };
  }

  // An agent parent she never answered has no words of hers to open with. The
  // title used to be drawn above the message in its place, and is now only in
  // the breadcrumb (tests/nothing-is-quoted-above-the-message).
  return null;
}
