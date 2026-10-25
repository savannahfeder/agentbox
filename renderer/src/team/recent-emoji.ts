// THE EMOJI YOU USED LAST, FIRST (w-0d55a2b160). "It remembers your most
// recent ones and then gives them as the first options ... I'm always searching
// for the same emojis over and over." Slack's rule, kept on this Mac: every
// pick, newest first, and the short row opens on them with the usual list
// filling what is left. ./ChatActions.tsx draws it.
//
// On this Mac and not in the team's store: which emoji somebody reaches for is
// their own habit, and a teammate's picks reshuffling your row would be the
// opposite of remembering.

export const RECENT_KEY = 'agentbox.recentEmoji';

// Enough for the short row and a row of the full list, and no more: past this
// "recent" stops meaning anything.
const KEEP = 24;

type Store = Pick<Storage, 'getItem' | 'setItem'> | undefined | null;
const local = (): Store => {
  try { return globalThis.localStorage; } catch { return null; }
};

/** The list after picking `emoji`: it first, and nowhere else. */
export function used(recent: string[], emoji: string, keep = KEEP): string[] {
  return [emoji, ...recent.filter((e) => e !== emoji)].slice(0, keep);
}

/** The short row: your recent ones, then the usual ones, as long as the usual list. */
export function quickRow(recent: string[], usual: string[], length = usual.length): string[] {
  return [...new Set([...recent, ...usual])].slice(0, length);
}

export function readRecent(store: Store = local()): string[] {
  try {
    const held = JSON.parse(store?.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(held) ? held.filter((e): e is string => typeof e === 'string' && !!e) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string, store: Store = local()): void {
  try { store?.setItem(RECENT_KEY, JSON.stringify(used(readRecent(store), emoji))); } catch { /* only a convenience */ }
}

/**
 * Calls `fresh` each time the pointer arrives on a message, and returns the way
 * to stop. A row read on arrival, not on every pick, never reorders under a
 * pointer that is already on it.
 */
export function onArrival(message: EventTarget, fresh: () => void): () => void {
  message.addEventListener('pointerenter', fresh);
  return () => message.removeEventListener('pointerenter', fresh);
}

/** A reaction's chip pressed: joining it is using that emoji, leaving it is not. */
export function chipPressed(emoji: string, off: boolean, store: Store = local()): void {
  if (!off) rememberEmoji(emoji, store);
}
