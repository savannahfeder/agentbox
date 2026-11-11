// THE TEAM'S RULES ABOUT ROWS, IN ONE PLACE. Pure and browser-safe: the
// supervisor asks them before it runs anything, and the window asks them
// before it puts a row in somebody's inbox, so the two can never disagree about
// whose a row is.
//
// A project is shared when its record carries a team id (main/team/projects.mts).
// Everything here leaves a private project exactly as it always was.
import { GIVEN_TASK, WORK_THREAD, pickFields } from './work-items.mts';
import { blockedOnMe, deadlineOf, isLate } from './team-tasks.mts';

/** Who wrote a field's surviving value, and when. */
export interface FieldWriter { ts: number; source?: string; by?: string }

/** A row as these rules read it; every field is optional because a private row carries none of the team's. */
export interface TeamRow {
  id?: string;
  label?: string;
  labels?: readonly string[];
  status?: string;
  createdAt?: number;
  createdBy?: string | null;
  assignee?: string;
  runner?: string;
  people?: readonly string[];
  wrote?: Readonly<Record<string, FieldWriter | undefined>>;
}

/** One thing said in a conversation. */
export interface TalkLine { by: string; ts: number; text: string }

/** Who said what, and where, in a conversation between people. */
export interface Talk {
  chat?: readonly TalkLine[];
  threads?: Readonly<Record<string, { by: string; text: string; replies?: readonly TalkLine[] }>>;
  /** Per person, when they last marked it done. */
  settled?: Readonly<Record<string, number>>;
}

/** A row in a conversation: the talk on it, approvals of its files, and a wait that ended. */
export interface TalkRow extends TeamRow {
  talk?: Talk | null;
  artifacts?: { approvals?: readonly { by: string | null; ts?: number }[] } | null;
  waitEnded?: { at: number } | null;
}

/** A project as far as the team rules read it. */
export type TeamProductLike = { team?: { projectId?: string; sharedBy?: string | null; direct?: unknown } | null } | null | undefined;

export const isShared = (product: TeamProductLike): boolean => !!product?.team?.projectId;

// A thread's label is a person's only when a person wrote it; the row namer
// writes one from the first message, and a chat with a person is named for them.
export const nameIsAPersons = (item: TeamRow | null | undefined): boolean => !!String(item?.label ?? '').trim() && item?.wrote?.label?.source !== 'agent';

interface PersonLike { id: string; name?: string | null; email?: string | null }

// The cloud fills a missing name with the part before the @, which tells nobody who it is.
const ownName = (p: PersonLike): string => {
  const name = String(p?.name ?? '').trim();
  const local = String(p?.email ?? '').split('@')[0];
  return name && name !== local ? name : '';
};

/** The team as it is drawn: each person once, someone with no name of their own by their email. */
export function teamPeopleShown<P extends PersonLike>(people: readonly P[] | null | undefined): P[] {
  const seen = new Set<string>();
  const out: P[] = [];
  for (const p of people ?? []) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(ownName(p) || !p.email ? p : { ...p, name: p.email });
  }
  return out;
}

// THE PERSON WHOSE MAC RUNS AGENTS ON A ROW: whoever it was handed to, else
// whoever started it, else (a row from before anyone signed in) whoever shared
// the project.
export function runnerOf(item: TeamRow | null | undefined, product: TeamProductLike): string | null {
  return item?.runner || item?.createdBy || product?.team?.sharedBy || null;
}

// A row a person has been given waits for that person, not for an agent.
export const heldByAPerson = (item: TeamRow | null | undefined): boolean => !!item?.assignee && item.assignee !== 'agent';

// A TASK GIVEN TO A PERSON: a row of its own in the record the two of them share
// for messages, because a project never leaves its Mac and this record does. The
// mark is what tells it from the conversation beside it, and only the line that
// makes the row can set it (whatATeammateMaySet).
export { GIVEN_TASK };
export const isTaskRow = (item: { labels?: readonly string[] } | null | undefined): boolean => (item?.labels ?? []).includes(GIVEN_TASK);
export const isGivenTask = (item: { labels?: readonly string[] } | null | undefined, product: TeamProductLike): boolean => !!product?.team?.direct && isTaskRow(item);

