// A THREAD WHOSE WORK NEVER REACHED MAIN, read off the app's own notes.
//
// The ship queue and the cloud run write these words (main/ship-queue.mjs
// `failureNote`, main/cloud/run.mjs `park`), so the reader here cannot drift
// from the writers. The agent's last message was written before either, and
// usually says the work is shipping, so these notes are what has to be shown.

import { isShippedNote } from './shipped-note.mjs';

export const SHIP_FAILED = 'It did not ship, and it went back to its agent: ';
export const KEPT_ASIDE = "This thread's cloud run finished, but its work was not laid into the task folder: ";
// The sweep's note when it reopens a thread that was closed without being asked.
export const CLOSED_UNSHIPPED = 'This thread was closed before its work reached main, so it is back. ';
// Written when the person was asked and closed it anyway; ends the matter.
export const CLOSED_ANYWAY = 'Closed without its work reaching main.';

const at = (item, field) => item?.wrote?.[field]?.ts ?? 0;

/**
 * `{ why, branch, reopened }` while the latest note says the work did not
 * reach main and the agent has not spoken since, else null.
 */
export function notShipped(item) {
  const note = typeof item?.note === 'string' ? item.note : '';
  if (!note || at(item, 'result') > at(item, 'note')) return null;
  let text = note;
  const reopened = text.startsWith(CLOSED_UNSHIPPED);
  if (reopened) text = text.slice(CLOSED_UNSHIPPED.length);
  if (text.startsWith(SHIP_FAILED)) {
    return { why: text.slice(SHIP_FAILED.length).trim(), branch: null, reopened };
  }
  if (text.startsWith(KEPT_ASIDE)) {
    const branch = /on the branch (\S+?)\.(?:\s|$)/.exec(text)?.[1] ?? null;
    return { why: branch ? `the cloud run's work is set aside on ${branch}` : "the cloud run's work is set aside", branch, reopened };
  }
  return null;
}

/**
 * `{ sha }` while the app's own latest note says it shipped the work and
 * nobody has written on the thread since. An agent saying it shipped does
 * not count: only the app ships.
 */
export function shippedAs(item) {
  if (!isShippedNote(item?.note) || item?.wrote?.note?.source !== 'system') return null;
  if (at(item, 'result') > at(item, 'note') || at(item, 'answer') > at(item, 'note')) return null;
  return { sha: / as ([0-9a-f]{7,40})\./.exec(item.note)?.[1] ?? null };
}

/** A closed thread whose close was told its work never reached main. */
export function closedUnshipped(item) {
  return item?.status === 'done' && typeof item?.note === 'string' && item.note.startsWith(CLOSED_ANYWAY);
}

/** The row's line: "Not shipped. <why>". */
export function notShippedLine(item) {
  const ns = notShipped(item);
  return ns ? `Not shipped. ${ns.why.charAt(0).toUpperCase()}${ns.why.slice(1)}` : null;
}

/** What the agent is asked when the person picks "have the agent ship it". */
export function shipItAsk(item) {
  const ns = notShipped(item);
  if (!ns) return null;
  return ns.branch
    ? `Bring the work on ${ns.branch} into this folder, check it against current main, then ship it.`
    : 'Fix what stopped the ship, then ship it.';
}

/** The note a close writes once the person has been asked and said close. */
export function closedAnywayNote(item) {
  const ns = notShipped(item);
  if (!ns) return null;
  return ns.branch ? `${CLOSED_ANYWAY} It is still on ${ns.branch}.` : CLOSED_ANYWAY;
}

/** `{ ok: false, error }` for a close nobody was asked about, else null. */
export function closeRefusal(item, { closeUnshipped = false } = {}) {
  if (closeUnshipped) return null;
  const line = notShippedLine(item);
  return line ? { ok: false, error: `${line}. Reply to have it shipped, or close it on your computer.` } : null;
}

/** Done, with work that never reached main, and never asked about. */
export function closedBeforeItShipped(item) {
  if (item?.status !== 'done') return false;
  const ns = notShipped(item);
  return !!ns && !ns.reopened;
}
