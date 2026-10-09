// PURE. WHO HAS THE NEXT MOVE ON A THREAD. One question, asked once, and every
// list in the window reads the answer rather than guessing at it again.
//
// WHY THIS FILE EXISTS (w-fe48447cab). Needs you was worked out from a thread's
// history: an agent spoke after you, so it must be your turn. That is a guess,
// and every time it guessed wrong the wrong case was patched with its own
// branch in list-rules.ts. There were about a dozen branches by the end, and
// the last two are the ones that show what was really wrong with it:
//
//   a LIVE SESSION (w-bc976fd247). A thread that set itself blocked sat in
//   Needs you wearing the turning mark until its session exited.
//
//   the SHIP QUEUE (w-0c1ba766eb). A thread an agent had marked ready sat in
//   Needs you while the app was still shipping it.
//
// Neither of those is anywhere in the row. The row says `blocked`, and the
// reason it is blocked — a session mid-sentence, a push in flight — is held by
// whoever is doing the work. So no amount of reading the row more carefully
// would ever have got either one right, and the next case was always going to
// need a thirteenth branch.
//
// SO EACH HOLDER REPORTS WHAT IT OWES, and this function asks them in order.
// A thread has exactly one mover:
//
//   'agent'   a session is on it right now, or a worker is coming
//   'app'     the app itself owes it something (the ship queue)
//   'thread'  it waits on another thread that is still alive
//   'clock'   you put it away until a moment
//   'later'   written down and deliberately not begun
//   'filed'   nothing is owed and nothing is news: it is history
//   'you'     the next move is yours
//
// AND 'you' IS THE DEFAULT, which is the whole safety of it. A thread no
// holder claims is yours, so a holder that goes quiet, a field that is missing
// and a case nobody thought of all end up in front of you rather than nowhere.
// A list is allowed to lose a row to another list. It is never allowed to lose
// one altogether, and that has happened here before (see `belongsInInbox`'s
// blocked branch in list-rules.ts).
import { isCleanRun } from '../../shared/repeats.mjs';
import { answerSettled } from '../../shared/answers.mjs';

export interface InboxItem {
  id?: string;
  status: string;
  kind?: string;
  labels?: string[];
  answer?: string;
  result?: string;
  answeredThrough?: number;
  runAt?: number;
  snoozedUntil?: number;
  /** 'later' while a thread sits in Later, written down and not begun. */
  start?: 'later' | 'now';
  /** The thread this one was filed under: what makes it a proposal. */
  parent?: string;
  /** The threads this one waits on. Written by whoever set the wait. */
  blockedBy?: string[];
  createdAt?: number;
  updatedAt?: number;
  wrote?: Record<string, { ts: number; source: string } | undefined>;
}

/** Who has the next move. 'you' is the default and the floor. */
export type Mover = 'you' | 'agent' | 'app' | 'thread' | 'clock' | 'later' | 'filed';

/**
 * WHAT EACH HOLDER REPORTS. Every field here is a fact NO ROW CARRIES, which is
 * why each one has to be handed in: a holder that is not asked is a holder that
 * silently answers no.
 */
export interface Claims {
  /** A session is on this row (the supervisor's `running`). */
  live?: boolean;
  /** The ship queue still owes this row a ship (the supervisor's `shipping`). */
  shipping?: boolean;
  /** The run queue owes it a worker (the supervisor's `queued` and `runNow`). */
  queued?: boolean;
  /** The threads this one waits on that are still alive (`stillWaitingOn`). */
  waitingOn?: readonly string[];
  /** The moment YOU put it away until (`hiddenUntil` in list-rules). */
  hiddenUntil?: number;
  /** The moment ANYONE put it away until: the row's own runAt, maxed with the
   *  old localStorage snooze the view still honours on read. */
  deferredUntil?: number;
  /** How far the inbox has already delivered finished work. */
  deliveredThrough?: number;
  now?: number;
}

