// PURE. What belongs in the inbox, and what a click on a message means.
//
// The select state was drawn into the unread-dot slot with no hit area of its
// own, so every click on it was a click on the row, and the row opens the
// message. Multi-select was therefore only reachable through modifiers, which
// made it limited.
//
// The box is now its own control, and this is the whole grammar in one place so
// the row and the box can never disagree about what a click was for:
//
//   the BOX   selects. Never opens, whatever else is held. Shift extends the
//             selection from the last row touched, the way it does on the row.
//   the ROW   opens, unless a modifier says otherwise: shift extends a range,
//             cmd (or ctrl) picks one out.
import { isCleanRun } from '../../shared/repeats.mjs';
import { answerSettled } from '../../shared/answers.mjs';
import { firstRealLine, previewText } from './format';
import { TROUBLE_ID } from './trouble-row';
import { DONE } from './done-word';

/**
 * WRITTEN DOWN AND DELIBERATELY NOT BEGUN (w-afb66e6661): "Add it to Later" on
 * the new thread card. The authority is `notStarted` in shared/work-items.mjs,
 * which is what stops a worker pulling it; this is the window's typed copy of
 * the same one-line fact, kept here because every list in the window already
 * reads its rules from this file.
 */
export const notStarted = (i: Pick<InboxItem, 'start'> | null | undefined): boolean => i?.start === 'later';

/* ------------------------------- the inbox ------------------------------- */
// What has a claim on her attention right now. Pulled out of App.tsx so it can
// be stated once and tested, because it was wrong in a way nobody could see:
// every list it produced looked plausible, and what was missing from it had no
// symptom except the work appearing never to have happened.
//
// THE ANSWER TO A QUESTION THE USER ASKED IS DELIVERED, NOT FILED. An item she
// composed spends its life in In Progress (queued, then running) and then a
// worker writes the result and marks it done, which used to mean straight past
// her into the archive. The same question could be asked and answered several
// times over without the answer ever being seen, so the user's own tasks looked
// like the ones nothing ever happened to (2026-08-06).
//
// The distinction the ledger has always carried and this rule now reads: an
// agent's `done` on her ask is news; her own `done` is the archive.
//
// deliveredThrough is the moment this rule started applying. Answers finished
// before it stay in Done, where she has been finding them; without it, turning
// this on would have dropped a year of settled work into an empty inbox.
export interface InboxItem {
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
  createdAt?: number;
  updatedAt?: number;
  wrote?: Record<string, { ts: number; source: string } | undefined>;
}

const hers = (i: InboxItem) => (i.labels ?? []).includes('founder');
const liveAnswer = (i: InboxItem) => (i.answer && i.answer !== '(withdrawn)' ? i.answer : undefined);

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
// once she had already replied (answerSettled above), so her own open row
// carrying an answer was in neither list she reads. That left two bad moves:
// close it, which reaches her but ends a conversation she may be mid-way
// through, or leave it open, which keeps the thread and hides the answer. Every
// session on that row but the last chose the second, correctly by the rules it
// was given.
//
// So this is the third state, and it reads what the ledger already records: HER
// OWN OPEN ROW, CARRYING A RESULT A WORKER WROTE AFTER HER LAST WORD, WITH NO
// REPLY FROM HER YET. It goes to the inbox and it leaves In progress, because
// nothing more is going to happen on it until she speaks. It does not close the
// row: the thread stays alive and her reply still lands on it.
//
// Claimed is not here for the same reason it is not in answerSettled: a worker
// is on the row right now and In progress is honest about that. Done and
// blocked route on their own branches below and always could.
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
// (isDue in shared/work-items.mjs is unchanged and is what
// the supervisor gates on), and it no longer touches what she sees. Her own
// deferrals are unchanged: those hide the row, because that is what she meant.
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

