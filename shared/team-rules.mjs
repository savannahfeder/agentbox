// THE TEAM'S RULES ABOUT ROWS, IN ONE PLACE. Pure and browser-safe: the
// supervisor asks them before it runs anything, and the window asks them
// before it puts a row in somebody's inbox, so the two can never disagree about
// whose a row is.
//
// A project is shared when its record carries a team id (main/team/projects.mjs).
// Everything here leaves a private project exactly as it always was.
import { pickFields } from './work-items.mjs';

export const isShared = (product) => !!product?.team?.projectId;

// THE PERSON WHOSE MAC RUNS AGENTS ON A ROW: whoever it was handed to, else
// whoever started it, else (a row from before anyone signed in) whoever shared
// the project.
export function runnerOf(item, product) {
  return item?.runner || item?.createdBy || product?.team?.sharedBy || null;
}

// A row a person has been given waits for that person, not for an agent.
export const heldByAPerson = (item) => !!item?.assignee && item.assignee !== 'agent';

// May a worker run on this row on this Mac, signed in as `me`?
export function mayRunHere(item, product, me) {
  if (!isShared(product)) return true;
  if (!me) return false;
  // A MESSAGE BETWEEN TWO PEOPLE NEVER RUNS AN AGENT, on either Mac. Turning
  // one into work is "Hand it to an agent", which starts a new thread of your
  // own; nothing a teammate writes into the shared record can start one here.
  if (product?.team?.direct) return false;
  if (heldByAPerson(item)) return false;
  // ONLY YOU PUT YOUR MAC IN CHARGE OF A ROW. A runner naming you that somebody
  // else's line wrote is a teammate trying to start an agent on your Mac with
  // their words, so it does not count.
  const runnerBy = item?.wrote?.runner?.by;
  if (item?.runner === me && runnerBy && runnerBy !== me) return false;
  // NOR DOES A TEAMMATE'S WORD START ONE. Lines pulled from teammates may not
  // set these fields at all (whatATeammateMaySet below); this is the second
  // wall, for a ledger that already holds such a line from before that rule.
  // A field with no writer is from before anyone signed in, and is yours.
  for (const field of STARTS_A_RUN) {
    const by = item?.wrote?.[field]?.by;
    if (by && by !== me) return false;
  }
  return runnerOf(item, product) === me;
}
const STARTS_A_RUN = ['body', 'answer', 'status', 'runAt'];

// WHOSE INBOX A SHARED ROW IS IN: one person's at a time, whoever has to act.
// A row given to a person is theirs until it is done; an agent's row is its
// runner's. True leaves the row to the inbox's ordinary rules, which is what a
// private row, or any row on a Mac nobody is signed in on, always gets.
// WHO SPOKE LAST IN A CONVERSATION: the writer of its newest message.
export function lastSpeaker(item) {
  const a = item?.wrote?.answer;
  const b = item?.wrote?.body;
  const latest = a && (!b || (a.ts ?? 0) >= (b.ts ?? 0)) ? a : b;
  return latest?.by ?? item?.createdBy ?? null;
}

export function inMyInbox(item, product, me) {
  if (!isShared(product) || !me) return true;
  // A CONVERSATION NEEDS WHOEVER DID NOT SPEAK LAST (2026-10-01), so a message
  // to three people is in all three inboxes until one of them answers, and the
  // answer puts it back in everyone else's. One person to one works the same.
  if (product?.team?.direct) {
    if (item.status === 'done') return false;
    const by = lastSpeaker(item);
    return by ? by !== me : item.assignee === me;
  }
  if (heldByAPerson(item)) return item.assignee === me && item.status !== 'done';
  return runnerOf(item, product) === me;
}

// A REPLY HANDS A PERSON-TO-PERSON ROW TO THE OTHER PERSON, so a conversation
// goes back and forth between two inboxes instead of sitting in both. Returns
// who it goes to, or null when a reply changes nothing about whose it is.
export function handedOnByReply(item, product, me) {
  if (!isShared(product) || !me || !heldByAPerson(item) || item.assignee !== me) return null;
  const people = Array.isArray(item.people) ? item.people : [];
  return people.find((p) => p !== me) || (item.createdBy && item.createdBy !== me ? item.createdBy : null);
}

// WHAT A TEAMMATE'S LINE MAY SET ON THIS MAC. Found by review 2026-10-01: a
// teammate's line with source "founder" could set the body, the answer, the
// status, the schedule or the model of any row in a shared project, including
// a row whose runner is you, and the supervisor then started an agent here on
// their words. So a pulled line keeps only the summary (which the board shows
// anyway), who has to act next, and, in a message between two people (which
// never runs an agent), the message itself. Everything else is dropped before
// it reaches the disk, claims and epochs included. Returns null when nothing
// is left.
const A_TEAMMATE_MAY_SET = ['problem', 'progress', 'solution', 'blockedBy', 'blocks', 'assignee'];
// The status rides too: a new message reopens a conversation put away, and a
// message record never starts an agent (mayRunHere).
const IN_A_MESSAGE_ALSO = ['title', 'body', 'answer', 'people', 'status'];
export function whatATeammateMaySet(line, { direct = false } = {}) {
  if (!line || typeof line !== 'object' || !line.patch || typeof line.patch !== 'object') return null;
  const allowed = direct ? [...A_TEAMMATE_MAY_SET, ...IN_A_MESSAGE_ALSO] : A_TEAMMATE_MAY_SET;
  const kept = {};
  for (const field of allowed) if (field in line.patch) kept[field] = line.patch[field];
  const patch = pickFields(kept);
  if (!patch) return null;
  return { id: line.id, ts: line.ts, source: line.source, by: line.by, uid: line.uid, patch };
}

// A LEASE BELONGS TO THE MAC THAT TOOK IT. A claim, an epoch, a release or a
// heartbeat is a worker's hold on one Mac, so it never rides a line across to
// another one — not even to a second copy of the app that is also yours.
export function withoutALease(line) {
  const out = { ...line };
  delete out.claim; delete out.epoch; delete out.release; delete out.heartbeat;
  return out;
}

// A LINE AS IT COMES BACK FROM THE CLOUD, the same on both backends. Who wrote
// it and when are the database's (by_person, created_at), never the copy in
// the body, and a teammate's line carries no lease (above).
export function asPulled(body, { by, at, me }) {
  const line = { ...body, by };
  if (by === me) return line;
  const kept = withoutALease(line);
  if (Number.isFinite(at)) kept.ts = at;
  return kept;
}

// YOUR OWN LINE, COMING BACK FROM A SECOND COPY OF THE APP SIGNED IN AS YOU.
//
// Reported 2026-10-04 (w-2fce569057): "I sent Riley a message and it didn't
// come back." It had been sent from a second copy. It reached the cloud and it
// reached the other person's app; what it never reached was the everyday copy,
// because the pull skipped every line whose writer was you, on the reasoning
// that a line you wrote is already here. True of the copy that wrote it, false
// of every other copy you own, and a conversation missing your own half reads
// as a message that never sent.
//
// ONLY IN A MESSAGE RECORD, where no agent ever runs (mayRunHere). On an
// ordinary shared row your own answer, body or status is exactly what starts
// one, and `mayRunHere` believes a line whose writer is you, because it is you:
// carrying those across would start a second agent on the same row on your
// other Mac. So nothing crosses there, and your own words stay where you typed
// them. Returns null when the line is not yours to bring back.
export function whatYourOtherCopyMaySet(line, { direct = false } = {}) {
  if (!direct || !line || typeof line !== 'object') return null;
  return withoutALease(line);
}
