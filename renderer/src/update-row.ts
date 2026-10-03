// WHEN THE APP MENTIONS A NEW AGENTBOX, AND THE WORDS IT USES.
//
// It used to arrive as a row in the inbox (picked 2026-08-29 from four drawn
// in designs//four-ways/index.html). Since 2026-10-01 (w-7a39dace23) it is a
// card at the foot of the sidebar instead, components/SidebarUpdate.tsx, and
// the row is gone. The sidebar is the one place the app announces it.
//
// `UPDATE_ID` and `isUpdateRow` stay because the write paths in App.tsx, the
// list and the filter still name the made rows they refuse, and a row with
// that id must never be written to a ledger even if one is built again.
//
// NOTHING THROWS AN UPDATE AWAY. There is no verb anywhere in this app that
// discards one: the code is on the disk, the sidebar and ⌘K carry the restart
// for as long as it waits, and an installed app applies it on quit.

import type { UpdateState } from './types';
import { NAME } from '../../shared/product-name.mjs';

/** The id an update row had. Not in any ledger and never will be. */
export const UPDATE_ID = 'update';

export function isUpdateRow(i: { id?: string } | null | undefined): boolean {
  return !!i && i.id === UPDATE_ID;
}

/**
 * WHETHER THE APP MENTIONS THE NEW VERSION AT ALL RIGHT NOW.
 *
 *  One question, one answer, because two screens ask it: the sidebar draws its
 *  card from it and ⌘K offers "Restart to update the app" from it. Two copies
 *  of this rule is how the news disappears from one surface and stays on the
 *  other.
 *
 * NOT DURING THE WALK.
 *
 *  The walk shows one thing at a time and every sentence on the screen points
 *  at it, so nothing about a new version appears until it ends. It is a delay
 *  and never a loss: the code is already on the disk.
 *
 *  `closed` is a version not to mention. Nothing sets one any more, since the
 *  row that could be closed is gone; both callers pass an empty string. */
export function announcesUpdate(
  state: UpdateState | null | undefined,
  at: { walking: boolean; closed: string },
): boolean {
  if (at.walking) return false;
  // WHILE IT REBUILDS THE CARD STAYS. On a copy run from source the restart
  // takes about a minute, and a card that vanished the moment Restart was
  // pressed would read as the press doing nothing.
  if (!state?.ready && !state?.installing) return false;
  return !(at.closed && at.closed === (state.newVersion ?? ''));
}

// THE WORDS, IN ONE PLACE. No "click here", no key, no metaphor: the sentence
// says what pressing it costs, which is the only part she cannot work out by
// looking.
export const SAY = {
  restart: 'Restart to update',
  installing: `Updating. ${NAME} restarts by itself in about a minute.`,
} as const;

/**
 * WHAT CHANGED, for a copy run from source (main/source-updater.mjs): the
 *  commits' own first lines, newest first, and how many more there are. An
 *  installed app has no titles and gets an empty list. */
export function changeLines(state: Pick<UpdateState, 'changes' | 'behind'> | null | undefined): string[] {
  const changes = state?.changes ?? [];
  if (!changes.length) return [];
  const more = (state?.behind ?? changes.length) - changes.length;
  return more > 0 ? [...changes, `and ${more} more`] : [...changes];
}

/**
 * WHETHER THE SIDEBAR'S UPDATE CARD HAS BEEN SHRUNK TO ONE LINE
 *  (components/SidebarUpdate.tsx). Kept across versions on purpose: changes
 *  land several times a day, and a card that came back for each one would be
 *  the thing that was shrunk. Storage that is missing or refuses reads as the
 *  card, which is the default. */
export const UPDATE_SMALL_KEY = 'zero.updateSmall';

type SmallStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined;
const windowStore = (): SmallStore => (typeof localStorage === 'undefined' ? undefined : localStorage);

export function readUpdateSmall(store: SmallStore = windowStore()): boolean {
  try { return store?.getItem(UPDATE_SMALL_KEY) === '1'; } catch { return false; }
}

export function writeUpdateSmall(store: SmallStore, small: boolean): void {
  try {
    if (small) store?.setItem(UPDATE_SMALL_KEY, '1');
    else store?.removeItem(UPDATE_SMALL_KEY);
  } catch { /* the choice is not kept this time; the screen still changes */ }
}