// A THREAD ABOUT ONE PIECE OF WORK, started with a subject, beside the
// conversation in the same record. Talk without a subject never lands in one.
export { WORK_THREAD };
export const isWorkThread = (item: { labels?: readonly string[] } | null | undefined): boolean => (item?.labels ?? []).includes(WORK_THREAD);

export function taskGiver(item: TeamRow): string | null {
  return (item?.people ?? []).find((p) => p !== item.assignee) ?? item?.createdBy ?? null;
}

// When a task last had words on it that were not yours; when it was made if none.
export function taskNewsAt(item: TalkRow | null | undefined, me: string | null): number {
  const chat = item?.talk?.chat ?? [];
  for (let k = chat.length - 1; k >= 0; k -= 1) if (chat[k].by !== me) return chat[k].ts;
  return item?.createdAt ?? 0;
}

// May a worker run on this row on this Mac, signed in as `me`?
export function mayRunHere(item: TeamRow | null | undefined, product: TeamProductLike, me: string | null): boolean {
  // Before the unshared answer: a person's row in a project of your own is theirs
  // to do, and answering yes here is how a task to Dev ran on the sender's Mac.
  if (heldByAPerson(item)) return false;
  if (!isShared(product)) return true;
  if (!me) return false;
  // A MESSAGE BETWEEN TWO PEOPLE NEVER RUNS AN AGENT, on either Mac. Turning
  // one into work is @-mentioning an agent in the reply box, which starts a new
  // thread of your own in the project the mention names; nothing a teammate
  // writes into the shared record can start one here.
  if (product?.team?.direct) return false;
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
// The assignee too: a row given to a person runs nowhere, so giving it back
// to an agent is starting one.
const STARTS_A_RUN = ['body', 'answer', 'status', 'runAt', 'assignee'];

// WHOSE INBOX A SHARED ROW IS IN: one person's at a time, whoever has to act.
// A row given to a person is theirs until it is done; an agent's row is its
// runner's. True leaves the row to the inbox's ordinary rules, which is what a
// private row, or any row on a Mac nobody is signed in on, always gets.
// WHO SPOKE LAST IN A CONVERSATION: the writer of its newest message.
export function lastSpeaker(item: TeamRow | null | undefined): string | null {
  const a = item?.wrote?.answer;
  const b = item?.wrote?.body;
  const latest = a && (!b || (a.ts ?? 0) >= (b.ts ?? 0)) ? a : b;
  return latest?.by ?? item?.createdBy ?? null;
}

/** One thread you are in where somebody spoke after you. */
export interface ThreadWaiting { uid: string; mine: boolean; fresh: number; people: string[]; text: string; last: string; lastBy: string }

/** What in a conversation waits on you. */
export interface Waits { chat: number; threads: ThreadWaiting[] }

/**
 * WHAT IN A CONVERSATION IS WAITING ON YOU (w-920461cbe6). Asked the day
 * threads shipped: in a busy chat, with three people answering your thread and
 * others carrying on in the chat, what reaches your inbox? Not a row per
 * message, and not a thread you are not in; and a thread waiting on you must
 * not be lost because you said something in the chat.
 *
 * So: `chat` is how many messages in the main chat came after your own newest
 * one there, and `threads` is every thread you are IN (you wrote the message it
 * hangs off, or replied in it) where somebody else spoke after you, newest
 * first, with how many replies are new, who wrote them, what the thread is
 * about and its newest words. Null for a row with no record of who spoke where
 * (one from before threads), which then reads by `lastSpeaker` as it always did.
 *
 * Marking the chat done settles everything said before it, for you
 * (`talk.settled`, w-8a14927b21), so your own message reopening it brings
 * nothing old back.
 */
export function whatWaits(item: TalkRow | null | undefined, me: string | null): Waits | null {
  const talk = item?.talk;
  if (!talk || !me) return null;
  // Your approval of a file answers what was said before it, as a reply would.
  const approved = Math.max(0, ...(item!.artifacts?.approvals ?? []).filter((a) => a.by === me).map((a) => a.ts ?? 0));
  const settled = Math.max(talk.settled?.[me] ?? 0, approved);
  const since = (list: readonly TalkLine[]): number => { let n = 0; for (let k = list.length - 1; k >= 0 && list[k].by !== me && list[k].ts > settled; k -= 1) n += 1; return n; };
  const threads: (ThreadWaiting & { at: number })[] = [];
  for (const [uid, t] of Object.entries(talk.threads ?? {})) {
    const replies = t.replies ?? [];
    if (t.by !== me && !replies.some((r) => r.by === me)) continue;
    const fresh = since(replies);
    if (!fresh) continue;
    const news = replies.slice(-fresh);
    threads.push({
      uid, mine: t.by === me, fresh,
      people: [...new Set(news.map((r) => r.by))],
      text: t.text, last: news[news.length - 1].text, lastBy: news[news.length - 1].by,
      at: news[news.length - 1].ts,
    });
  }
  threads.sort((a, b) => b.at - a.at);
  return { chat: since(talk.chat ?? []), threads: threads.map(({ at, ...t }) => t) };
}

export function inMyInbox(item: TalkRow, product: TeamProductLike, me: string | null, now = Date.now()): boolean {
  if (!isShared(product) || !me) return true;
  // A CONVERSATION NEEDS WHOEVER DID NOT SPEAK LAST (2026-10-01), so a message
  // to three people is in all three inboxes until one of them answers, and the
  // answer puts it back in everyone else's. One person to one works the same.
  // WITH THREADS (w-920461cbe6) the same rule is read per place: the chat, and
  // each thread you are in. One row, whichever of them is waiting.
  if (product?.team?.direct) {
    if (item.status === 'done') return false;
    // What it waited on ended (the person left the team), and you have not
    // spoken since: it is yours to decide again.
    // With no wait that ended, `undefined > n` is false, which is the answer.
    if ((item.waitEnded?.at as number) > Math.max(0, ...(item.talk?.chat ?? []).filter((s) => s.by === me).map((s) => s.ts ?? 0))) return true;
    // A task someone gave you that is past its deadline is yours to act on again.
    if (isTaskRow(item) && item.assignee === me && taskGiver(item) !== me && isLate(deadlineOf(item, me), now)) return true;
    // A task blocked on you waits on you until you next write on it.
    if (blockedOnMe(item, me)) return true;
    // Same for a task: writing back does not hand it over, but once its holder
    // has answered it waits on them in In progress, not in their Needs you.
    const waits = whatWaits(item, me);
    if (waits) return waits.chat > 0 || waits.threads.length > 0;
    const by = lastSpeaker(item);
    return by ? by !== me : item.assignee === me;
  }
  if (heldByAPerson(item)) return item.assignee === me && item.status !== 'done';
  return runnerOf(item, product) === me;
}

// A CLOSED ROW STILL OWES YOU WHAT ITS CLOSER SAID FIRST. The status is shared,
// so someone answering and then closing would otherwise take their answer off
// your list before you read it. `seen`: when you last opened the row.
export function closedOverWords(item: TalkRow, product: TeamProductLike, me: string | null, seen = 0): boolean {
  if (!me || !product?.team?.direct || item?.status !== 'done') return false;
  const closer = item.wrote?.status?.by;
  if (!closer || closer === me) return false;
  const waits = whatWaits(item, me);
  if (!waits || (!waits.chat && !waits.threads.length)) return false;
  const said = [...(item.talk!.chat ?? []), ...Object.values(item.talk!.threads ?? {}).flatMap((t) => t.replies ?? [])];
  return said.some((s) => s.by !== me && s.ts > seen);
}

// A TASK THE OTHER PERSON CLOSED is news to you once: Close task closes it for
// both, so the one who did not press it would otherwise never hear. Your E on
// it puts the news away without a close of your own, which would land in
// theirs. A week on it is old news.
const CLOSE_NEWS_MS = 7 * 86_400_000;
export function closedByTheOther(item: TalkRow, product: TeamProductLike, me: string | null, seen = 0, now = Date.now()): boolean {
  if (!me || !product?.team?.direct || !isTaskRow(item) || item.status !== 'done') return false;
  const close = item.wrote?.status;
  if (!close?.by || close.by === me || !(item.people ?? []).includes(close.by)) return false;
  return close.ts > Math.max(seen, item.talk?.settled?.[me] ?? 0) && now - close.ts < CLOSE_NEWS_MS;
}

// A CONVERSATION WHERE YOU SPOKE LAST WAITS ON THE OTHERS, in In progress, until
// one of them writes and `inMyInbox` brings it back. It used to count as Done
// (w-57a202a968); nothing was finished, and the team could not find what they
// were waiting on.
export function iSpokeLast(item: TalkRow, product: TeamProductLike, me: string | null): boolean {
  if (!me || !product?.team?.direct || item?.status === 'done' || isTaskRow(item)) return false;
  // Done for you means nothing in it waits on you: the chat or any thread.
  const waits = whatWaits(item, me);
  if (waits) return waits.chat === 0 && waits.threads.length === 0;
  return lastSpeaker(item) === me;
}

// A REPLY HANDS A PERSON-TO-PERSON ROW TO THE OTHER PERSON, so a conversation
// goes back and forth between two inboxes instead of sitting in both. Returns
// who it goes to, or null when a reply changes nothing about whose it is.
export function handedOnByReply(item: TeamRow, product: TeamProductLike, me: string | null): string | null {
  if (!isShared(product) || !me || !heldByAPerson(item) || item.assignee !== me || isGivenTask(item, product)) return null;
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
//
// AND A REACTION, which is the chips under a message (w-560647d4db). It is on
// this list rather than the one above because it is only ever drawn in a
// conversation, and because an unrecognised delta on an ordinary shared task
// would be a teammate writing a field nothing there reads. It cannot start an
// agent: `STARTS_A_RUN` above names the four fields that can, and a reaction
// touches none of them, so a chip never puts the row in anybody's inbox.
//
// AND WHICH MESSAGE A REPLY ANSWERS (w-920461cbe6), for the same two reasons:
// only a conversation draws a thread, and the mark rides beside an `answer`
// this list already lets through. Without it a teammate's thread reply would
// land in the middle of your chat instead of in the thread.
// AND AN EDIT OR DELETION OF A MESSAGE, which the fold reads only from that
// message's own author (shared/message-edits.mts).
// AND A TASK'S DUE DAY, which nothing outside this record reads.
//
// AND WHAT AN AGENT POSTED: a run writes a note or a result, and on a record that
// is the message, so its owner read it and nobody else on the record did.
//
// AND A COMMENT OR APPROVAL ON A FILE, which is as much the conversation's as a
// reaction and touches none of `STARTS_A_RUN`.
//
// AND WHICH AGENT WROTE A MESSAGE, OR WHICH AI TEAMMATE IT IS FOR, OR WHICH
// NOTES ON A FILE IT HANDS AN AGENT. All only say how the words are drawn; the
// owner they name is always the line's own writer.
const IN_A_MESSAGE_ALSO = ['title', 'body', 'answer', 'note', 'result', 'people', 'status', 'react', 'inReplyTo', 'edit', 'due', 'artifact', 'voice', 'forAgent', 'fromNotes', 'typed'];
// AND THE LEVEL THE SENDER PICKED, ON THE OPENING LINE ALONE (w-7ba439c883).
// A message now carries how urgent its sender thought it was, and that number
// decides where it sits in the inbox it lands in, so it has to survive the
// pull. It may not become a way to re-rank a row afterwards, though: the level
// rides the line that MAKES the row and no other.
//
// `kind` is how that line is known. Only a row's first line sets it, and a
// teammate may not set it here at all, so it is a marker rather than a field:
// it is read, then dropped with everything else that is not allowed.
//
// WHAT THIS DOES NOT STOP, said plainly: a teammate who forges a line carrying
// a kind can still re-rank the one conversation the two of you share. They can
// already rewrite that row's title, body, answer and status (above), so this
// opens no row that was closed to them, and nothing outside a conversation is
// reachable either way.
const WHEN_A_MESSAGE_OPENS = ['priority'];
const TASK_AUDIENCE = ['visibility', 'visibleTo'];
const opensARow = (patch: object): boolean => 'kind' in patch;

/** A ledger line as it crosses the cloud: open JSON until a rule here has read it. */
export type PulledLine = Record<string, unknown>;

/** What is left of a teammate's line once it holds only what they may set. */
export interface TeammateLine { id: unknown; ts: unknown; source: unknown; by: unknown; uid: unknown; patch: Record<string, unknown> }

export function whatATeammateMaySet(line: PulledLine | null | undefined, { direct = false }: { direct?: boolean } = {}): TeammateLine | null {
  if (!line || typeof line !== 'object' || !line.patch || typeof line.patch !== 'object') return null;
  const allowed = direct
    ? [...A_TEAMMATE_MAY_SET, ...IN_A_MESSAGE_ALSO, ...(opensARow(line.patch) ? WHEN_A_MESSAGE_OPENS : [])]
    : A_TEAMMATE_MAY_SET;
  const kept: Record<string, unknown> = {};
  for (const field of allowed) if (field in line.patch) kept[field] = (line.patch as Record<string, unknown>)[field];
  if (direct && opensARow(line.patch) && isTaskRow(line.patch)) {
    kept.labels = [GIVEN_TASK];
    // Whether the team may read the task's card, which its holder publishes.
    for (const field of TASK_AUDIENCE) if (field in line.patch) kept[field] = (line.patch as Record<string, unknown>)[field];
  }
  else if (direct && opensARow(line.patch) && isWorkThread(line.patch)) kept.labels = [WORK_THREAD];
  const patch = pickFields(kept);
  if (!patch) return null;
  return { id: line.id, ts: line.ts, source: line.source, by: line.by, uid: line.uid, patch };
}

// A LEASE BELONGS TO THE MAC THAT TOOK IT. A claim, an epoch, a release or a
// heartbeat is a worker's hold on one Mac, so it never rides a line across to
// another one — not even to a second copy of the app that is also yours.
export function withoutALease<L extends PulledLine>(line: L): L {
  const out: PulledLine = { ...line };
  delete out.claim; delete out.epoch; delete out.release; delete out.heartbeat;
  return out as L;
}

// A LINE AS IT COMES BACK FROM THE CLOUD, the same on both backends. Who wrote
// it and when are the database's (by_person, created_at), never the copy in
// the body, and a teammate's line carries no lease (above).
export function asPulled<B extends PulledLine>(body: B, { by, at, me }: { by: string; at: number; me: string | null }): B & { by: string } {
  const line = { ...body, by };
  if (by === me) return line;
  const kept = withoutALease(line);
  if (Number.isFinite(at)) (kept as PulledLine).ts = at;
  return kept;
}

// YOUR OWN LINE, COMING BACK FROM A SECOND COPY OF THE APP SIGNED IN AS YOU.
//
// Reported 2026-10-04 (w-2fce569057): a message sent to a teammate never came
// back. It had been sent from a second copy. It reached the cloud and it
// reached the teammate's app; what it never reached was the everyday copy,
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
export function whatYourOtherCopyMaySet<L extends PulledLine>(line: L | null | undefined, { direct = false }: { direct?: boolean } = {}): L | null {
  if (!direct || !line || typeof line !== 'object') return null;
  return withoutALease(line);
}

// A THREAD MADE WITH MULTIPLAYER OFF IS PRIVATE. The window offers no Team or
// Private choice then, so it was left to the project's default, and turning
// Multiplayer back on published it to the team.
export const visibilityWhenMade = <V extends string | undefined | null>(asked: V, sharing: boolean): V | 'private' | undefined => asked ?? (sharing ? undefined : 'private');
