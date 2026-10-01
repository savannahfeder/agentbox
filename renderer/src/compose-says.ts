// THE TWO SENTENCES THE NEW TASK CARD OWES HER.
//
// Both come out of a tester's onboarding, the first non-technical person to be
// walked through Agentbox, and both are about the same seam: the user's words went into
// the card and the card said nothing back.
//
// 1. WHY IT WILL NOT TAKE THIS. She sent a task into the practice project and
// it was accepted, filed, and never run. Nobody misbehaved. The supervisor skips
// practice projects in four separate places on purpose (main/supervisor.mjs): a
// practice project is not a project anybody works in, it points at no folder,
// and starting a real session in it is the thing that must never happen. The
// defect is that the CARD did not know that, so it took the task, filed it, and
// left her watching a row that would never move. The status flapping she then
// reported is the same fault seen from the other end: there was never a run
// behind it.
//
//    THE FIX IS A REFUSAL, NOT A RUN. Making practice projects runnable is the
//    one repair that is not allowed here. So the card says no, in a sentence,
//    before she presses anything — which is also the cheaper half, because
//    the system swallowing something the user typed is the failure this codebase
//    keeps paying for (CLAUDE.md).
//
// 2. WHERE THE ONE IT TOOK WENT.
//
// They live here rather than inside Compose.tsx for the reason
// `belongsInInbox` lives in list-rules.ts: what a card does NOT say has no
// symptom, so the rule has to be testable without rendering anything. And
// because copy is part of the design (a project rule, CLAUDE.md), the words are
// constants that a test can hold to, not string literals scattered through a
// component.

/**
 * As much of a project as either sentence needs. The practice mark is written
 *  by main/store.mjs off `project.json` (PRACTICE_FLAG) rather than matched on
 *  a name, because "Practice" is a name somebody could reasonably give a real
 *  project of their own, and a refusal aimed at real work is worse than the
 *  bug it fixes. */
export interface ComposeTarget {
  name: string;
  practice?: boolean;
}

/**
 * THE REFUSAL, in plain English, with the way out in it.
 *
 * Kept to two short sentences: the first is the fact she could not have known
 * (nothing here ever runs), the second is what to do instead. A dense screen is
 * a failed screen, and a refusal nobody finishes reading is a refusal that did
 * not happen.
 */
export const PRACTICE_REFUSAL =
  'Nothing runs in Practice, it is only somewhere to try things out. '
  + 'Pick one of your own projects and this will start.';

/**
 * Whether the card must refuse, and what it says when it does. Null is the
 * ordinary case, which is every task into a real project.
 *
 * `scripted` IS THE ONE EXEMPTION AND IT IS NOT A LOOPHOLE. The first run's own
 * example task really is sent into the practice project, and it really is
 * answered a couple of seconds later — by the app itself, out of a pre-written
 * line (main/store.mjs finishFirstRunTask, shared/first-run-practice.mjs), with
 * no session behind it. That task is the only one in the practice project with
 * something waiting to answer it, and the card can tell it apart with no
 * guessing: it is the one the walk typed in itself, so it is the one arriving
 * with a `prefill`. Anything she writes herself in there has nobody to pick it
 * up, and that is exactly what a tester hit.
 */
export function practiceRefusal(
  product: ComposeTarget | null | undefined,
  opts: { scripted?: boolean } = {},
): string | null {
  if (!product?.practice) return null;
  if (opts.scripted) return null;
  return PRACTICE_REFUSAL;
}

/**
 * THE CONFIRMATION, one line, NAMING THE PROJECT IT WENT TO.
 *
 * It replaced "Queued → Kestrel · Z to undo". Two things were wrong with that
 * for the person it is written for. "Queued" is a word about our machinery, and
 * the arrow is punctuation standing in for a verb; neither says the plain thing
 * she was looking for, which is that her task is somewhere now. The project's
 * own name is the load-bearing half: the whole of a tester's confusion was not
 * being able to tell where the typed task had gone.
 *
 * `when` is whatever the card's clock says when she asked for a later start,
 * and it rides in the middle rather than replacing the "Sent to" half: a task
 * she scheduled has still been sent, and the sentence that dropped the word
 * made "Queued" read as a lie about a task that had not started, and scheduled
 * asks looked as if they had gone quiet.
 *
 * THE UNDO IS SAID OUT LOUD, unchanged, because a way back she cannot see is
 * one she will not take.
 */
export function sentLine(p: { to: string; when?: string | null }): string {
  // "Started in", because "Sent to Office admin" read as a message to a person.
  const where = p.when ? `Scheduled in ${p.to}` : `Started in ${p.to}`;
  return `${p.when ? `${where} · ${p.when}` : where} · Z to undo`;
}
