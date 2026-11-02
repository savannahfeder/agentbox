// PURE. What a key means around a reply box: which one sends, what a key does
// when no box has the keyboard, and what the box says about its own words.
import { chord } from './this-keyboard';
import { PICK_SETTLES_MS } from './pick-settles';
import { PLAIN_AGENT, voiceName } from '../../shared/agent-voice.mjs';

export type BoxKey = 'send' | 'new line' | 'leave';

/** People chat, so Enter sends; a brief to an agent is drafted, so it takes the chord. */
export function keyInTheReplyBox({ toPeople, key, shift, meta, ctrl, composing }: {
  toPeople: boolean; key: string; shift?: boolean; meta?: boolean; ctrl?: boolean; composing?: boolean;
}): BoxKey {
  if (key !== 'Enter' || composing) return 'leave';
  if (meta || ctrl) return 'send';
  if (!toPeople) return 'leave';
  return shift ? 'new line' : 'send';
}

export const sendKeyFor = (toPeople: boolean): string => chord(toPeople ? '↵' : '⌘↵');

/**
 * The line over a reply box and the toast from R on the list: the people who
 * will read it. Null for an agent's thread, whose title the screen already shows.
 */
export function replyingTo({ people }: { people?: readonly string[] | null }): string | null {
  if (!people?.length) return null;
  const names = people.length === 1 ? people[0] : `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`;
  return `Replying to ${names}`;
}

/** Who a send in this box reaches, for the line over it: a person is named as one, an agent never looks like one. */
export function replyTarget({ people }: { people?: readonly string[] | null }): { kind: 'person' | 'agent'; words: string | null; names: string[] } {
  const words = replyingTo({ people });
  return people?.length ? { kind: 'person', words, names: [...people] } : { kind: 'agent', words, names: [] };
}

/** Long enough to outlast a keystroke already on its way when the screen changed. */
export const SCREEN_SETTLES_MS = PICK_SETTLES_MS;

/** A draft left ending in "@De" would join whatever is typed next: "@DeJordan". */
export function dropHalfMention(draft: string): string {
  return draft.replace(/(^|\s)@[\p{L}\p{N}_-]*$/u, '$1');
}

/** The agent the box answers, when an agent wrote the newest words that are not yours. */
export function replyName(item: { talk?: { chat?: readonly { by: string; voice?: { name: string } }[] } | null }, me: string | null, nameOf: (id: string) => string | undefined): string | null {
  const said = [...(item.talk?.chat ?? [])].reverse().find((s) => s.by !== me);
  // The plain agent says no more than the person whose it is.
  return said?.voice && said.voice.name !== PLAIN_AGENT ? voiceName(said.voice, nameOf(said.by), {}) : null;
}

export const screenJustChanged = (changedAt: number | null, now: number): boolean =>
  changedAt !== null && now - changedAt < SCREEN_SETTLES_MS;

const printable = (key: string) => key.length === 1 && key !== ' ';
// These change something you may not have meant to change; the rest only move you.
const ACTS = new Set(['e', 'l']);
const OPEN_THREAD_KEYS = new Set(['j', 'k', 'r', 'n', 'z', '/', 'o', 'g', 's']);
const LIST_KEYS = new Set(['j', 'k', 'r', 'n', 'z', '/', 'o', 'g', 'b', 'i', '1', '2']);

/** How long after a letter went to the box the next keys are still words, not shortcuts. */
export const STILL_TYPING_MS = 1000;

/** With a thread open and no box holding the keyboard. */
export function keyOnAnOpenThread({ key, justChanged, hasOptions = false, stillTyping = false }: { key: string; justChanged: boolean; hasOptions?: boolean; stillTyping?: boolean }): 'shortcut' | 'to the box' {
  if (stillTyping && key.length === 1) return 'to the box';
  if (!printable(key)) return 'shortcut';
  const k = key.toLowerCase();
  if (OPEN_THREAD_KEYS.has(k)) return 'shortcut';
  if (ACTS.has(k)) return justChanged ? 'to the box' : 'shortcut';
  if (/^[1-9]$/.test(k) && hasOptions) return 'shortcut';
  return 'to the box';
}

/** With the list on screen, where there is no box to put a letter in. */
export function keyOnTheList({ key, justChanged }: { key: string; justChanged: boolean }): 'shortcut' | 'held' | 'nowhere' {
  if (!printable(key)) return 'shortcut';
  const k = key.toLowerCase();
  if (LIST_KEYS.has(k)) return 'shortcut';
  if (ACTS.has(k)) return justChanged ? 'held' : 'shortcut';
  return 'nowhere';
}

export const NOWHERE_TO_TYPE = 'Nothing is open to type into.';
export const HELD_AFTER_A_CHANGE = 'That key did nothing, because the screen had just changed.';

/** A held key repeats, and the repeat of the one that opened a box would type into it. */
export function heldKeyThatOpenedTheBox({ key, repeat, empty, opener }: { key: string; repeat: boolean; empty: boolean; opener: string }): boolean {
  return repeat && empty && key.toLowerCase() === opener;
}
