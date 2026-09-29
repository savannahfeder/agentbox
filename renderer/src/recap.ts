// PURE. What the top of the reading pane says, above the message itself.
//
// Three different things used to compete for that space wearing the same grey
// box: the parent row's agent message, the parent row's answer, and HER OWN
// reply on this row. Read top to bottom the pane showed the agent at 27m, her
// at 2m, then the agent again at 17m, so her newest words sat above a message
// written before them, and a row she had already dealt with looked exactly like
// a fresh ask.
//
// Two rules, and the second is the one that saves the 45 seconds:
//
//   HER MOST RECENT WORDS, ONCE.  The user's last message in this thread is the
//   only context worth the top of the screen. Everything else about the parent
//   collapses to one clickable line, because the message below restates it
//   anyway (which the old Origin's own comment already said).
//
//   A REPLY ON THIS ROW IS STATE, NOT CONTEXT.  If she has already answered
//   this row, nothing is being asked of her. Quoting the user's reply back as a
//   context block is what made a settled row read as live. It becomes one line
//   that says she is done here, and the words are one click away.

import type { WorkItem } from './types';

/* * `said` IS DATA FOR THE THREAD NOW, AND NEVER A BOX.

   The shape survives because `openingSaid` in Focus.tsx uses it to put the
   user's words at the TOP OF THE THREAD as its first message, which is where a
   conversation's opening line belongs (w-23db941885). What is gone is the
   other use: the block above an agent's message headed "You said", reading
   her own last answer, or a whole directive body, back at her. `Recap` no longer draws that for any shape, so
   nothing built here reaches her as a quotation.
*/
export type Recap =
  // She has answered THIS row. The pane's headline is that she is finished
  // with it, not the text of her reply.
  | { kind: 'replied'; text: string; at: number }
  // Her last words in the thread, said on the row before this one. FOR THE
  // THREAD'S FIRST MESSAGE ONLY. The box above the message never prints these.
  | { kind: 'said'; text: string; at: number; on: string }
  // She has never spoken here. Name what this answers, in one line.
  | { kind: 'origin'; title: string; at: number }
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

export function recapFor(item: WorkItem, parent: WorkItem | null): Recap {
  const mine = words(item.answer);
  if (mine) return { kind: 'replied', text: mine, at: when(item, 'answer') };
  if (!parent) return null;

  const onParent = words(parent.answer);
  if (onParent) {
    return { kind: 'said', text: onParent, at: when(parent, 'answer'), on: parent.title };
  }

  // A directive is a row she composed, so its body is the user's words even though no
  // answer was ever typed on it.
  if (parent.kind === 'directive') {
    const composed = words(parent.body) ?? parent.title;
    return { kind: 'said', text: composed, at: parent.createdAt, on: parent.title };
  }

  return { kind: 'origin', title: parent.title, at: parent.updatedAt };
}