// `hiddenUntil` is HER deferral only: the caller passes the founder-set runAt
// maxed with the old localStorage snooze the view still honours on read. It is
// deliberately not the same number as the `deferredUntil` that gates In
// progress, which is any deferral by anyone, because nothing runs on a row an
// agent parked either.
//
// `live` is whether a session is on this row right now (the supervisor's
// running list). Nothing else here can see that, and the status cannot stand
// in for it: a worker writes blocked or done, or leaves its answer, and then
// keeps running while it writes its last message.
export function belongsInInbox(
  i: InboxItem,
  { deliveredThrough = 0, hiddenUntil = 0, now = Date.now(), live = false } = {},
): boolean {
  // ADDED TO LATER AND NOT STARTED (w-afb66e6661). It is written down on
  // purpose and waits for a person rather than a clock, so it is in Later and
  // nowhere else. Not a deferral: there is no moment to come back at.
  if (notStarted(i)) return false;
  // AN AGENT IS STILL WORKING ON IT (w-bc976fd247). A row that set itself
  // blocked sat in Needs you wearing the turning mark until its session
  // exited. It is In progress until then (`belongsInProgress`), and the
  // branches below decide the moment it is not.
  if (live) return false;
  if (hiddenUntil > now) return false;    // she put it away herself
  // One run of a repeating task that a worker EXPLICITLY marked clean. This is
  // the only place in the app where finishing hides something, so it is keyed on a
  // marker somebody had to set rather than on what the row is: an unmarked run,
  // one that failed, one carrying a result, and one that died saying nothing
  // all stay exactly as loud as they were. Required to hide, never to show,
  // because ancestry is not proof that a run was quiet.
  if (isCleanRun(i)) return false;
  if (parkedByAgent(i, now)) return true; // an agent stopped: what happens next is hers
  // THE AGENT HAS FINISHED ACTING ON HER ANSWER AND THE THREAD IS STILL ALIVE.
  // The same event as an agent's `done` on her ask, and the same news: the
  // difference is only that this row is one a worker is right to leave open
  // (the standing thread a whole workstream reports from). Without this the
  // finished work had nowhere to go: the branches below hand an open answered
  // row back to the agent, so eleven finished reports sat in In progress
  // reading "stopped" while she waited to be told (2026-08-12). Claimed is
  // excluded because a worker is on it again, and In progress is telling her.
  if (i.status !== 'done' && i.status !== 'claimed' && answerSettled(i)) return true;
  // THE WORKER HAS ANSWERED HER AND LEFT THE THREAD OPEN. The same news as the
  // branch above, one step earlier in the conversation: there she had spoken and
  // a session finished acting on it, here she has not spoken yet and a session
  // has finished answering the ask the user wrote. Both end with a written answer on
  // a live row and nothing coming, which is the one thing this list is for.
  // Without it the answer waited 27.5 hours (answeredHerAsk, above).
  if (answeredHerAsk(i)) return true;
  if (i.status === 'done') {
    // A thread she has SPOKEN ON is hers too, whoever filed it. Keying this on
    // the 'founder' label alone covered only the asks she composed, and the row
    // that proved the gap was agent-filed: a one-word status question went onto
    // the live thread for a whole workstream, a worker answered that question and closed
    // the row in the same append (which is also the ordinary loop, so the close
    // itself cannot be refused), and it went to the archive under a one-word
    // question with the workstream inside it. An agent ending a conversation she
    // is in the middle of is news she has not received, not filing.
    if (!hers(i) && !liveAnswer(i)) return false;            // agent work she never touched is filed
    if (i.wrote?.status?.source === 'founder') return false; // she archived it herself
    return (i.wrote?.status?.ts ?? i.updatedAt ?? 0) > deliveredThrough;
  }
  // A STOPPED ROW IS IN THE INBOX, WHATEVER KIND IT IS. The last line of this
  // function used to say so, and the two branches below it answered first for a
  // question or a review carrying an answer — which is exactly what an approved
  // item waiting for its worker is. So that shape fell out of BOTH lists once
  // stopped: hidden here as "the agent's again" while no agent was on it, and
  // out of In progress because it was neither open nor claimed. Nothing showed
  // it anywhere. The stop now promises her inbox on the button, so the promise
  // has to hold for every row the button appears on, and In progress agrees:
  // `belongsInProgress` returns false for blocked.
  if (i.status === 'blocked') return true;
  if (i.kind === 'question') return !liveAnswer(i); // answered questions are the agent's again
  if (i.kind === 'review') return !liveAnswer(i);   // an answered review is being enacted
  // A PROPOSAL IS NOT A ROW HERE (w-9cf2b43110): it waits in Later and the
  // thread that filed it shows it, with the press. See `isProposal` below.
  if (isProposal(i)) return false;
  // Human-in-the-loop: agent-filed work the thread mask cannot carry — one
  // filed under no thread at all — is a PROPOSAL awaiting your approval; it
  // sits here, not in a queue, until you say run it.
  if (i.status === 'open' && !hers(i)) return !liveAnswer(i);
  return false; // blocked is handled above; everything else here is the agent's
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
 *   rule `threadMasked` keeps above — so a proposal with no carrier stays
 *   exactly where it was.
 */
export function isProposal(i: InboxItem): boolean {
  if (i.status !== 'open' || hers(i) || liveAnswer(i)) return false;
  if (i.kind === 'question' || i.kind === 'review') return false;
  return Boolean(i.parent);
}

/**
 * HOW LONG LATER MAY KEEP ONE QUIETLY. "Sometimes the tab later is not meant
 * to be looked at, so I think things that go there are really easy to lose."
 * So the quiet has a deadline, and their range for it was "24 - 72 hours,
 * somewhere there. A week is likely no longer relevant/forgotten. Even 3 days
 * is ancient tbh" — the short end of their own range.
 */
export const PROPOSAL_PATIENCE = 24 * 3_600_000;

/**
 * The threads that proposed something a day ago and have heard nothing.
 *
 * THE THREAD COMES BACK, NEVER THE PROPOSAL. The thread is the half written in
 * words a person wrote, and it already draws every proposal under it with its
 * press, so one row brings back all of them and brings back none of the
 * agent-to-agent text that started this.
 *
 * It names a thread it can see in `items`: a proposal whose parent is not
 * there has nothing to come back, which is why `isProposal` refuses to hide
 * one in the first place.
 *
 * A thread YOU closed stays closed. The reminder used to bypass the inbox's
 * archive rule, returning one Done thread after eight closes (2026-10-07).
 * An agent finishing is still news; your closure settles the reminder without
 * answering or deleting its proposals. Reopening deliberately enables it again.
 */
export function threadsOwedAnAnswer<T extends InboxItem & { id: string; parent?: string }>(
  items: readonly T[],
  now = Date.now(),
): Set<string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const owed = new Set<string>();
  for (const i of items) {
    if (!isProposal(i)) continue;
    if (now - (i.createdAt ?? 0) <= PROPOSAL_PATIENCE) continue;
    const parent = i.parent ? byId.get(i.parent) : undefined;
    if (!parent) continue;
    if (parent.status === 'done' && parent.wrote?.status?.source === 'founder') continue;
    owed.add(parent.id);
  }
  return owed;
}

