// Pure rules for what each list shows, and what a click on a row or its select
// box means.
import { isCleanRun } from '../../shared/repeats.mjs';
import { teammateIdOf } from '../../shared/teammates.mjs';
import { answerSettled } from '../../shared/answers.mjs';
import { saysARunGotNowhere } from '../../shared/spawn-trouble.mjs';
import { notShippedLine } from '../../shared/not-shipped.mjs';
import { firstRealLine, previewText, searchText } from './format';
import { TROUBLE_ID } from './trouble-row';
import { DONE } from './done-word';

/**
 * A thread put in Later and not begun. The window's copy of `notStarted` in
 * shared/work-items.mjs, which is what stops a worker pulling it.
 */
export const notStarted = (i: Pick<InboxItem, 'start'> | null | undefined): boolean => i?.start === 'later';

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
  /** The threads this one waits on. Written by whoever set the wait. */
  blockedBy?: string[];
  createdAt?: number;
  updatedAt?: number;
  wrote?: Record<string, { ts: number; source: string } | undefined>;
}

const hers = (i: InboxItem) => (i.labels ?? []).includes('founder');
const liveAnswer = (i: InboxItem) => (i.answer && i.answer !== '(withdrawn)' ? i.answer : undefined);

/* ------------------- the one thing nothing may take away ------------------ */
/**
 * A ROW THAT IS STILL ASKING YOU SOMETHING (w-fe48447cab).
 *
 * `live` and `shipping` take a row out of Needs you because something is
 * happening to it. Both were written as unconditional early returns, for rows
 * where nothing was being asked of anybody. The cost was that an agent asking
 * you a question and then carrying on working removed its own question from
 * the person it was asking: the row read "working" in In progress and the
 * options card addressed to you was in no list you read.
 *
 * That is a decision this codebase has already made once, about a different
 * field. `parkedByAgent` gates WORKERS and never the inbox for exactly this
 * reason, and `isProposal` refuses to hide a question or a review for it too.
 * This is the same rule reaching the last two places that did not have it.
 *
 * Their ranking for this part of the app, 2026-10-09: "If we have false
 * negatives, we lose tasks, which is a really big problem... false negatives
 * are worse than false positives." A question shown next to a working agent
 * costs a glance; a question hidden behind one costs the task.
 *
 * It is deliberately NARROW. Only the two kinds an agent addresses TO you, only
 * while they are unanswered, and never once finished — those go to the archive
 * rule, which is its own question. A withdrawn approval is not an answer
 * (`liveAnswer`), and everything else on a row with a session on it is
 * unchanged: both incidents above keep their exact behaviour.
 *
 * The row stays in In progress as well, because a session really is on it. That
 * is not the "one row, two tabs" fault this file warns about: a claimed
 * question is in both lists today, and these two vetoes were the only case
 * where attaching a session to one changed that.
 */
export function stillAsksYou(i: InboxItem): boolean {
  if (i.kind !== 'question' && i.kind !== 'review') return false;
  if (i.status === 'done') return false;
  return !liveAnswer(i);
}

// The user's own open row, carrying a result a worker wrote after her last
// word, with no reply from her yet. It goes to the inbox and leaves In
// progress, but stays open so her reply still lands on the thread. A claimed
// row is excluded because a worker is on it now.
//
// Only `result` counts as the worker's word: on a row the user wrote, the fold
// lets her outrank an agent on title and body, so an agent's rewrite of those
// is ignored.
const HER_WORDS = ['title', 'body', 'answer'];

function herLastWord(i: InboxItem): number {
  let last = 0;
  for (const field of HER_WORDS) {
    // Taking a word back is not saying one. A withdrawal is written to
    // `answer` in her own hand, so counted here it outranked the very result
    // it was undoing and the thread stopped being news.
    // tests/undoing-a-pick-that-went-out-puts-the-thread-back-in-needs-you
    if (field === 'answer' && i.answer === '(withdrawn)') continue;
    const w = i.wrote?.[field];
    if (w?.source === 'founder') last = Math.max(last, w.ts ?? 0);
  }
  return last;
}

export function answeredHerAsk(i: InboxItem): boolean {
  if (i.status !== 'open' || !hers(i) || liveAnswer(i)) return false;
  if (!i.result) return false;
  const r = i.wrote?.result;
  return !!r && r.source === 'agent' && (r.ts ?? 0) > herLastWord(i);
}

