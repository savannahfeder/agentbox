// PURE. The ⌘K rows for what a thread's own controls do: the three-dot menu,
// a conversation's Add people and the strip a teammate's task opens with. Each row is offered exactly where its control
// is, and says in `does` what App.tsx should run.
//
// Every row keeps its own keywords so a word finds only the rows it means:
// "private" must never put a row that SHARES the thread under the return key.

import type { Seen } from './threads/summary-rules';
import { PLACE_ROW, placeAct, type PlaceAct, type ThreadPlace } from './threads/ThreadMenu';
import { firstName } from './team/company';
import type { Person } from './types';

export type TeamRoute = 'agent' | 'me' | 'back';
export type AskVerdict = 'done' | 'yes' | 'changes';
export interface AskAnswer { verdict: AskVerdict; label: string }

/** What a teammate's ask on you is answered with, in the words of the page's buttons (threads/TeammateThread). */
export function askAnswers(kind: 'help' | 'review' | null | undefined, owner: string): AskAnswer[] {
  if (kind === 'help') return [{ verdict: 'done', label: `Hand back to ${owner}` }];
  if (kind === 'review') return [{ verdict: 'yes', label: 'Looks good' }, { verdict: 'changes', label: `Send changes to ${owner}` }];
  return [];
}

/** Sent to the open teammate's thread, which hands back with what is in its box. `detail` is the verdict. */
export const HAND_BACK_EVENT = 'zero:hand-back';
export { ASK_PERSON_EVENT } from './threads/ThreadMenu';

const ANSWER_WORDS: Record<AskVerdict, string> = {
  done: 'hand back return done finish give back help',
  yes: 'review approve looks good lgtm yes ok fine',
  changes: 'review changes fix needs request',
};

export type ThreadDoes =
  | { act: 'see'; to: 'team' | 'private'; already: boolean }
  | { act: 'people' }
  | { act: 'pin'; pin: boolean }
  | { act: 'place'; keep: PlaceAct }
  | { act: 'code' }
  | { act: 'rename' }
  | { act: 'end-repeat' }
  | { act: 'add-people' }
  | { act: 'route'; route: TeamRoute }
  | { act: 'give'; to: string; name: string }
  | { act: 'ask'; kind: 'help' | 'review'; to: string; name: string }
  | { act: 'shipped'; on: boolean }
  | { act: 'wait'; on: string | null }
  | { act: 'decide' }
  | { act: 'hand-back'; verdict: AskVerdict };

export interface ThreadCommand {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  keyHint?: string;
  does: ThreadDoes;
}

export interface ThreadFacts {
  /** Who sees it now, or null where that is not this thread's to change. */
  seen?: Seen | null;
  /** The people it is shared with, in the panel's words ("Theo and Ana"). */
  chosen?: string;
  /** Whether anybody else is on the team to choose. */
  teammates?: boolean;
  /** Null where it cannot be pinned. */
  pinned?: boolean | null;
  place?: ThreadPlace | null;
  /** What the open thread draws, or null when this thread is not the open one. */
  open?: { change: boolean } | null;
  rename?: boolean;
  repeats?: boolean;
  /** True on a conversation, which opens a new one; 'thread' on an agent thread, which takes them in place. */
  addPeople?: boolean | 'thread';
  /** The strip's choices on a task a teammate gave you, in its words. */
  routes?: { route: TeamRoute; label: string }[];
  /** Who this thread could be handed on to (`giveRows`), and AI teammates beside them. */
  give?: GiveTo[];
  /** People who can be asked for help or a review here. */
  ask?: GiveTo[];
  /** Whether a person has said it shipped, or null where the team would not see that. */
  shipped?: boolean | null;
  /** What it could wait on (`waitChoices`), and whether it waits now. */
  waits?: readonly { id: string; label: string }[];
  waitsNow?: boolean;
  /** An agent thread the team can see, with an answer to save to its project's decisions. */
  decide?: boolean;
  /** On a teammate's thread with their ask open on you (`askAnswers`). */
  answers?: readonly AskAnswer[];
}

export interface GiveTo { id: string; name: string; detail?: string; /** Has an open ask on this thread already. */ asked?: boolean }

const WEEK_MS = 7 * 86_400_000;

/**
 * WHO KNOWS THIS AREA: each person's threads in the same project this week, as
 * a short word beside their name, the busiest first. "This is more in their
 * domain" is the reason to hand something over, and nothing said whose it was.
 */
