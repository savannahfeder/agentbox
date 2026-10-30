// ONE THING AT A TIME (w-65bcefb857): Needs you as a queue, one thread per page.
// The page is how the thread page draws any thread in Needs you (Focus.tsx
// `queue`, ItemThread.tsx `queue`); these are the rules it and App.tsx share,
// kept here so a test can reach them.
import type { AgentEvent, AgentTurn } from './types';
import type { ItemOutcome } from './item-thread';
import { optionsFrom } from './format';
import { rowTitle } from './list-rules';
import { teammateIdOf } from '../../shared/teammates.mjs';

export interface Spot { pos: number; total: number; index: number }

type Keyed = { product: string; id: string };

const same = (a: Keyed, b: Keyed) => a.product === b.product && a.id === b.id;

/** Where a thread sits in the queue, counted from one. */
export function spotIn<T extends Keyed>(rows: T[], item: Keyed | null): Spot | null {
  if (!item) return null;
  const index = rows.findIndex((r) => same(r, item));
  return index < 0 ? null : { pos: index + 1, total: rows.length, index };
}

/** The thread above or below, stopping at either end. */
export function stepIn<T extends Keyed>(rows: T[], item: Keyed, dir: 1 | -1): T | null {
  const index = rows.findIndex((r) => same(r, item));
  if (index < 0) return null;
  return rows[index + dir] ?? null;
}

const said = (e: AgentEvent): e is AgentTurn & { kind?: undefined } => e.kind !== 'work';

/** A note the app wrote on the row (the ship queue's "Shipped to main as …"), not an answer to lead with. */
export function appWrote(outcome: ItemOutcome | null, wrote?: Record<string, { source: string } | undefined>): boolean {
  return !!outcome && outcome.field === 'note' && wrote?.note?.source === 'system';
}

/** The newest answer: the one lifted to the foot, or else the last thing said that was not yours. */
export function newestAnswer(events: AgentEvent[], outcome: ItemOutcome | null): { at: number; text: string } | null {
  if (outcome) return { at: outcome.at, text: outcome.text };
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (said(e) && e.who !== 'you' && e.text?.trim()) return { at: e.at, text: e.text };
  }
  return null;
}

/** How many messages sit behind "Show N earlier messages": all but the newest answer. */
export function earlierCount(events: AgentEvent[], outcome: ItemOutcome | null, opening?: { at: number; text: string } | null): number {
  const messages = events.filter(said).length + (opening ? 1 : 0);
  return outcome ? messages : Math.max(0, messages - (newestAnswer(events, null) ? 1 : 0));
}

/** Fewer messages than this behind the fold, and the fold would hide her own ask to save a line or two. */
const FOLD_FROM = 3;

/** Whether the page draws the whole conversation rather than folding `behind` messages away. None behind is a fold of steps only, which still helps. */
export function drawnWhole(behind: number): boolean {
  return behind > 0 && behind < FOLD_FROM;
}

/**
 * Where the page starts on a thread that has been answered since its newest
 * answer, by a reply or a pick: at that answer, so the question stays in view
 * above what was said or picked and the agent's work since. -1 when the answer
 * is still the newest word, or there is none.
 */
export function standsAt(events: AgentEvent[], newest: { at: number } | null): number {
  if (!newest) return -1;
  const answered = events.some((e) => e.at > newest.at && (said(e) ? e.who === 'you' : !!e.yours));
  return answered ? events.findIndex((e) => said(e) && e.who !== 'you' && e.at === newest.at) : -1;
}

/** How many messages the fold holds above the one the page is drawn from. */
export function earlierThan(events: AgentEvent[], from: number): number {
  return events.slice(0, from).filter(said).length;
}

/**
 * The page's name. A teammate's row is named after its answer's first line,
 * which would leave the page drawing that line twice or not at all under the
 * Context, so its page is named after what woke it; the answer is signed instead.
 */
export function pageTitle(item: Parameters<typeof rowTitle>[0]): string {
  const own = (item.title ?? '').trim();
  return teammateIdOf(item) && own ? own : rowTitle(item);
}

/** An answer opening with a line that is bold and nothing else wears it as its headline. */
export function splitHeadline(text: string): { headline: string | null; rest: string } {
  const m = /^\s*\*\*([^*\n]+)\*\*[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { headline: null, rest: text };
  return { headline: m[1].trim(), rest: text.slice(m[0].length).replace(/^\s+/, '') };
}

/**
 * Which choices a fold holds: one thread's current round of them. Another
 * thread, or the same thread's next round, opens unfolded.
 */
export function foldKey(item: Parameters<typeof optionsFrom>[0] & Keyed): string {
  return `${item.product}:${item.id}:${item.wrote?.[optionsFrom(item)]?.ts ?? 0}`;
}

const FOLDS_KEPT = 100;

/** The folds kept on this machine; the old fold-everything setting reads as none. */
export function foldedKeys(raw: string | null): string[] {
  try {
    const list = JSON.parse(raw ?? '[]');
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [];
  } catch { return []; }
}

/** Folds or unfolds one round of choices, keeping the newest hundred folds. */
export function toggleFold(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key].slice(-FOLDS_KEPT);
}