/* ----------------------------- in progress ------------------------------ */
// What is actually being worked on, which is a PROMISE: a worker is on this row
// or is about to be. So the one thing it may never contain is a row whose
// moment has not arrived, and the supervisor's two spawn passes both gate on
// exactly that (`isDue`, main/supervisor.mjs). This list did not, so an item
// deferred for an hour still showed here. One row, two tabs, and the wrong tab
// believed.
//
// `deferredUntil` is the caller's dueAt: the ledger's runAt, maxed with the old
// localStorage snooze the view still honours on read.
//
// Answering used to leave a schedule standing, so that approving something on
// Friday could still run it Monday at 6am. That is now what the picker is for:
// a reply cancels the schedule (`replyClearsSchedule` below), because the
// silence it bought was indistinguishable from being ignored.
export function belongsInProgress(
  i: InboxItem,
  { deferredUntil = 0, now = Date.now(), live = false } = {},
): boolean {
  // Nothing is coming on a thread nobody has started: In progress promises a
  // worker, and this one is waiting for you to say go (w-afb66e6661).
  if (notStarted(i)) return false;
  // A session on it is the promise kept, whatever the status says yet: an
  // agent that has written blocked, done or a moment to wake at is still
  // working until it exits (w-bc976fd247, and `live` above belongsInInbox).
  if (live) return true;
  if (deferredUntil > now) return false;
  if (i.status === 'claimed') return true;
  // The promise this list makes has been kept: a session acted on her answer
  // and finished. Nothing is coming, so the row is not in progress, and the
  // inbox rule above is now showing it to her. Both lists read the one fact,
  // because "one row, two tabs" is the failure this file has already had.
  if (answerSettled(i)) return false;
  // And the same for her own ask that has been answered: the answer is written,
  // she has not replied, and the inbox rule above is now showing it to her. In
  // progress promises a worker is coming; on this row the next move is hers.
  if (answeredHerAsk(i)) return false;
  if (i.status === 'open' && liveAnswer(i)) return true; // answered/approved, spawn pending
  // Her own work, waiting its turn. Agent-filed work is a proposal and stays in
  // the inbox until she answers it, which is the branch above.
  return i.status === 'open' && i.kind !== 'question' && i.kind !== 'review' && hers(i);
}

// WHAT IS IN PROGRESS CAN BE STOPPED. One rule, deliberately the same rule as
// the list above
//
// Both surfaces for stopping already existed, and both gated on a LIVE
// SESSION instead (`supervisor.running`), which is a much narrower thing than
// the tab they appear under. In progress holds three kinds of row and only the
// third was stoppable:
//
//   1. her own task, queued, no worker yet   <- the common case
//   2. answered/approved, spawn pending
//   3. claimed, a worker running right now   <- the only one with a stop
//
// Measured on a real store: the median wait between composing a task and a
// worker claiming it was 474 seconds, and very few were claimed inside 15
// seconds. So for essentially every task there is a window of minutes where
// the row says In progress, nothing is running, and neither ⌘K nor the footer
// offered any way to stop it. On the row that reported this, that window was
// 3 minutes 5 seconds.
//
// Gating on the tab rather than on a session also removes a contradiction
// that was visible on screen: with no worker running, the one agent command ⌘K DID
// offer on a queued row was "Resume This Agent".
//
// The deferral argument is the caller's dueAt, exactly as the list passes it: a
// row whose moment has not arrived is in Scheduled, not here, and it already
// has its own way back ("Back to Inbox"). Stopping is for what is under way.
export function stoppable(
  i: InboxItem,
  { deferredUntil = 0, now = Date.now(), live = false } = {},
): boolean {
  return belongsInProgress(i, { deferredUntil, now, live });
}