const hers = (i: InboxItem) => (i.labels ?? []).includes('founder');
const liveAnswer = (i: InboxItem) => (i.answer && i.answer !== '(withdrawn)' ? i.answer : undefined);

/**
 * WRITTEN DOWN AND DELIBERATELY NOT BEGUN (w-afb66e6661): "Add it to Later" on
 * the new thread card. The authority is `notStarted` in shared/work-items.mjs,
 * which is what stops a worker pulling it; this is the window's typed copy of
 * the same one-line fact.
 */
export const notStarted = (i: Pick<InboxItem, 'start'> | null | undefined): boolean => i?.start === 'later';

/* --------------------------- whose schedule is it ------------------------- */
// WHO deferred a row decides what the deferral MEANS, and until 2026-08-11 one
// field said both things at once: no worker starts on this yet, and this is
// not the user's business yet. Those are the same only when the user is the
// one who set it.
//
// Agents found the field and used it as the brake it also is. They were right
// to want one: a row with no answer and nothing new to do respawns a worker
// every tick forever, and one row ran four sessions in twenty-seven
// minutes, the last spawning forty-two seconds after the previous one exited.
// With no other lever, two workers wrote a future runAt to stop themselves.
//
// The cost was invisible and much worse than the loop. Deferring also took the
// row out of her inbox, so an agent could remove its own question from the
// person it was asking.
//
// So a deferral an agent wrote gates WORKERS ONLY. It still stops the respawn
// (isDue in shared/work-items.mjs is unchanged and is what the supervisor
// gates on), and it no longer touches what she sees. Her own deferrals are
// unchanged: those hide the row, because that is what she meant.
//
// An agent parking a row is also a positive reason to SHOW it. The agent has
// just declared it is not coming back for hours; whatever happens to the row
// next is hers to decide, so the honest place for it is the inbox.
//
// The fold already records who set each field and already makes the founder
// outrank an agent per field (`wrote`, `beats`, shared/work-items.mjs), so
// there is nothing new to store: this only reads what is written down.
export function parkedByAgent(i: InboxItem, now = Date.now()): boolean {
  if (i.status === 'done') return false;
  return (i.runAt ?? 0) > now && i.wrote?.runAt?.source !== 'founder';
}

// The moment SHE put this away until, which is what hides a row from the inbox
// and what puts it in Scheduled. Both lists read this one function, because
// one row in two tabs, with the wrong tab believed, is the failure this
// codebase has already had once (2026-08-07).
//
// `legacySnooze` is the old localStorage map, still honoured on read for one
// release and never written. It is hers by definition, so it counts.
export function hiddenUntil(i: InboxItem, legacySnooze = 0): number {
  const mine = i.wrote?.runAt?.source === 'founder' ? i.runAt ?? 0 : 0;
  const reminder = i.wrote?.snoozedUntil?.source === 'founder' ? i.snoozedUntil ?? 0 : 0;
  return Math.max(mine, reminder, legacySnooze);
}

/* ------------------- answered, and handed back to the user ------------------- */
// A FINISHED ANSWER ON HER OWN OPEN ROW IS NEWS, AND HAD NOWHERE TO GO.
//
// A worker once wrote a whole answer into an open row about an hour after the
// ask. It could not be seen until a session finally closed the row 27.5 hours
// later, and TWELVE sessions claimed the row in between: the queue kept handing
// it out because from outside it looked like unfinished work, and each one read
// it, saw the answer was already there, correctly wrote nothing, and exited.
//
// The inbox showed a worker's result only once the row was done or blocked, or
// once she had already replied (answerSettled), so her own open row carrying an
// answer was in neither list she reads. That left two bad moves: close it,
// which reaches her but ends a conversation she may be mid-way through, or
// leave it open, which keeps the thread and hides the answer. Every session on
// that row but the last chose the second, correctly by the rules it was given.
//
// So this is the third state, and it reads what the ledger already records: HER
// OWN OPEN ROW, CARRYING A RESULT A WORKER WROTE AFTER HER LAST WORD, WITH NO
// REPLY FROM HER YET.
//
// Measured against a real store, replayed line by line: only a handful of rows
// have ever sat in this state for more than a minute, but they sat there for
// many hours between them, and the condition moves about one row at a time
// into the inbox.
//
// Only a RESULT counts as the worker's word, unlike agentSpokeSince: on a row
// the user wrote, the fold makes her outrank an agent on title and body, so a
// session's rewrite of those is accepted and then silently ignored. The result
// is the only place a worker can speak on her row, which is exactly why the
// answer had nowhere to go.
const HER_WORDS = ['title', 'body', 'answer'];