export function byWorkHere<P extends GiveTo>(people: readonly P[], cards: readonly { personId: string; project?: string | null; updatedAt?: number }[], project: string | null | undefined, now = Date.now()): P[] {
  if (!project) return [...people];
  const count = new Map<string, number>();
  for (const c of cards) if (c.project === project && (c.updatedAt ?? 0) >= now - WEEK_MS) count.set(c.personId, (count.get(c.personId) ?? 0) + 1);
  return people
    .map((p, k) => ({ p, k, n: count.get(p.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.k - b.k)
    .map(({ p, n }) => (n ? { ...p, detail: `${n} in ${project} this week` } : p));
}

/** The people a thread can be handed on to: not a conversation, nor a finished
 *  thread, nor one that is a teammate's to give. */
export function giveRows(
  item: { status?: string; agent?: unknown; createdBy?: string | null; runner?: string | null },
  { me, people, product }: { me: string | null; people: readonly { id: string; name?: string | null; email?: string | null }[]; product?: { team?: { direct?: boolean } | null } | null },
): GiveTo[] {
  if (!me || !product || product.team?.direct || item.agent || item.status === 'done') return [];
  if ((item.runner ?? item.createdBy ?? me) !== me) return [];
  return people.filter((p) => p.id !== me).map((p) => ({ id: p.id, name: firstName(p as Person) }));
}

// THESE ROWS ARE WRITTEN THE WAY THE MENU WRITES THEM (2026-10-24). A `titled`
// helper here upper-cased every word on the way into ⌘K, so the menu said "Run
// on this Mac" and ⌘K said "Run on This Mac", and the list mixed the two
// styles. The menu's is the one kept (./threads/ThreadMenu).

const SEES = 'visible visibility who sees seen';

/** What a press on a Make Private or Share with Team row says, done or already so. */
export const SEE_SAID = {
  private: 'Only you can see this thread now.',
  team: 'Your team can see this thread now.',
} as const;

export function threadCommands(f: ThreadFacts): ThreadCommand[] {
  const rows: ThreadCommand[] = [];
  for (const r of f.routes ?? []) {
    rows.push({
      id: `route-${r.route}`,
      label: r.label,
      keywords: r.route === 'agent' ? 'give hand agent delegate' : r.route === 'me' ? 'myself me keep mine take' : 'hand back return decline',
      does: { act: 'route', route: r.route },
    });
  }
  for (const a of f.answers ?? []) {
    rows.push({ id: `answer-${a.verdict}`, label: a.label, keywords: ANSWER_WORDS[a.verdict], does: { act: 'hand-back', verdict: a.verdict } });
  }
  for (const p of f.ask ?? []) {
    const first = p.name.split(/\s+/)[0] || p.name;
    rows.push({ id: `ask-review-${p.id}`, label: `Ask ${first} for a review…`, keywords: `ask review check look over feedback ${p.name.toLowerCase()}`, does: { act: 'ask', kind: 'review', to: p.id, name: p.name } });
    rows.push({ id: `ask-help-${p.id}`, label: `Ask ${first} for help…`, keywords: `ask help stuck pair question ${p.name.toLowerCase()}`, does: { act: 'ask', kind: 'help', to: p.id, name: p.name } });
  }
  for (const p of f.give ?? []) {
    rows.push({ id: `give-${p.id}`, label: `Hand over to ${p.name}`, keywords: `hand over handover hand off handoff give pass assign delegate someone else ${p.name.toLowerCase()}`, does: { act: 'give', to: p.id, name: p.name } });
  }
  for (const w of f.waits ?? []) {
    rows.push({ id: `wait-${w.id}`, label: `Waits on ${w.label}`, keywords: `waits waiting blocked by depends needs ${w.label.toLowerCase()}`, does: { act: 'wait', on: w.id } });
  }
  if (f.waitsNow) rows.push({ id: 'wait-stop', label: 'Stop waiting', keywords: 'waits waiting blocked unblock', does: { act: 'wait', on: null } });
  if (f.decide) rows.push({ id: 'decide', label: 'Save its answer as a decision', keywords: 'decision decided mark pin remember project', does: { act: 'decide' } });
  if (f.shipped != null) {
    rows.push({ id: 'shipped', label: f.shipped ? 'Not shipped after all' : 'Mark as shipped', keywords: 'shipped ship live released deployed launched', does: { act: 'shipped', on: !f.shipped } });
  }
  // The three in the panel's order, the one it is now marked rather than
  // left out, so typing "private" on a private thread still answers.
  if (f.seen) {
    rows.push({
      id: 'see-team',
      label: 'Share with the team',
      ...(f.seen === 'team' ? { hint: 'your team sees it now' } : {}),
      keywords: `${SEES} share shared team teammates everyone`,
      does: { act: 'see', to: 'team', already: f.seen === 'team' },
    });
    if (f.teammates) {
      rows.push({
        id: 'see-people',
        label: 'Share with chosen people…',
        ...(f.seen === 'people' && f.chosen ? { hint: `shared with ${f.chosen} now` } : {}),
        keywords: `${SEES} share shared chosen people person someone pick few`,
        does: { act: 'people' },
      });
    }
    rows.push({
      id: 'see-private',
      label: 'Make private',
      ...(f.seen === 'private' ? { hint: 'only you see it now' } : {}),
      keywords: `${SEES} private privacy only me just me only you personal secret`,
      does: { act: 'see', to: 'private', already: f.seen === 'private' },
    });
  }
  if (f.pinned != null) {
    rows.push({ id: 'pin', label: f.pinned ? 'Unpin thread' : 'Pin thread', keywords: 'pin pinned unpin top stick sticky', does: { act: 'pin', pin: !f.pinned } });
  }
  if (f.rename) rows.push({ id: 'rename', label: 'Rename thread…', keywords: 'rename name title retitle call it', does: { act: 'rename' } });
  if (f.open?.change) rows.push({ id: 'code', label: 'View code changes', keywords: 'code changes diff files what changed', does: { act: 'code' } });
  if (f.place && f.place !== 'off') {
    rows.push({
      id: 'place',
      label: PLACE_ROW[f.place].label,
      hint: PLACE_ROW[f.place].detail.charAt(0).toLowerCase() + PLACE_ROW[f.place].detail.slice(1),
      keywords: 'cloud mac computer here local where runs machine',
      does: { act: 'place', keep: placeAct(f.place) },
    });
  }
  if (f.repeats) rows.push({ id: 'end-repeat', label: 'Stop repeating', keywords: 'repeat repeating recurring every daily weekly stop end cancel', does: { act: 'end-repeat' } });
  if (f.addPeople) rows.push({ id: 'add-people', label: 'Add people…', hint: f.addPeople === 'thread' ? 'puts them on this thread' : 'a new conversation with them', keywords: 'add people invite person someone group conversation', does: { act: 'add-people' } });
  return rows;
}
