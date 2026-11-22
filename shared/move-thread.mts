// WHETHER A THREAD CAN BE MOVED TO ANOTHER PROJECT, AND WHAT MOVING ONE MEANS.
//
// A tester filed a thread in the wrong project and went to ⌘K for "Move to
// project…" (power-test-1, issue 20). Nothing in the app could do it.
//
// A THREAD LIVES INSIDE ITS PROJECT, and the ledger is the smallest part of
// that. Its session traces sit under <project>/sessions/<id>, its task folder
// is a git worktree in THAT project's repository with a branch named after it,
// and a worker may be inside that folder right now. Carrying all of it across
// is a job of its own: a branch cannot change repository, so a running worker
// is stopped before its thread moves (main/move-thread.mts).
//
// So the conversation and its traces move and the folder stays. A thread
// nothing has run on starts in the new project from what you typed. One an
// agent has answered carries every message, in the order and the hands they
// were written in, and waits for you there unless a reply of yours was still on
// its way: the agent in the new project cannot resume the old session, so
// whether to run it again is yours; one whose agent was still working runs
// again there. One that changed code in its old project is refused, because
// that code would be left behind on a branch nobody looks at
// (main/move-thread.mts reads the folder; `notShipped` here).
//
// IT GETS A NEW ID THERE. Keeping the id would put two rows with the same id
// in one store, and the lists draw rows keyed by id alone. The old row closes
// saying where its thread went and is left out of the lists (`leftByAMove`),
// so the move reads as one thread, not a finished one beside a new one.

export interface MovableThread {
  status?: string;
  epoch?: number;
  result?: string;
  note?: string;
  agent?: unknown;
  wrote?: NotedItem['wrote'];
}

// Every word somebody might type into ⌘K reaching for this. "file" and
// "project" are in here because that is what the tester typed first: "pro"
// offered New project… and Projects… and nothing else.
import { notShipped, type NotedItem } from './not-shipped.mts';

export const MOVE_KEYWORDS: string = 'move to project file refile wrong another switch put';

/** Nothing offers a move to the project the thread is already in. */
export const SAME_PROJECT: string = 'That thread is already in that project.';

/**
 * Why this thread cannot be moved, or null when it can.
 *
 * PURE, AND BOTH SIDES ASK IT. ⌘K asks to decide which rows to draw, and the
 * store asks again before it writes, because the screen's copy of a row can be
 * a few seconds behind a worker that has just picked it up.
 *
 * A thread an agent is working on can move: main/move-thread.mts stops the
 * agent first.
 */
export function whyItCannotMove(item: MovableThread | null | undefined): string | null {
  if (!item) return 'That thread is gone.';
  // An agent row stands for a session running outside Agentbox and belongs to
  // no project's ledger, so there is nothing here to move.
  if (item.agent) return 'An agent’s own session does not live in a project.';
  if (item.status === 'done') return 'This thread is finished. Moving it would only move the record.';
  if (notShipped(item)) return CHANGED_HERE;
  return null;
}

export const CHANGED_HERE: string = 'This thread changed code in its project. Ship it or close it there first.';

/** Whether an agent has had this thread, so a move starts it over rather than files it. */
export function ranHere(item: MovableThread | null | undefined): boolean {
  return (item?.epoch ?? 0) > 0 || words(item?.result) || words(item?.note);
}

export function canMove(item: MovableThread | null | undefined): boolean {
  return whyItCannotMove(item) === null;
}

const words = (text: unknown): boolean => typeof text === 'string' && !!text.trim();

/** What the old row says in Closed, so neither end of a move is a row that
 *  vanished. `name` is the project it went to. */
export function movedAway(name: string): string {
  return `Moved to ${name}.`;
}

/** What the new row's thread opens with, under the message itself. `name` is
 *  the project it came from. */
export function movedHere(name: string): string {
  return `Moved here from ${name}.`;
}

// The move writes the old row's note and its close together; a close the
// person makes after Z reopened it is theirs and is listed again.
const MOVED_AWAY = /^Moved to .+\.$/;
const CLOSED_BY_THE_MOVE_MS = 5_000;

interface WroteStamp { ts?: number; source?: string }