/* --------------------- ACTIVE AGENTS, IN THE SIDEBAR --------------------- */
// WHAT THE RAIL COUNTS AS ACTIVE, and it is a definition over the lists rather
// than over processes.
//
// That reading was picked over only the ones working, knowing what it costs:
// it is largely the inbox repeated down the side of the screen, often more than
// twice as many rows. So the rule is the union of three lists (in progress,
// scheduled, inbox) and nothing of its own, because a fourth definition of what is live is
// a fourth answer to one question. It is the same union `liveRows` in App.tsx
// already takes for the thread mask, and that reads this now rather than
// keeping a second copy of it.
//
// THIS DOES NOT REPLACE `onTheRail` IN shared/agents.mjs. That one still rules
// the SESSIONS beside these rows, which are her own terminals and have no work
// item to be counted by; the app’s own workers reach the panel as the rows they
// were spawned for, which is what they already are in her inbox.
export function belongsOnTheRail(
  i: InboxItem,
  { deliveredThrough = 0, hiddenUntil = 0, deferredUntil = 0, now = Date.now(), live = false } = {},
): boolean {
  if (belongsInProgress(i, { deferredUntil, now, live })) return true;
  if (hiddenUntil > now && i.status !== 'done') return true;  // the user's own, put off: Scheduled
  return belongsInInbox(i, { deliveredThrough, hiddenUntil, now });
}

// What a reply does to the thread's state, which is the difference between the
// user's words reaching a worker and sitting in the ledger forever. The supervisor
// only carries an answer while the item is OPEN, so replying to anything parked
// has to hand it back. Claimed is the exception: a worker is on it and reads
// her reply when it exits, and reopening would spawn a second one.
export function statusForReply(status: string): 'open' | undefined {
  return status === 'blocked' || status === 'done' ? 'open' : undefined;
}

// AND WHAT UNDOING THAT REPLY HAS TO WRITE. Withdrawing kills the session, and
// killing one parks the row blocked (ipc `zero:stop-session`), so the undo owns
// the status whether or not the reply itself changed it. It used to restore one
// only when `statusForReply` had returned something, which is never true of an
// already-open row: her reply on an open row was withdrawn, the kill left it
// blocked, and nothing put `open` back. A blocked row carries no answer to
// anyone, so the next send was written to the ledger and no session ever
// claimed it (2026-08-17). The option button's undo always wrote 'open' and
// never had this, which is why the same withdraw worked from there.
//
// So the withdraw is one write, and it puts the thread back exactly where the
// reply found it, always.
export function withdrawReply(statusWhenReplied: string): { answer: string; status: string } {
  return { answer: '(withdrawn)', status: statusWhenReplied };
}

// A REPLY IS A CLAIM ON NOW. the row stayed in Scheduled, and the supervisor
// skips an answered row that is not yet due (supervisor.mjs, the continuation
// pass), so the reply sat unread until the moment came around.
//
// So replying clears the schedule, whoever set it. It costs the approve-Friday-run-Monday case, which is now made by answering and
// then pressing S, and the undo on the reply puts the old moment back.
export function replyClearsSchedule(i: InboxItem, now = Date.now()): boolean {
  return Math.max(i.runAt ?? 0, i.snoozedUntil ?? 0) > now;
}