// The app has stopped carrying this row's reply. Its own word that a run got
// nowhere, written after a reply, is written only once it gives up, and nothing
// starts the row again until somebody writes, so it is in Needs you and not In
// progress, whoever filed it.
export function gaveUpOnTheAnswer(i: InboxItem): boolean {
  if (i.status !== 'open' || !liveAnswer(i) || answerSettled(i)) return false;
  const r = i.wrote?.result;
  if (!r || r.source !== 'agent' || (r.ts ?? 0) <= (i.wrote?.answer?.ts ?? 0)) return false;
  return saysARunGotNowhere(i.result);
}

// Who deferred a row decides what the deferral means. A future runAt an agent
// wrote stops workers respawning (`isDue` in shared/work-items.mjs) but does
// not hide the row, or an agent could take its own question away from the
// person it asked. An agent parking a row is a reason to show it, because what
// happens next is the user's call.
export function parkedByAgent(i: InboxItem, now = Date.now()): boolean {
  if (i.status === 'done') return false;
  return (i.runAt ?? 0) > now && i.wrote?.runAt?.source !== 'founder';
}

// The moment the user put this row away until. The inbox and Scheduled both
// read this one function, so a row cannot show in both tabs.
//
// `legacySnooze` is the old localStorage map, still honoured on read and never
// written. Only the user could set it, so it counts.
export function hiddenUntil(i: InboxItem, legacySnooze = 0): number {
  const mine = i.wrote?.runAt?.source === 'founder' ? i.runAt ?? 0 : 0;
  const reminder = i.wrote?.snoozedUntil?.source === 'founder' ? i.snoozedUntil ?? 0 : 0;
  return Math.max(mine, reminder, legacySnooze);
}

// The only copy of the inbox membership rule. Do not duplicate it: call this.
//
// `deliveredThrough`: answers finished before this moment stay in Done, so
// turning the rule on did not pour old settled work into the inbox.
// `hiddenUntil`: the user's own deferral only (see `hiddenUntil` above). It is
// not the `deferredUntil` that gates In progress, which counts a deferral by
// anyone, because nothing runs on a row an agent parked either.
// `live`: a session is on this row now (the supervisor's running list). Status
// cannot stand in for it, because a worker writes blocked or done and keeps
// running while it writes its last message.
// `shipping`: the app's ship queue still owes this row a ship.
// `waitingOn`: the threads this one waits on that can still finish
// (`waitsThatCanEnd`).
// `stopped`: the supervisor will not start it again on its own
// (`supervisor.stalled`), so a person has to, and Needs you is the list they
// read.
export function belongsInInbox(
  i: InboxItem,
  { deliveredThrough = 0, hiddenUntil = 0, now = Date.now(), live = false, shipping = false, asking = false, waitingOn = [] as readonly string[], stopped = false } = {},
): boolean {
  // In Later and not begun: it waits for a person, not a clock, so it is in
  // Later and nowhere else.
  if (notStarted(i)) return false;
  // Its agent is stopped on a permission request, so it answers before the
  // status, the schedule and the waits do: each of those is a reason the thread
  // would be elsewhere, and none is a reason the question has gone away.
  if (asking) return true;
  // A session is still on it, so it is In progress until it exits. Unless it is
  // still asking you something (w-fe48447cab): the one thing a session may not
  // do is take away the question it is asking (`stillAsksYou`).
  if (live && !stillAsksYou(i)) return false;
  // The ship queue owes it a ship. It comes back once the queue ships it or
  // hands it back to its agent. Same exception: a ship in flight is not an
  // answer to a question either.
  if (shipping && !stillAsksYou(i)) return false;
  if (hiddenUntil > now) return false;    // she put it away herself
  if (stopped) return true;
  // A repeating-task run hides only when a worker explicitly marked it clean.
  // The marker is required to hide and never to show, because a run that died
  // saying nothing is news.
  if (isCleanRun(i)) return false;
  // Waiting on another thread: it sits in Later, and the supervisor resumes it
  // when the last thread it names finishes (`resumeFinishedWaits`). Only a wait
  // that can end counts (`waitsThatCanEnd`), so a loop of waits stays here.
  if (waitsInLater(i, waitingOn)) return false;
  if (parkedByAgent(i, now)) return true; // an agent stopped: what happens next is hers
  // The agent finished acting on her answer and left the thread open, as a
  // standing workstream thread does. That is news. The branches below would
  // hand an open answered row back to the agent, so this must come first.
  // Claimed is excluded because a worker is on it again.
  if (i.status !== 'done' && i.status !== 'claimed' && answerSettled(i)) return true;
  // The worker answered her ask and left the thread open (`answeredHerAsk`).
  if (answeredHerAsk(i)) return true;
  if (gaveUpOnTheAnswer(i)) return true;
  if (i.status === 'done') {
    // An agent's `done` on a thread the user wrote or spoke on is news; her own
    // `done` is the archive. A thread she spoke on is hers whoever filed it.
    if (!hers(i) && !liveAnswer(i)) return false;            // agent work she never touched is filed
    if (i.wrote?.status?.source === 'founder') return false; // she archived it herself
    return (i.wrote?.status?.ts ?? i.updatedAt ?? 0) > deliveredThrough;
  }
  // A stopped row is in the inbox whatever its kind. This must come before the
  // question and review branches: `belongsInProgress` returns false for
  // blocked, so a stopped row with an answer would otherwise show nowhere.
  if (i.status === 'blocked') return true;
  if (i.kind === 'question') return !liveAnswer(i); // answered questions are the agent's again
  if (i.kind === 'review') return !liveAnswer(i);   // an answered review is being enacted
  // A proposal waits in Later, and the thread that filed it shows it
  // (`isProposal`).
  if (isProposal(i)) return false;
  // Agent-filed work under no thread is a proposal awaiting approval. It sits
  // here until the user says run it.
  if (i.status === 'open' && !hers(i)) return !liveAnswer(i);
  return false; // blocked is handled above; everything else here is the agent's
}