/** Whether this row is the closed half of a move, which no list draws. */
export function leftByAMove(item: { status?: string; note?: string; wrote?: Record<string, WroteStamp | undefined> } | null | undefined): boolean {
  if (item?.status !== 'done' || !MOVED_AWAY.test(item.note ?? '')) return false;
  const note = item.wrote?.note;
  const closed = item.wrote?.status;
  if (note?.source !== 'system' || !note.ts || !closed?.ts) return false;
  return closed.ts >= note.ts && closed.ts - note.ts <= CLOSED_BY_THE_MOVE_MS;
}

// THE FIELDS A MOVE CARRIES, and it is every field the person set and none of
// the machinery: the lifecycle (status, epoch, claim) is about the life this
// thread had in the old project. A thread that ran also carries what was said
// on it (`carriedLines`).
//
// `parent` rides across so a thread filed under another one stays under it.
export const CARRIED: string[] = ['title', 'body', 'kind', 'priority', 'labels', 'parent', 'model', 'engine', 'effort', 'runAt', 'start', 'label', 'problem', 'visibility', 'visibleTo'];

// THE THREE `composeItem` DOES NOT TAKE, which is why they are named here
// rather than discovered by the store dropping them on the floor. They are
// written as a second line on the new row: the name you gave it, the context
// you wrote in the summary, and the thread it was filed under.
export const CARRIED_AFTERWARDS: string[] = ['parent', 'label', 'problem'];

// Labels a run puts on its row: `ship` would ship the new folder before its
// agent says so, and a repeat's label names a rule in the old project.
const RUN_LABEL = (label: string) => label === 'ship' || label === 'clean' || label.startsWith('repeat:');

/** The content of `item`, machinery left behind. */
export function whatMoves(item: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fields = item as Record<string, unknown>;
  for (const field of CARRIED) {
    let value = fields?.[field];
    if (value === undefined || value === null) continue;
    if (field === 'labels' && Array.isArray(value)) value = value.filter((l) => typeof l === 'string' && !RUN_LABEL(l));
    if (Array.isArray(value) ? value.length : value !== '') out[field] = value;
  }
  return out;
}

/** Split for the two writes the store makes: what `composeItem` takes, and
 *  what has to follow it. */
export function splitForCompose(carried: Record<string, unknown>): { compose: Record<string, unknown>; after: Record<string, unknown> } {
  const compose: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(carried)) {
    (CARRIED_AFTERWARDS.includes(field) ? after : compose)[field] = value;
  }
  return { compose, after };
}

interface LedgerLine { ts?: number; source?: string; claim?: unknown; patch?: Record<string, unknown> | null }
export interface CarriedLine { ts: number; source: string; patch: Record<string, unknown> }

// What was said on the thread, beside what the person set (CARRIED).
const SAID = ['result', 'note', 'answer', 'answeredThrough', 'from', 'voice', 'forAgent'];

/**
 * A thread that ran, as the new row writes it: the old row's lines oldest
 * first, each at its own time and in its own hand, the first one making the
 * row. `said` (`movedHere`) goes under your first message, where it goes on a
 * thread that starts over.
 */
export function carriedLines(lines: readonly LedgerLine[], said: string): CarriedLine[] {
  const out: CarriedLine[] = [];
  for (const line of lines ?? []) {
    if (!line?.patch || line.claim) continue;
    const patch: Record<string, unknown> = {};
    for (const field of [...CARRIED, ...SAID]) {
      let value = line.patch[field];
      if (value === undefined || value === null) continue;
      if (field === 'labels' && Array.isArray(value)) value = value.filter((l) => typeof l === 'string' && !RUN_LABEL(l));
      patch[field] = value;
    }
    if (!Object.keys(patch).length) continue;
    out.push({ ts: Number(line.ts) || 0, source: String(line.source ?? 'agent'), patch });
  }
  if (!out.length) return out;
  const first = out.find((l) => l.source === 'founder' && typeof l.patch.body === 'string' && l.patch.body.trim());
  if (first) first.patch.body = `${String(first.patch.body).trim()}\n\n${said}`;
  else {
    const title = out.find((l) => typeof l.patch.title === 'string')?.patch.title ?? '';
    (out.find((l) => l.source === 'founder') ?? out[0]).patch.body = [title, said].filter(Boolean).join('\n\n');
  }
  return out;
}
