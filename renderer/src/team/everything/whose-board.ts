// The board under Everything else's cards holds the work of whichever card is
// lit: yours, the whole team's, one person's or one AI teammate's.
import type { ThreadStateWord } from '../../types';

export type EvTab = 'messages' | 'agents';

/** Whose threads to draw: the people whose cards go on it, and an AI teammate's runs instead of yours. */
export interface WhoseBoard {
  picked: string[];
  mate: string | null;
  /** Your own threads without your AI teammates' runs, which their cards hold. */
  mineOnly: boolean;
}

interface Who {
  me: string | null; people: readonly string[]; team: string | null;
  /** Whether a person shares any threads with the team. */
  shares?: (personId: string) => boolean;
}

/** Null where there is no work to draw: a chat, a card's Messages, New teammate, a person who shares nothing. */
export function whoseBoard(key: string | null, tab: EvTab, { me, people, team, shares = () => true }: Who): WhoseBoard | null {
  if (!me) return null;
  if (key === null || key === 'me') return { picked: [me], mate: null, mineOnly: true };
  if (tab !== 'agents') return null;
  if (team && key === team) return { picked: [me, ...people.filter((p) => p !== me)], mate: null, mineOnly: false };
  if (key.startsWith('person:')) return shares(key.slice('person:'.length)) ? { picked: [key.slice('person:'.length)], mate: null, mineOnly: false } : null;
  if (key.startsWith('mate:')) return { picked: [me], mate: key.slice('mate:'.length), mineOnly: false };
  return null;
}

/** What a picked card opens: its work under the cards, or its chat on the Chats page.
 *  A person who shares no threads has no work to show, so their chat, if you have one. */
export function cardOpens(key: string, { team, shares, hasChat }: { team: string | null; shares: (personId: string) => boolean; hasChat: (personId: string) => boolean }): EvTab {
  if (key === 'me' || key.startsWith('mate:') || key === team) return 'agents';
  if (key.startsWith('person:')) {
    const id = key.slice('person:'.length);
    return shares(id) || !hasChat(id) ? 'agents' : 'messages';
  }
  return 'messages';
}

export function boardItems<T>(items: readonly T[], board: WhoseBoard, mateOf: (item: T) => string | null): T[] {
  if (board.mate) return items.filter((i) => mateOf(i) === board.mate);
  if (board.mineOnly) return items.filter((i) => !mateOf(i));
  return [...items];
}

/** The board's columns in the order you dragged them. What waits on you is Needs you, so it is not one. */
export function evColumns(order: readonly ThreadStateWord[]): ThreadStateWord[] {
  return order.filter((s) => s !== 'waiting');
}

export type EvView = 'board' | 'list';
const VIEW_KEY = 'agentbox.everything.view';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): Store => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function readEvView(store: Store = local()): EvView {
  try { return store?.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'; } catch { return 'board'; }
}

export function writeEvView(view: EvView, store: Store = local()) {
  try { store?.setItem(VIEW_KEY, view); } catch { /* kept for this window only */ }
}

export const flipEvView = (view: EvView): EvView => (view === 'board' ? 'list' : 'board');