/**
 * An open thread an agent filed under another thread, waiting on a yes. It
 * sits in Later and the parent thread shows it (ThreadsMade), so the inbox
 * holds only what needs the user.
 *
 * Not proposals: a question or review, whose options only show on its own
 * row; one the user wrote; one that is answered (a withdrawn answer does not
 * count) or not open; and one filed under no thread, because nothing may be
 * hidden with nowhere to reach it from.
 */
export function isProposal(i: InboxItem): boolean {
  if (i.status !== 'open' || hers(i) || liveAnswer(i)) return false;
  if (i.kind === 'question' || i.kind === 'review') return false;
  return Boolean(i.parent);
}

/**
 * One rule for the inbox, the rail and Later, matching what the supervisor
 * resumes on: blocked, behind a wait that can end, and not stopped by the
 * user. A row the user stopped is never resumed, so it is never hidden here.
 */
export function waitsInLater(i: InboxItem, waitingOn: readonly string[]): boolean {
  return waitingOn.length > 0 && i.status === 'blocked' && i.wrote?.status?.source !== 'founder';
}

/**
 * The threads this one waits on that can still finish. It fails open, because
 * hiding a thread is the dangerous direction. Not a wait: a blocker that is
 * done, one this window cannot see (another project, archived, past the 8 MB
 * read), the thread itself, and a loop of threads that only wait on each
 * other, since nothing would ever resume them. A blocker counts when it is not
 * itself waiting, or when one of its own waits counts.
 */
export function waitsThatCanEnd<T extends Pick<InboxItem, 'status' | 'blockedBy'> & { id: string }>(
  i: T,
  byId: ReadonlyMap<string, T>,
  path: ReadonlySet<string> = new Set([i.id]),
): string[] {
  const live = (row: T) => (Array.isArray(row.blockedBy) ? row.blockedBy : [])
    .filter((id) => id && id !== row.id && byId.has(id) && byId.get(id)!.status !== 'done');
  return live(i).filter((id) => {
    if (path.has(id)) return false;
    const blocker = byId.get(id)!;
    if (!live(blocker).length) return true;
    return waitsThatCanEnd(blocker, byId, new Set(path).add(id)).length > 0;
  });
}

/**
 * How long Later holds a proposal quietly before its thread comes back,
 * because Later is easy to forget. The owner asked for "24 - 72 hours"; this
 * is the short end.
 */
export const PROPOSAL_PATIENCE = 24 * 3_600_000;

