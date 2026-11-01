// WHETHER A THREAD CAN BE MOVED TO ANOTHER PROJECT, AND WHAT MOVING ONE MEANS.
//
// A tester filed a thread in the wrong project and went to ⌘K for "Move to
// project…" (power-test-1, issue 20). Nothing in the app could do it.
//
// A THREAD LIVES INSIDE ITS PROJECT, and the ledger is the smallest part of
// that. Its session traces sit under <project>/sessions/<id>, its task folder
// is a git worktree in THAT project's repository with a branch named after it,
// and a worker may be inside that folder right now. Carrying all of it across
// is a job of its own: a branch cannot change repository, and a running worker
// cannot have the ground moved under it.
//
// So this covers the case the tester actually hit, and refuses the rest out
// loud rather than half-doing it: A THREAD NOTHING HAS EVER RUN ON. There is
// no trace, no folder, no branch and no worker, so the whole thread is the
// message you typed, and moving it is filing that message in the right place.
//
// IT GETS A NEW ID THERE, which is the one thing this does not pretend about.
// Keeping the id would put two rows with the same id in one store, and the
// lists draw rows keyed by id alone: in a search across projects the second
// one is not drawn at all. The old row closes saying where its thread went, so
// neither end of the move is a row that vanished.

// Every word somebody might type into ⌘K reaching for this. "file" and
// "project" are in here because that is what the tester typed first: "pro"
// offered New project… and Projects… and nothing else.
export const MOVE_KEYWORDS = 'move to project file refile wrong another switch put';

/** Nothing offers a move to the project the thread is already in. */
export const SAME_PROJECT = 'That thread is already in that project.';

/**
 * Why this thread cannot be moved, or null when it can.
 *
 * PURE, AND BOTH SIDES ASK IT. ⌘K asks to decide which rows to draw, and the
 * store asks again before it writes, because the screen's copy of a row can be
 * a few seconds behind a worker that has just picked it up.
 *
 * `live` is the supervisor's own answer about this row, which no field on the
 * item can stand in for: a worker writes nothing until it has something to
 * say, so a row can be under way and still look untouched.
 */
export function whyItCannotMove(item, { live = false } = {}) {
  if (!item) return 'That thread is gone.';
  // An agent row stands for a session running outside Agentbox and belongs to
  // no project's ledger, so there is nothing here to move.
  if (item.agent) return 'An agent’s own session does not live in a project.';
  if (live) return 'An agent is working on this one. Stop it first.';
  if (item.epoch > 0) return RAN_ALREADY;
  if (words(item.result) || words(item.note)) return RAN_ALREADY;
  if (item.status === 'done') return 'This thread is finished. Moving it would only move the record.';
  return null;
}

// The one sentence for every shape of "an agent has already had this", because
// they are one fact to the person reading it: the thread has a history here
// now, and the history is what cannot follow it.
export const RAN_ALREADY = 'Only a thread nothing has run on can move. This one has a history here.';

export function canMove(item, opts) {
  return whyItCannotMove(item, opts) === null;
}

const words = (text) => typeof text === 'string' && !!text.trim();

/** What the old row says in Closed, so neither end of a move is a row that
 *  vanished. `name` is the project it went to. */
export function movedAway(name) {
  return `Moved to ${name}.`;
}

/** What the new row's thread opens with, under the message itself. `name` is
 *  the project it came from. */
export function movedHere(name) {
  return `Moved here from ${name}.`;
}

// THE FIELDS A MOVE CARRIES, and it is every field the person set and none of
// the machinery. The lifecycle (status, epoch, claim, answeredThrough), the
// times and anything an agent wrote are all about the life this thread had in
// the old project, which is exactly the life that does not follow it.
//
// `parent` rides across so a thread filed under another one stays under it.
export const CARRIED = ['title', 'body', 'kind', 'priority', 'labels', 'parent', 'model', 'engine', 'effort', 'runAt', 'start', 'label', 'problem', 'visibility', 'visibleTo'];

// THE THREE `composeItem` DOES NOT TAKE, which is why they are named here
// rather than discovered by the store dropping them on the floor. They are
// written as a second line on the new row: the name you gave it, the context
// you wrote in the summary, and the thread it was filed under.
export const CARRIED_AFTERWARDS = ['parent', 'label', 'problem'];

/** The content of `item`, machinery left behind. */
export function whatMoves(item) {
  const out = {};
  for (const field of CARRIED) {
    const value = item?.[field];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) ? value.length : value !== '') out[field] = value;
  }
  return out;
}

/** Split for the two writes the store makes: what `composeItem` takes, and
 *  what has to follow it. */
export function splitForCompose(carried) {
  const compose = {};
  const after = {};
  for (const [field, value] of Object.entries(carried)) {
    (CARRIED_AFTERWARDS.includes(field) ? after : compose)[field] = value;
  }
  return { compose, after };
}
