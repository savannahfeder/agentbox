// THE TEAM'S RULES ABOUT ROWS, IN ONE PLACE. Pure and browser-safe: the
// supervisor asks them before it runs anything, and the window asks them
// before it puts a row in somebody's inbox, so the two can never disagree about
// whose a row is.
//
// A project is shared when its record carries a team id (main/team/projects.mjs).
// Everything here leaves a private project exactly as it always was.

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
  return runnerOf(item, product) === me;
}

// WHOSE INBOX A SHARED ROW IS IN: one person's at a time, whoever has to act.
// A row given to a person is theirs until it is done; an agent's row is its
// runner's. True leaves the row to the inbox's ordinary rules, which is what a
// private row, or any row on a Mac nobody is signed in on, always gets.
export function inMyInbox(item, product, me) {
  if (!isShared(product) || !me) return true;
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
