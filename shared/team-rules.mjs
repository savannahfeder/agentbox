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
  if (heldByAPerson(item)) return false;
  return runnerOf(item, product) === me;
}
