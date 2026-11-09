// PURE. WHERE AN ACTION LEAVES HER: in the list she was already in, or on the
// next task.
//
// Resolving something from INSIDE a task advances to the next one. That is
// deliberate and it is old: processing an inbox from the reading pane is a
// flow, and dropping back to the list between every item is a round trip per
// item.
//
// Resolving something from the LIST is the other half, and nothing ever said
// so, so the advance ran there too. Pressing E on a row closed it and then
// OPENED THE NEXT ROW, which is not archiving, it is being pulled somewhere she
// did not ask to go.
//
// Measured on the built app the same day (scripts/prove-e-stays-in-the-list.mjs):
// three examples in the inbox, E pressed once per row, and the reading pane was
// up after two of the three presses. It is not a walk bug — the walk is only
// where she met it. Every E, every palette Close and every approval taken with
// no task open did this.
//
// The rule is applied ONCE, here, rather than at each of the branches that
// resolve something, because there are eight of those and fixing branches is
// how the ninth gets missed (the same reason keys.ts exists).

import { DONT_SEND } from '../../shared/teammate-reach.mts';

/**
 * The slot to reopen once the resolved item is gone: its own place in the
 *  inbox, and the id to leave out of the count while its write is deferred. */
export type Advance = { index: number; excludeId: string };

/**
 * `fromTask` is whether a task was OPEN when she acted. `index` is where the
 *  item sat in the inbox, and -1 for an item that was not in it at all (an
 *  agent row she closed from somewhere else, a row already on its way out). */
export function advanceAfter(p: { fromTask: boolean; index: number; id: string }): Advance | null {
  if (!p.fromTask) return null;
  return p.index >= 0 ? { index: p.index, excludeId: p.id } : null;
}

/**
 * DOES A REPLY MOVE HER ON, or keep her on the thread (2026-10-13)? Where she
 * opened it decides. Working through Needs you, it moves on to the next thread
 * waiting, and from the last one to the empty inbox, where one thing at a time
 * ends (w-65bcefb857). Opened from In progress or any other list, or from
 * search, she stays: "I quite often will just stick with one chat"
 * (tests/a-reply-keeps-you-on-the-thread-unless-you-are-clearing-your-inbox).
 * A thread you came back to with O is one you are working in, so it keeps you
 * too (tests/a-thread-you-came-back-to-with-o-keeps-you-after-a-reply).
 */
export function replyMovesOn(p: { view: string; onBoard: boolean; index: number; searching?: boolean; phone?: boolean; cameBack?: boolean }): boolean {
  // With search open, the tab under it is not where the work is happening.
  return !p.phone && !p.searching && !p.cameBack && advanceLandsHere(p) && p.index >= 0;
}

const MORE_COMING = /\?\s*$|\bask me\b|\bI(?:'ll| will) (?:explain|say|tell|describe)\b|\blet me (?:explain|say|describe)\b/i;

/** A pick answers and moves on, unless the talk plainly carries on here: its words promise more, or an agent is on the thread now. */
export function pickStaysPut(option: string, { live }: { live: boolean }): boolean {
  return live || MORE_COMING.test(option.replace(/\s*\(recommended\)\s*$/i, ''));
}

/** What the toast says went, and where, for a press that may have moved you on. */
export function pickSentWords(option: string, title: string): string {
  const words = option.replace(/\s*\(recommended\)\s*$/i, '').trim();
  if (words === DONT_SEND) return `Not sent to ${title}`;
  return `Sent “${words.length > 48 ? `${words.slice(0, 47)}…` : words}” to ${title}`;
}

/** The first words of the line over the reply box, for what the toast says happened. */
export const sentLineSays = (toast: string) => (/^Not sent\b/.test(toast) ? 'Not sent to' : 'Sent to');

const JUST_ARRIVED_MS = 10_000;

/** R on a thread the app just moved you to says whose box it opened: your hand may still be on the last thread. */
export function sayWhoseBox(arrival: { key: string; at: number } | null, here: string, now: number): boolean {
  return !!arrival && arrival.key === here && now - arrival.at < JUST_ARRIVED_MS;
}

/**
 * WHERE THE NEXT TASK IS OPENED: in the list on Needs you, and on the board
 *  always. The board hides the tabs but `view` still holds the one the list was
 *  last on, and testing that alone dropped her back on the board after every
 *  task whenever it was All or Done (w-34eb858714). The Waiting column is the
 *  inbox, so the hidden tab says nothing about where she is working. */
export function advanceLandsHere(p: { view: string; onBoard: boolean }): boolean {
  return p.onBoard || p.view === 'inbox';
}

/**
 * DOES OPENING THIS THREAD PUT YOU IN NEEDS YOU? A thread waiting there opens on
 *  the Needs you page however it was opened, so the tab under it has to be
 *  Needs you as well, or the two rules above read the tab you came from and an
 *  answer drops you back on it (w-d7e203a6c9). Only a thread you arrive at
 *  while it waits: one you opened from In progress that comes into Needs you
 *  while you read it stays where you opened it. Search, the board, a chat with
 *  a person, an urgent thread that took the screen and the first-run walk each
 *  keep their own way back. */
export function opensIntoNeedsYou(p: {
  view: string; onBoard: boolean; index: number; searching: boolean;
  conversation: boolean; interrupted: boolean; walking: boolean;
}): boolean {
  if (p.view === 'inbox' || p.onBoard || p.index < 0) return false;
  return !p.searching && !p.conversation && !p.interrupted && !p.walking;
}

/**
 * The task to open once the resolved one is gone: whatever now occupies its
 *  slot, or the one above when it was last. `rows` must be the inbox she is
 *  LOOKING AT, filter applied, and the same list `index` was counted in. Handed
 *  the whole inbox, the slot after the last task of a filtered project was a
 *  task from another project (w-27759abd33). */
export function nextAfterAdvance<T extends { id: string }>(rows: T[], pending: Advance | null): { item: T; index: number } | null {
  if (!pending) return null;
  const remaining = rows.filter((i) => i.id !== pending.excludeId);
  const index = Math.min(pending.index, remaining.length - 1);
  const item = remaining[index];
  return item ? { item, index } : null;
}