/* --------------------- one thread, one row, ONE ACTION -------------------- */
// A bulk action once landed every write, and still a row APPEARED where the
// list had just been cleared.
//
// The inbox shows a thread as ONE row: a parent whose child ask is also here is
// represented by that child and hidden (`hasChildHere`, App.tsx). Snoozing the
// child takes it out of the list, which UNMASKS the parent, and the parent
// arrives on the same refresh looking exactly like a row the action skipped.
// Measured across every bulk burst in a real store: 0, 1 or 2 rows are visible
// after a burst that were not visible before, and every one is a parent
// unmasked by its own child in that same burst.
//
// So the row she selected was never one item.
//
// This returns the rows hiding BEHIND the ones she acted on. It walks up the
// parent chain only while each ancestor is itself a candidate, because that is
// exactly when the mask applies: an ancestor the inbox was never going to show
// (already done, already deferred, filed) is not hidden by her row and must not
// be dragged along by it.
//
// NOT the other repair, which was to widen the mask so a parent stays hidden
// while its child sits in Scheduled. Scheduled lists what SHE deferred, and a
// masked parent carries no moment of its own, so that fix puts the parent in
// neither list and she cannot reach it at all. Moving the thread together keeps
// every row somewhere she can see it.
// ONE THREAD, ONE ROW, AND THE MASK HOLDS WHEN THE FRONT ROW LEAVES.
//
// The mask used to read the LIST: hide a parent while a child is sitting in the
// inbox. So the instant the child left the inbox the parent stepped forward,
// wearing whatever it said the day it was written. Measured over 72 hours of
// real ledgers: nearly a fifth of the returns to the inbox were a row unmasked
// this way, about half of them saying nothing new. Answering, archiving or
// snoozing the child all did it, which is why the rows just cleared were the
// ones that looked duplicated.
//
// So the mask reads the CONVERSATION instead: a row stays hidden while any
// descendant of it is still LIVE, where live means present in one of the three
// places she looks (inbox, In progress, her own Scheduled). Answering a child
// moves it from the inbox to In progress, so the parent stays put.
//
// Two things hold the line, and neither is optional:
//
//   1. A row is only ever hidden BY A ROW SHE CAN SEE. The descendant doing the
//      hiding is in the inbox, in In progress, or in Scheduled, so the
//      conversation always has somewhere to be reached from. This is the trap
//      the earlier repair fell into (see maskedAncestors below): widening the
//      mask to cover a child in Scheduled without moving the parent too put the
//      parent in NEITHER list, and she could not reach it at all.
//   2. The climb stops at the first ancestor that is not itself live. "The
//      thread" is the nearest live chain, never every descendant: dozens of
//      rows in one product can hang off one founding directive, and a rule
//      that hid a row while any descendant anywhere is alive would hide almost
//      the whole product behind one of them. Same walk as maskedAncestors, so the
//      bulk action and the mask cannot disagree about what a thread is.
//
// Ancestors only. Two live asks under one root are siblings and neither hides
// the other; nothing here hides a row from anything except its own past.
export function threadMasked<T extends { id: string; parent?: string }>(
  candidates: T[],
  live: T[],
): Set<string> {
  const liveById = new Map(live.map((l) => [l.id, l]));
  const isCandidate = new Set(candidates.map((c) => c.id));
  const masked = new Set<string>();
  for (const start of live) {
    let cur: T = start;
    const seen = new Set<string>([cur.id]); // a parent cycle is corrupt data, not a hang
    while (cur.parent) {
      const p = liveById.get(cur.parent);
      if (!p || seen.has(p.id)) break;      // the chain is dead above here: climb no further
      seen.add(p.id);
      if (isCandidate.has(p.id)) masked.add(p.id);
      cur = p;
    }
  }
  return masked;
}

export function maskedAncestors<T extends { id: string; parent?: string }>(
  targets: T[],
  candidates: T[],
): T[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const taken = new Set(targets.map((t) => t.id));
  const out: T[] = [];
  for (const t of targets) {
    let cur: T = byId.get(t.id) ?? t;
    const seen = new Set<string>([cur.id]); // a parent cycle is corrupt data, not a hang
    while (cur.parent) {
      const p = byId.get(cur.parent);
      if (!p || seen.has(p.id)) break;
      seen.add(p.id);
      if (!taken.has(p.id)) { taken.add(p.id); out.push(p); }
      cur = p;
    }
  }
  return out;
}

/* ------------------------------- the click ------------------------------- */
export type ClickTarget = 'row' | 'box';
export type ClickIntent = 'open' | 'toggle' | 'range';

export function clickIntent(
  target: ClickTarget,
  mods: { shift?: boolean; meta?: boolean; ctrl?: boolean } = {},
): ClickIntent {
  if (mods.shift) return 'range';
  if (target === 'box') return 'toggle';
  return mods.meta || mods.ctrl ? 'toggle' : 'open';
}