/**
 * The threads whose proposals have waited longer than PROPOSAL_PATIENCE. The
 * thread comes back, never the proposal: it already shows every proposal
 * under it, in words a person wrote.
 *
 * A proposal whose parent is not in `items` is skipped. A thread the user
 * closed stays closed, without answering its proposals; reopening it turns
 * the reminder back on.
 *
 * While a reply is on its way to an agent, or an agent is on the thread, the
 * reminder waits: Needs you wins over In progress, so it made the reply look
 * swallowed. Once the agent has answered, the thread comes back.
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
    if (parent.status === 'claimed' || (liveAnswer(parent) && !answerSettled(parent))) continue;
    owed.add(parent.id);
  }
  return owed;
}

// In progress promises that a worker is on this row or about to be, so it
// never holds a row whose moment has not arrived. The supervisor's spawn
// passes gate on the same thing (`isDue`, main/supervisor.mjs).
//
// `deferredUntil` is the caller's dueAt: the ledger's runAt, maxed with the old
// localStorage snooze the view still honours on read.
export function belongsInProgress(
  i: InboxItem,
  { deferredUntil = 0, now = Date.now(), live = false, shipping = false, stopped = false } = {},
): boolean {
  // A thread in Later waits for the user to say go, so no worker is coming.
  if (notStarted(i)) return false;
  // A live session keeps the promise whatever the status says, until it exits.
  if (live) return true;
  // So does the ship queue still owing this row a ship.
  if (shipping) return true;
  if (deferredUntil > now) return false;
  // Nothing will start it, so it is in Needs you (`belongsInInbox`).
  if (stopped) return false;
  if (i.status === 'claimed') return true;
  // A session acted on her answer and finished, so nothing is coming and the
  // inbox shows it instead. Both lists read the same fact.
  if (answerSettled(i)) return false;
  // Her ask is answered and she has not replied, so the next move is hers and
  // the inbox shows it.
  if (answeredHerAsk(i)) return false;
  if (gaveUpOnTheAnswer(i)) return false;
  if (i.status === 'open' && liveAnswer(i)) return true; // answered/approved, spawn pending
  // Her own work, waiting its turn. Agent-filed work is a proposal and stays in
  // the inbox until she answers it, which is the branch above.
  return i.status === 'open' && i.kind !== 'question' && i.kind !== 'review' && hers(i);
}

/**
 * OF THE IN PROGRESS TAB, WHAT IS ACTUALLY MOVING (w-712fc99e8d).
 *
 * The empty inbox says whether work is moving without you, and it was handed
 * the length of the tab. The tab holds a thread waiting its turn as well as
 * one being worked on, so with the fleet set to two agents a tester read "8
 * threads are running" over four that had not started.
 *
 * Running is a session on the thread, a ship the app still owes it, or one of
 * your own terminal sessions that took your reply. Queued is the supervisor's
 * own list of what the next tick will start, so a thread stuck at a sign-in
 * or a usage limit is counted as neither: it is in the tab, and nothing is
 * happening to it.
 */
export function workMoving(
  rows: readonly { id: string; agent?: unknown }[],
  { live, shipping, queued }: {
    live: ReadonlySet<string>; shipping: ReadonlySet<string>; queued: ReadonlySet<string>;
  },
): { running: number; queued: number } {
  let running = 0;
  let waiting = 0;
  for (const row of rows) {
    if (row.agent || live.has(row.id) || shipping.has(row.id)) running += 1;
    else if (queued.has(row.id)) waiting += 1;
  }
  return { running, queued: waiting };
}

// Everything In progress can be stopped, so this is the list's own rule rather
// than a check for a live session. Most tasks wait minutes in the queue before
// a worker claims them, and those must be stoppable too.
//
// `deferredUntil` is the caller's dueAt, as the list passes it. A deferred row
// is in Scheduled, which has its own way back.
export function stoppable(
  i: InboxItem,
  { deferredUntil = 0, now = Date.now(), live = false, stopped = false } = {},
): boolean {
  return belongsInProgress(i, { deferredUntil, now, live, stopped });
}