function herLastWord(i: InboxItem): number {
  let last = 0;
  for (const field of HER_WORDS) {
    const w = i.wrote?.[field];
    if (w?.source === 'founder') last = Math.max(last, w.ts ?? 0);
  }
  return last;
}

export function answeredHerAsk(i: InboxItem): boolean {
  if (i.status !== 'open' || !hers(i) || liveAnswer(i)) return false;
  if (!i.result) return false;   // a row with nothing written on it is not an answer
  const r = i.wrote?.result;
  return !!r && r.source === 'agent' && (r.ts ?? 0) > herLastWord(i);
}

/* ------------------------- what an agent proposes ------------------------ */
/**
 * A THREAD AN AGENT FILED UNDER ANOTHER, WAITING ON A YES (w-9cf2b43110).
 *
 * "I shouldn't have to see those. They're often a little confusing, and
 * there's lots of technical terminology. It's basically agents talking to each
 * other... my expectation is that I am the human in the loop in the inbox and
 * I only see things that need me."
 *
 * One of these used to be its own row in Needs you. It is now in Later, which
 * is already the app's word for written down and deliberately not begun, and
 * the thread that proposed it carries it with the press (ThreadsMade).
 *
 * FOUR KINDS ARE NOT PROPOSALS, and each for its own reason:
 *
 *   a question or a review, which an agent addresses TO you: its options are
 *   only legible on the row, so hiding it would hide the ask itself;
 *
 *   one you wrote (`founder`), which needs nobody's approval;
 *
 *   one already answered, claimed, finished or blocked, which is no longer
 *   waiting on anything from you. A WITHDRAWN approval is not an answer;
 *
 *   and ONE FILED UNDER NO THREAD AT ALL, which is the line that keeps this
 *   safe. Nothing may be hidden with nowhere to be reached from — the same
 *   rule `threadMasked` keeps — so a proposal with no carrier stays exactly
 *   where it was.
 */
export function isProposal(i: InboxItem): boolean {
  if (i.status !== 'open' || hers(i) || liveAnswer(i)) return false;
  if (i.kind === 'question' || i.kind === 'review') return false;
  return Boolean(i.parent);
}

/* ------------------- the threads a thread is waiting on ------------------ */
/**
 * WHICH OF THE THREADS THIS ONE WAITS ON ARE STILL ALIVE.
 *
 * `blockedBy` has been on the ledger since the team version landed, every
 * worker's brief asks for it ("If it waits on another thread, pass that
 * thread's id in blockedBy"), the thread summary draws it, and until now NO
 * LIST HAD EVER READ IT. So a thread whose own agent had correctly written
 * down that it could not move sat in Needs you saying so, next to the threads
 * that genuinely needed a decision, and the only way to tell them apart was to
 * open each one and read it.
 *
 * IT FAILS OPEN, deliberately and in three ways, because hiding a thread is
 * the dangerous direction:
 *
 *   a blocker that is DONE is not a wait. The thread it waited for has
 *   finished, so the next move is yours again, and this is what makes the wait
 *   end by itself with nothing to clear.
 *
 *   a blocker the window CANNOT SEE is not a wait. It may be in another
 *   project, archived, or past the window's 8 MB read. Nothing may be hidden
 *   behind a row that is not on the screen — the same line `isProposal` and
 *   `threadMasked` both hold.
 *
 *   a thread naming ITSELF is not a wait. That is corrupt data, not a reason
 *   to hide something forever.
 *
 * `seen` is every thread the window has, by id: the caller's own list, so this
 * stays a pure rule over rows.
 */