/* ------------------------------ the summary ------------------------------ */
// THE ROW HAS TO BE ENOUGH TO DECIDE ON.
//
// Which text that is, is the only judgment here, and it is the same one the
// row has always made: on anything FINISHED the result is the news, because the
// body is the ask she already knows she made; on anything still open the body
// is all there is. It is keyed on the item's own status as well as the view,
// because her own directives are often one line with no body at all, and
// keying it on the Done tab alone left those rows with nothing to say.
//
// Everything about how GOOD that text is lives in briefs/founder.md, not here.
// This function's whole job is picking which field, and it is out of the
// component so that choice can be pinned by a test rather than read off a
// screenshot. The markdown stripping is previewText's, not a second copy of it.
// A ROW THAT IS NOT FINISHED SHOWED THE USER'S OWN WORDS BACK, NEVER THE
// ANSWER. The rule used to be "result only when done", and `blocked` is not
// done, so a worker that answered and marked the row blocked handed back a row
// reading exactly as it had before. Measured over 72 hours of real ledgers:
// dozens of returns to the inbox that way, every one of them word for word
// identical, and several rows sitting in the inbox at that moment carrying a
// finished answer the list would not print (one of them blank).
//
// So the question is not what the STATUS is, it is which text is NEWER. A
// result written after the body is the last thing anyone said on this row, and
// that is the news whether the row is blocked, open again on her reply, or
// done. `wrote` already records when each field was written and by whom, so
// this reads what is there rather than storing anything.
//
// The done case stays keyed on status as well, because a row can be finished
// with a result whose timestamp the fold never recorded (older ledgers), and
// dropping it would take news off rows that have been showing it correctly.
export function rowSummary(
  i: { id?: string; body?: string; result?: string; answer?: string; status?: string; title?: string; wrote?: Record<string, { ts: number; by?: string } | undefined> },
  view: string,
): string {
  // THE ROW THAT SAYS HER TASKS ARE NOT RUNNING SAYS ITS FIRST LINE AND STOPS.
  // Its body is a short message, not a card: one line of causes, then a
  // paragraph per cause naming the tasks. Run through the rule below, the row
  // ran the first line into the start of the second paragraph, because the
  // causes line ends on a count rather than on a full stop and the clip keeps
  // going until it finds one.
  if (i.id === TROUBLE_ID) return clipToSentence((i.body ?? '').split('\n')[0].trim());
  // A TEAMMATE'S REPLY IS THE NEWS (the team version). Theo answering the
  // question Maya sent him hands the row back to her, and the line under its
  // title has to be what he said, not her own question read back to her. Only
  // a reply by somebody other than whoever wrote the ask counts, so on one Mac,
  // where no line carries a writer, nothing changes.
  // THE NEWEST THING SAID IS THE NEWS, WHOEVER SAID IT (w-560647d4db). This
  // used to require a DIFFERENT writer — a teammate's reply over your ask —
  // which is the common case and not the only one. In a conversation between
  // two people the same person routinely writes both: a teammate starts it and
  // the same teammate sends the latest message, so the test failed and the row
  // printed their oldest message, days old and already read. A row cannot print
  // "what was said last" and then make an exception for who said it.
  //
  // `by` is still what gates this, and it still leaves the single-person app
  // exactly as it was: with nobody signed in no line carries a writer at all.
  const said = i.wrote?.answer;
  if (i.answer && said?.by
    && said.ts >= Math.max(i.wrote?.body?.ts ?? 0, i.wrote?.result?.ts ?? 0)) {
    return clipToSentence(firstRealLine(i.answer));
  }
  const finished = view === 'done' || i.status === 'done';
  const resultIsNewer = (i.wrote?.result?.ts ?? 0) > (i.wrote?.body?.ts ?? 0);
  const showResult = !!i.result && (finished || resultIsNewer);
  return clipToSentence(previewText(showResult ? i.result! : bodyAfterTitle(i)));
}

/* ---------------------------- what a row is called ------------------------ */
// THE NAME ON THE ROW: the written label when there is one, and her own title
// when there is not.
//
// TWO THINGS THIS IS NOT. It is not a rewrite of her title: the fold refuses one
// on a row the user wrote, which is exactly why `label` is a field beside it rather
// than a better title (shared/work-items.mjs). And it is not extracted from
// Claude Code, because there is nothing there to extract: Claude Code generates
// a name for the terminal tab and never saves it, and ZERO of thousands of
// recent transcript files carry a `summary` row (main/agent-sessions.mjs found
// the same thing on a smaller sample). It is written by whoever is on the row, which is the one party that
// knows where the thread has got to.
//
// AND IT IS WRITTEN ONCE, when the thread is made and from where the thread
// stood then, never again (main/row-label.mjs). A row whose person wrote a
// short clear title of their own is not named at all: that title is what they
// will look for and what they will point a teammate at.
//
// THE NEWEST NAME A PERSON WROTE BEATS THE ONE WE WROTE. A title stamped later
// than the label is a rename, and the label cannot be erased through the ledger
// (an empty field is dropped, shared/work-items.mjs), so the choice is made
// here instead. Without this a rename would be accepted and then invisible.
//
// A LABEL OF WHITESPACE IS NOT A LABEL, so it falls through to the title rather
// than emptying the row: this list may never draw a nameless line.
export function rowTitle(i: {
  title?: string;
  label?: string;
  wrote?: { title?: { ts: number; source?: string }; label?: { ts: number } };
}): string {
  const label = (i.label ?? '').trim();
  if (!label) return i.title ?? '';
  const theirs = i.wrote?.title;
  const ours = i.wrote?.label;
  const renamed = !!theirs && !!ours && theirs.source === 'founder' && theirs.ts > ours.ts;
  return (renamed && (i.title ?? '').trim()) || label;
}

