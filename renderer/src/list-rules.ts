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
import { firstRealLine, previewText } from './format';
import { TROUBLE_ID } from './trouble-row';
import { DONE } from './done-word';
import { isProposal, nextMove } from './next-move';
import type { Claims, InboxItem, Mover } from './next-move';

// WHO HAS THE NEXT MOVE IS WORKED OUT IN ONE PLACE (w-fe48447cab), and that
// place is ./next-move.ts. The four lists below are nothing but a reading of
// its one answer, so they cannot disagree about a row — which is the failure
// this file has had more than once ("one row, two tabs, and the wrong tab
// believed", 2026-08-07).
//
// The row-level rules this file used to own moved there with it, because they
// are the same question asked of one field, and they are re-exported from here
// so every caller in the window still reads its rules from this file.
export type { Claims, InboxItem, Mover } from './next-move';
export {
  answeredHerAsk, hiddenUntil, isProposal, nextMove, notStarted, parkedByAgent, stillWaitingOn,
} from './next-move';

const hers = (i: InboxItem) => (i.labels ?? []).includes('founder');
const liveAnswer = (i: InboxItem) => (i.answer && i.answer !== '(withdrawn)' ? i.answer : undefined);

/* ------------------------------- the inbox ------------------------------- */
// WHAT HAS A CLAIM ON YOUR ATTENTION RIGHT NOW, which is one question and no
// longer a dozen: THE NEXT MOVE IS YOURS.
//
// It was pulled out of App.tsx so it could be stated once and tested, because
// it was wrong in a way nobody could see: every list it produced looked
// plausible, and what was missing from it had no symptom except the work
// appearing never to have happened. It then grew a branch for every wrong
// guess. ./next-move.ts says what was wrong with guessing and holds every one
// of those branches now, in the order the holders are asked in.
//
// THE ANSWER TO A QUESTION YOU ASKED IS DELIVERED, NOT FILED. An item you
// composed spends its life in In progress (queued, then running) and then a
// worker writes the result and marks it done, which used to mean straight past
// you into the archive. The same question could be asked and answered several
// times over without the answer ever being seen, so your own tasks looked like
// the ones nothing ever happened to (2026-08-06). The distinction the ledger
// has always carried: an agent's `done` on your ask is news; your own `done`
// is the archive.
//
// `deliveredThrough` is the moment that rule started applying. Answers
// finished before it stay in Done, where you have been finding them; without
// it, turning this on would have dropped a year of settled work into an empty
// inbox.
//
// THE THREE CLAIMS THE CALLER HAS TO HAND IN are `live`, `shipping` and
// `waitingOn`, and `Claims` in ./next-move.ts says why: not one of them is
// anywhere in the row, so a holder nobody asks is a holder that silently
// answers no.
export function belongsInInbox(i: InboxItem, claims: Claims = {}): boolean {
  return nextMove(i, claims) === 'you';
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
// WHAT IS ACTUALLY BEING WORKED ON, which is a PROMISE: somebody other than
// you has this one, and it is moving without you. Three movers keep that
// promise and ./next-move.ts tells them apart — an agent, the app's own ship
// queue, and another thread this one is waiting on.
//
// So the one thing it may never contain is a row whose moment has not arrived,
// and the supervisor's two spawn passes both gate on exactly that (`isDue`,
// main/supervisor.mjs). This list did not, so an item deferred for an hour
// still showed here. One row, two tabs, and the wrong tab believed.
//
// IT IS THE EXACT COMPLEMENT OF THE INBOX NOW, over one answer, so the two
// cannot both claim a row and cannot both drop one. That was the standing risk
// in two hand-written rules: they were kept in step by hand, comment by
// comment, and every new case had to be added to both correctly.
//
// `deferredUntil` is the caller's dueAt: the ledger's runAt, maxed with the old
// localStorage snooze the view still honours on read.
//
// Answering used to leave a schedule standing, so that approving something on
// Friday could still run it Monday at 6am. That is now what the picker is for:
// a reply cancels the schedule (`replyClearsSchedule` below), because the
// silence it bought was indistinguishable from being ignored.
export function belongsInProgress(i: InboxItem, claims: Claims = {}): boolean {
  const move = nextMove(i, claims);
  return move === 'agent' || move === 'app' || move === 'thread';
}

// WHAT IS IN PROGRESS CAN BE STOPPED, EXCEPT WHAT A STOP CANNOT REACH. It is
// the one answer again, narrowed to the single mover a stop actually
// interrupts: an agent. The other two movers In progress holds are refused
// here and each for a reason that was decided on its own row —
//
//   'app'     stopping the row does not stop the push the ship queue has in
//             flight, and the button promises your inbox (w-0c1ba766eb).
//   'thread'  nor does it finish the other thread this one is waiting on
//             (w-fe48447cab).
//
// That is why this is not simply `belongsInProgress` any more. It was, and the
// difference was kept in App.tsx instead, by handing this rule fewer claims
// than the list got — so the judgement lived in the caller, where nothing
// could read it next to the rule it qualifies.
//
// Everything below is why it is the TAB and not a live session:
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
export function stoppable(i: InboxItem, claims: Claims = {}): boolean {
  return nextMove(i, claims) === 'agent';
}

/* --------------------- ACTIVE AGENTS, IN THE SIDEBAR --------------------- */
// WHAT THE RAIL COUNTS AS ACTIVE, and it is a definition over the lists rather
// than over processes.
//
// That reading was picked over only the ones working, knowing what it costs:
// it is largely the inbox repeated down the side of the screen, often more than
// twice as many rows. So the rule is the union of three lists (in progress,
// scheduled, inbox) and nothing of its own, because a fourth definition of what is live is
// a fourth answer to one question.
//
// THIS DOES NOT REPLACE `onTheRail` IN shared/agents.mjs. That one still rules
// the SESSIONS beside these rows, which are her own terminals and have no work
// item to be counted by; the app’s own workers reach the panel as the rows they
// were spawned for, which is what they already are in her inbox.
// It is the one answer again: everything except the two movers that mean this
// thread is not live work at all. 'later' is written down and not begun, and
// 'filed' is history. A row the clock holds IS on the rail, because a row you
// put off is a row you are coming back to (Scheduled), and the only exception
// is one already finished.
export function belongsOnTheRail(i: InboxItem, claims: Claims = {}): boolean {
  const move = nextMove(i, claims);
  if (move === 'later' || move === 'filed') return false;
  if (move === 'clock') return i.status !== 'done';
  return true;
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

/* --------------- a thread spawned from another is just a thread ----------- */
// There used to be a rule here that hid a thread while any thread spawned from
// it was still in a list, so a conversation read as one row. It hid an urgent
// thread with a fresh answer on it behind one the user had put off for three
// days (w-2eb0e716dd). Every thread now shows by its own rules above.

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