export function stillWaitingOn(
  i: Pick<InboxItem, 'id' | 'blockedBy'>,
  seen: ReadonlyMap<string, Pick<InboxItem, 'status'>>,
): string[] {
  const ids = Array.isArray(i.blockedBy) ? i.blockedBy : [];
  if (!ids.length) return [];
  return ids.filter((id) => {
    if (!id || id === i.id) return false;
    const other = seen.get(id);
    return !!other && other.status !== 'done';
  });
}

/* ------------------------- WHO HAS THE NEXT MOVE ------------------------- */
/**
 * The one fact, worked out once. Every holder is asked in turn and the FIRST
 * one that claims the thread owns it, so the order below is the whole design
 * and each line says why it is where it is.
 */
export function nextMove(i: InboxItem, claims: Claims = {}): Mover {
  const {
    live = false, shipping = false, queued = false, waitingOn = [],
    hiddenUntil: hidden = 0, deferredUntil = 0, deliveredThrough = 0, now = Date.now(),
  } = claims;

  // NOBODY HAS IT YET, ON PURPOSE (w-afb66e6661). It is written down and waits
  // for a person rather than a clock, so it is in Later and nowhere else. Not
  // a deferral: there is no moment to come back at. Ahead of everything,
  // including a session, because nothing is spawned on one of these.
  if (notStarted(i)) return 'later';
  // AN AGENT IS STILL WORKING ON IT (w-bc976fd247). A row that set itself
  // blocked sat in Needs you wearing the turning mark until its session
  // exited. First of the real holders, because a session on the row outranks
  // every reading of the row: the row is what the session is still editing.
  if (live) return 'agent';
  // THE APP OWES IT A SHIP (w-0c1ba766eb). An agent marked it ready and the
  // ship queue has not got to it yet. Waiting on the app, not on a person.
  if (shipping) return 'app';
  // YOU PUT IT AWAY. Hers only: an agent's deferral is a brake on workers and
  // never hides a row from her, which is `parkedByAgent` further down.
  if (hidden > now) return 'clock';
  // One run of a repeating task that a worker EXPLICITLY marked clean. This is
  // the only place in the app where finishing hides something, so it is keyed
  // on a marker somebody had to set rather than on what the row is: an
  // unmarked run, one that failed, one carrying a result, and one that died
  // saying nothing all stay exactly as loud as they were.
  if (isCleanRun(i)) return 'filed';
  // ANOTHER THREAD HAS IT (w-fe48447cab). The caller has already thrown away
  // every blocker that is finished or that it cannot see (`stillWaitingOn`),
  // so anything left here is a live thread this one is genuinely behind.
  //
  // It is under the three above and over everything below for one reason: a
  // session, a ship and your own schedule are all facts about THIS row, and
  // they beat a fact about another one. Everything below is a reading of the
  // row's history, which is exactly what the wait explains.
  if (waitingOn.length) return 'thread';
  // AN AGENT PARKED IT, so it is yours: the agent has just declared it is not
  // coming back for hours, and whatever happens next is your call.
  if (parkedByAgent(i, now)) return 'you';
  // THE AGENT HAS FINISHED ACTING ON YOUR ANSWER AND THE THREAD IS STILL
  // ALIVE. Without this the finished work had nowhere to go: the branches
  // below hand an open answered row back to the agent, so eleven finished
  // reports sat in In progress reading "stopped" while she waited to be told
  // (2026-08-12). Claimed is excluded because a worker is on it again.
  if (i.status !== 'done' && i.status !== 'claimed' && answerSettled(i)) return 'you';
  // THE WORKER HAS ANSWERED YOUR ASK AND LEFT THE THREAD OPEN. The same news
  // as the branch above, one step earlier in the conversation. Without it the
  // answer waited 27.5 hours (`answeredHerAsk`).
  if (answeredHerAsk(i)) return 'you';
  if (i.status === 'done') {
    // A thread she has SPOKEN ON is hers too, whoever filed it. Keying this on
    // the 'founder' label alone covered only the asks she composed, and the row
    // that proved the gap was agent-filed: a one-word status question went onto
    // the live thread for a whole workstream, a worker answered that question
    // and closed the row in the same append (which is also the ordinary loop,
    // so the close itself cannot be refused), and it went to the archive under
    // a one-word question with the workstream inside it. An agent ending a
    // conversation she is in the middle of is news she has not received.
    if (!hers(i) && !liveAnswer(i)) return 'filed';            // agent work she never touched
    if (i.wrote?.status?.source === 'founder') return 'filed';  // she archived it herself
    return (i.wrote?.status?.ts ?? i.updatedAt ?? 0) > deliveredThrough ? 'you' : 'filed';
  }
  // A STOPPED ROW IS YOURS, WHATEVER KIND IT IS. This used to be the last line
  // of the inbox rule, and the two branches below it answered first for a
  // question or a review carrying an answer — which is exactly what an
  // approved item waiting for its worker is. So that shape fell out of BOTH
  // lists once stopped: hidden as "the agent's again" while no agent was on
  // it, and out of In progress because it was neither open nor claimed.
  // Nothing showed it anywhere. The stop promises her inbox on the button, so
  // the promise has to hold for every row the button appears on.
  if (i.status === 'blocked') return 'you';
  // ANYONE'S SCHEDULE, now that your own and an agent's park have both had
  // their say. Nothing is going to run on it until the moment comes, and
  // Scheduled is where it says so.
  if (deferredUntil > now) return 'clock';
  if (i.status === 'claimed') return 'agent';
  if (i.kind === 'question') return liveAnswer(i) ? 'agent' : 'you'; // an answered question is the agent's again
  if (i.kind === 'review') return liveAnswer(i) ? 'agent' : 'you';   // an answered review is being enacted
  // A PROPOSAL IS NOT A ROW OF ITS OWN (w-9cf2b43110): it waits in Later and
  // the thread that filed it shows it, with the press. See `isProposal`.
  if (isProposal(i)) return 'later';
  if (i.status === 'open') {
    if (liveAnswer(i)) return 'agent';   // answered or approved, spawn pending
    // Your own work, waiting its turn in the run queue.
    if (hers(i)) return 'agent';
    // THE RUN QUEUE'S OWN REPORT, under the line above rather than instead of
    // it. The line above is a reading of the row and the queue is the holder,
    // so the queue is the one that can be right about a row the reading gets
    // wrong — an agent-filed task on a project you have made autonomous, which
    // the supervisor WILL spawn on (`autonomousProducts`, main/supervisor.mjs)
    // while the reading below hands it to you as a proposal.
    //
    // MEASURED, 2026-10-08: it changes nothing today, and that is the honest
    // state of it. No project on this Mac is autonomous, so the supervisor's
    // `queued` holds exactly the rows labelled `founder` — the line above —
    // and the two agree on all 5,458 threads in the store.
    //
    // It is kept under the reading, never over it, so the reading stays the
    // floor: a queue that goes quiet, pauses or restarts cannot take a row out
    // of In progress that the row itself says is coming.
    if (queued) return 'agent';
    // Human-in-the-loop: agent-filed work the thread mask cannot carry — one
    // filed under no thread at all — is a PROPOSAL awaiting your approval; it
    // sits in front of you, not in a queue, until you say run it.
    return 'you';
  }
  // AND NOTHING CLAIMED IT, so it is yours. Never silence: see the top of this
  // file for why this is the floor and not a fallthrough.
  return 'you';
}