// What the sidebar rail counts as active: the union of In progress, Scheduled
// and the inbox, with no rule of its own, so there is never a fourth answer to
// what is live.
//
// `onTheRail` in shared/agents.mjs still rules the user's own terminal
// sessions beside these rows, which have no work item.
export function belongsOnTheRail(
  i: InboxItem,
  { deliveredThrough = 0, hiddenUntil = 0, deferredUntil = 0, now = Date.now(), live = false, shipping = false, waitingOn = [] as readonly string[], stopped = false } = {},
): boolean {
  if (belongsInProgress(i, { deferredUntil, now, live, shipping, stopped })) return true;
  if (hiddenUntil > now && i.status !== 'done') return true;  // the user's own, put off: Scheduled
  if (waitsInLater(i, waitingOn)) return true; // waiting in Later, coming back by itself
  return belongsInInbox(i, { deliveredThrough, hiddenUntil, now, stopped });
}

// The supervisor only carries an answer while the item is open, so a reply on
// a blocked or done row reopens it, or the reply never reaches a worker. A
// claimed row is left alone: its worker reads the reply when it exits, and
// reopening would spawn a second one.
export function statusForReply(status: string): 'open' | undefined {
  return status === 'blocked' || status === 'done' ? 'open' : undefined;
}

// Withdrawing a reply kills the session, and a kill parks the row blocked (ipc
// `zero:stop-session`). So the undo always writes back the status the reply
// found, even when the reply did not change it. Otherwise a withdrawn reply on
// an open row leaves it blocked, and no session claims the next send.
export function withdrawReply(statusWhenReplied: string): { answer: string; status: string } {
  return { answer: '(withdrawn)', status: statusWhenReplied };
}

// A reply clears the schedule, whoever set it, because the supervisor's
// continuation pass skips an answered row that is not yet due, so the reply
// would sit unread until then. The undo on the reply puts the old moment back.
export function replyClearsSchedule(i: InboxItem, now = Date.now()): boolean {
  return Math.max(i.runAt ?? 0, i.snoozedUntil ?? 0) > now;
}

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