// THE SCHEDULE BOX CALLS A THREAD WHAT THE LIST CALLS IT. It printed the raw
// title, which on a thread started from a message is the whole first sentence
// she typed, under the row she had just pressed showing its name
// (tests/the-schedule-box-names-the-thread-not-the-prompt.test.mjs).
export function scheduleSubtitle(i: Parameters<typeof rowTitle>[0], count = 1): string {
  return count > 1 ? `${count} items` : rowTitle(i);
}

// THE ROW MUST NOT SAY THE SAME SENTENCE TWICE. On a message written as one
// paragraph the title is now a label CUT FROM the body (message-split.ts), so
// printing the body under it opened both lines with the same words. The summary
// takes what comes after the label instead, which is the sentence the title
// could not hold. When the label is not a prefix of the body, nothing here
// changes: that is every row an agent filed, where the two were always written
// separately.
function bodyAfterTitle(i: { body?: string; title?: string }): string {
  const body = i.body ?? '';
  const label = (i.title ?? '').replace(/…$/, '').trim();
  return label && body.startsWith(label) ? body.slice(label.length).trim() : body;
}

// A ROW ENDS ON A FULL STOP, NOT MID-WORD. Cutting at a character count left
// rows trailing off mid-sentence on a dangling preposition, which is worse than
// saying less: she reads it as the row trailing off rather than as
// there being more. So the summary keeps whole sentences up to the budget, and
// falls back to a hard clip with an ellipsis only when the first sentence is
// itself longer than the budget.
//
// Every row is now the same height, whatever its author wrote.
//
// It is still a backstop rather than the design: briefs/worker.md asks agents
// for an opening that fits, and a row that needs clipping is a row whose
// author spent it on background instead.
export const SUMMARY_BUDGET = 112;

export function clipToSentence(text: string, budget = SUMMARY_BUDGET): string {
  if (text.length <= budget) return text;
  const window = text.slice(0, budget + 1);
  const end = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (end > 40) return text.slice(0, end + 1);
  const space = window.lastIndexOf(' ');
  return `${text.slice(0, space > 40 ? space : budget).trimEnd()}…`;
}

/* ------------------------- the order a list reads in ---------------------- */

// WHAT MATTERS MOST, TOP FIRST. Every list that claims to be in an order sorts
// through this, so the inbox, In progress and the fleet cannot disagree about
// which row comes next.
//
// It is here rather than inline in App.tsx because In progress did not have it
// and nothing noticed.
//
// `score` is the one in shared/rank.mjs, passed in rather than imported so this
// stays a pure rule over rows and testable without a supervisor snapshot.
// Recency is the TIE-BREAK now and nothing more.
export function byRunningOrder<T extends { updatedAt: number }>(score: (i: T) => number) {
  return (a: T, b: T) => score(b) - score(a) || b.updatedAt - a.updatedAt;
}

// THE HEADING URGENT ROWS LIFT UNDER. Picked out of five treatments
// (w-bba20a03f5): urgent items are lifted to the top under their own label.
// The four not picked are in decisions.md and are not switchable anywhere.
//
// WHICH ROWS IT COVERS IS `isUrgent` IN shared/rank.mjs AND NOTHING ELSE. There
// were two answers to "is this urgent" in the renderer before this: the row drew
// its mark off `(priority ?? 5) >= 9` inline, and `interrupt.ts` asked
// shared/rank.mjs. They differ, and the difference is not cosmetic. The shared
// one throws away a number an AGENT wrote (`wrote.priority.source === 'agent'`),
// which is the rule set on w-b09b0c24cb after more than a quarter of agent-filed
// rows came in at 7 or higher; the inline one threw away any row with a live
// session on it, which silently unmarks the user's own urgent row the moment a worker
// picks it up. With a heading over these rows the two cannot be allowed to
// disagree, because the heading would then sit over rows that do not all wear
// the mark. Everything urgent in this app now reads the same predicate.
export const URGENT_HEADING = 'Urgent';