// The line a row prints under its title: whichever of body and result was
// written last, so a blocked row with an answer shows the answer. A finished
// row shows its result even when the fold never recorded the result's
// timestamp (older ledgers). This only picks the field: how good the text is
// lives in briefs/founder.md, and markdown stripping is previewText's.
export function rowSummary(
  i: { id?: string; body?: string; result?: string; answer?: string; note?: string; status?: string; title?: string; wrote?: Record<string, { ts: number; by?: string } | undefined> },
  view: string,
): string {
  // The trouble row prints only its first line: it ends on a count, not a full
  // stop, so the clip below would run on into the next paragraph.
  if (i.id === TROUBLE_ID) return clipToSentence((i.body ?? '').split('\n')[0].trim());
  // Over the agent's last word, which was written first and says it ships.
  const unshipped = notShippedLine(i);
  if (unshipped) return clipToSentence(unshipped);
  // In the team version the newest answer is the news, whoever wrote it. Only
  // an answer that carries a writer (`by`) counts, and with nobody signed in no
  // line carries one, so the single-person app is unchanged.
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

// The name on the row: the written label when there is one, otherwise the
// title. `label` is its own field because the fold refuses a rewrite of the
// title on a row the user wrote (shared/work-items.mjs). It is written once,
// when the thread is made (main/row-label.mjs), because Claude Code names its
// terminal tab but never saves that name to a transcript.
//
// A title the user wrote after the label is a rename and wins, because the
// ledger drops empty fields and so cannot erase a label. A whitespace label
// falls through to the title, so no row is drawn without a name.
export function rowTitle(i: {
  title?: string;
  label?: string;
  labels?: string[];
  result?: string;
  wrote?: { title?: { ts: number; source?: string }; label?: { ts: number } };
}): string {
  // A teammate's thread reads as its message to you, and before it has said
  // anything, as its own title, never a name guessed from its opening line.
  if (teammateIdOf(i)) return (i.result ?? '').split('\n').map((l) => searchText(l).trim()).find(Boolean) || (i.title ?? '');
  const label = (i.label ?? '').trim();
  if (!label) return i.title ?? '';
  const theirs = i.wrote?.title;
  const ours = i.wrote?.label;
  const renamed = !!theirs && !!ours && theirs.source === 'founder' && theirs.ts > ours.ts;
  return (renamed && (i.title ?? '').trim()) || label;
}

// The schedule box names a thread the way the list does, not by its raw title
// (tests/the-schedule-box-names-the-thread-not-the-prompt.test.mjs).
export function scheduleSubtitle(i: Parameters<typeof rowTitle>[0], count = 1): string {
  return count > 1 ? `${count} items` : rowTitle(i);
}

// On a message written as one paragraph the title is cut from the body
// (message-split.ts), so the summary starts after it rather than repeating it.
// When the title is not a prefix of the body, the body is used whole.
function bodyAfterTitle(i: { body?: string; title?: string }): string {
  const body = i.body ?? '';
  const label = (i.title ?? '').replace(/…$/, '').trim();
  return label && body.startsWith(label) ? body.slice(label.length).trim() : body;
}

// The summary keeps whole sentences up to the budget, and clips mid-sentence
// with an ellipsis only when the first sentence is longer than the budget. It
// is a backstop: briefs/worker.md asks agents for an opening that fits.
export const SUMMARY_BUDGET = 112;

export function clipToSentence(text: string, budget = SUMMARY_BUDGET): string {
  if (text.length <= budget) return text;
  const window = text.slice(0, budget + 1);
  const end = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (end > 40) return text.slice(0, end + 1);
  const space = window.lastIndexOf(' ');
  return `${text.slice(0, space > 40 ? space : budget).trimEnd()}…`;
}

// Every ordered list sorts through this, so the inbox, In progress and the
// fleet agree on which row comes next. `score` is the one in shared/rank.mjs,
// passed in so this stays pure. Recency only breaks ties.
export function byRunningOrder<T extends { updatedAt: number }>(score: (i: T) => number) {
  return (a: T, b: T) => score(b) - score(a) || b.updatedAt - a.updatedAt;
}

// The heading urgent rows are lifted under. Which rows count is `isUrgent` in
// shared/rank.mjs and nothing else, so the heading never sits over a row that
// does not wear the urgent mark.
export const URGENT_HEADING = 'Urgent';

// Ends the urgent block, so a single Urgent heading does not read as a title
// over the whole inbox. With nothing urgent, neither heading draws.
export const REST_HEADING = 'Everything else';

// The keys the row under the pointer shows in place of its product name and
// time. Each pair must match App.tsx's key switch, because a hint naming a key
// the handler lacks is worse than none. The words are the ones the ⌘K rows use
// for the same actions.
//
// Nothing is drawn in batch mode: with rows ticked, E acts on the ticks and R
// does nothing, so a per-row hint would name the wrong target.
export type RowKey = { key: string; word: string };

/**
 * Where R on a row opens its reply box: the tabs L works on. The app moves to
 * In progress after a send, and an R that did nothing there left the words
 * typed next to run as shortcuts.
 */
export function replyKeyWorksIn(view: string): boolean {
  return view === 'inbox' || view === 'progress' || view === 'snoozed';
}

export function rowKeys(view: string, batch = false): RowKey[] {
  if (batch) return [];
  // The E word is DONE.short, the same word the button, the palette and the tab
  // use. L schedules in the inbox too, and the walk's snooze beat asks for it on
  // an inbox row.
  if (view === 'inbox') return [{ key: 'R', word: 'Reply' }, { key: 'E', word: DONE.short }, { key: 'L', word: 'Later' }];
  if (view === 'snoozed') return [{ key: 'E', word: 'Back to inbox' }, { key: 'L', word: 'Later' }];
  return [{ key: '⏎', word: 'Open' }];
}

/**
 * The row keys left while the onboarding walk is on. The walk swallows every
 * key except the current beat's, and only on the rows that beat is about, so a
 * row prints that key or nothing. With `walk` null every row prints its usual
 * keys.
 *
 * A beat with a null key is not the same as no walk: no row prints anything,
 * because closing the row the walk waits on would end the beat by accident.
 */
export function walkRowKeys(
  all: RowKey[],
  /**
   * The beat on screen: the key it asks for (may be null) and the rows that
   * key is for. Null when no walk is on. */
  walk: { key: string | null; rows: string[] } | null,
  id: string,
): RowKey[] {
  if (!walk) return all;
  const want = walk.key;
  if (!want) return [];
  if (!walk.rows.includes(id)) return [];
  return all.filter((k) => k.key.toUpperCase() === want.toUpperCase());
}