// THE HEADING THAT ENDS THE URGENT BLOCK (w-ad426c52ae). With one urgent row
// over nineteen ordinary ones, a single Urgent heading made them all look
// urgent. With nothing under the block but hairlines, the one heading read as
// a title over the whole inbox. So the rows
// after the urgent block get this label and Urgent visibly stops where its rows
// do. With nothing urgent, neither heading draws and the inbox is the
// headingless list picked on w-abfe371152.
export const REST_HEADING = 'Everything else';

/* ------------------------ the keys a row actually has -------------------- */
// WHAT THE ROW UNDER THE POINTER SAYS ITS KEYS ARE. The look picked out of
// four: the row you point at swaps its product name and its time for the keys,
// in that exact space, so nothing new appears and nothing moves.
//
// IT IS A PURE FUNCTION OF THE VIEW, and it is here rather than in the
// component for one reason: a hint that prints a key the handler does not have
// is worse than no hint at all, so the two have to be readable side by side.
// Every pair below is read off App.tsx's own key switch:
//
//   Enter  opens whatever is current, in every view
//   R      replies, INBOX ONLY (`view === 'inbox'` in the switch)
//   E      closes in the inbox, and in Scheduled it wakes instead, which is
//          why the word changes rather than the key
//   L      the reminder picker, inbox and Scheduled. It was S until
//          2026-10-01, when S became the summary everywhere in the app.
//
// The words are the app's own, taken off the ⌘K rows for the same actions, so
// the hint teaches the vocabulary the rest of the app uses.
//
// NOTHING IS DRAWN IN BATCH MODE. With rows ticked, E is batchDone over the
// ticks and R drops out entirely, so a per-row hint would name the wrong
// target. The ticked selection is its own mode and says so in ⌘K.
export type RowKey = { key: string; word: string };

export function rowKeys(view: string, batch = false): RowKey[] {
  if (batch) return [];
  // THE SECOND WORD IS THE ROUND'S (w-581dbc6cc4). It said "Close" while the
  // sidebar said Closed and the key meant done, and "closed" was not the right
  // word. One pair now feeds the
  // button, this hint, the palette and the tab.
  // AND THE INBOX CARRIES LATER AS WELL (2026-10-01). L really does schedule a
  // row in the inbox, and the walk's snooze beat asks for it on an inbox row,
  // so without this line that beat drew a card naming a key and no chip on the
  // row to click. It was never S here: S means the summary now, in every place
  // in the app that says a key.
  if (view === 'inbox') return [{ key: 'R', word: 'Reply' }, { key: 'E', word: DONE.short }, { key: 'L', word: 'Later' }];
  if (view === 'snoozed') return [{ key: 'E', word: 'Back to inbox' }, { key: 'L', word: 'Remind me' }];
  return [{ key: '⏎', word: 'Open' }];
}

/* ------------ AND WHAT IS LEFT OF THEM WHILE THE WALK IS ON --------------- */
/* * A KEY DRAWN ON A ROW IN THE WALK HAS TO DO SOMETHING, which is the rule the setup screens
 have kept since 2026-08-21 and the rows never did.

   THE ROWS BROKE IT AND IT IS PHOTOGRAPHED (w-7fd38422b5, 2026-08-27). While a
   beat is up, the walk swallows every key except that beat's own, and offers
   even that one only on the rows the beat is about. The row hint knew none of
   this: it is a property of the VIEW, so any row under the pointer printed
   "R Reply · E Close" whatever the walk would do with them. On the clearing
   beat that is one true promise and three dead ones, and the dead ones sat on
   the row an agent is stopped on, which is the row her pointer was on.

   So while the walk is coaching, a row may print the beat's own key and no
   other, and only if the beat is about that row. Everything else prints
   nothing, which is the truth: nothing else happens.

   THE WALK IS THE ONLY CALLER THAT NARROWS THIS. With `walk` null every row
   says exactly what it said before, which is every row in the app on every day
   nobody is being onboarded.

 AND A BEAT WITH NO KEY IS NOT THE SAME AS NO WALK, which is the one thing easy to get wrong
 here. Its row may not print "E Close" either, because closing the row the walk is waiting
 on is exactly the move that ends the beat by accident. So a null KEY inside a live walk
 means no row says anything, and the absent WALK is a separate case.
*/
export function walkRowKeys(
  all: RowKey[],
  /**
   * The beat on screen: the key it asks for, which may be null, and the rows
   *  that key is right for. Null for "no walk is on". */
  walk: { key: string | null; rows: string[] } | null,
  id: string,
): RowKey[] {
  if (!walk) return all;
  const want = walk.key;
  if (!want) return [];
  if (!walk.rows.includes(id)) return [];
  return all.filter((k) => k.key.toUpperCase() === want.toUpperCase());
}
