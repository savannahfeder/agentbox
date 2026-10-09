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
import { NAME, Name } from '../../shared/product-name.mjs';

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

// ASKING NOW, RATHER THAN WAITING FOR THE CLOCK (w-39d6c237f7, 2026-10-07).
// "A way to pull a new version on demand, as many apps do, instead of waiting
// for the automatic check." The words below are the whole of what the button
// and its row say, in one place because three surfaces say them: the Settings
// row, its button, and the answer ⌘K puts in a toast.
export const CHECK_SAY = {
  /** The button, when pressing it means look now. */
  check: 'Check for updates',
  /** And while it is looking, downloading, or rebuilding: nothing to press. */
  checking: 'Checking',
  downloading: 'Downloading',
  updating: 'Updating',
  looking: 'Looking for a new version.',
  /** Before the first check of the run has answered. */
  idle: `${Name} looks for a new version on its own.`,
  current: `${Name} is up to date.`,
  /** The check came back with no phase and no reason, which should not happen. */
  unknown: 'Could not check for updates.',
} as const;

/**
 * WHAT THE SCREEN SAYS IT FOUND, AND WHAT THE BUTTON SAYS.
 *
 *  One function for the whole of it, because the alternative is each surface
 *  working the phases out again. The automatic check is SILENT when it fails
 *  (point 2 at the top of main/updater.mjs), so these sentences are the only
 *  place a person ever learns why: `error` and `unsupported` carry main's own
 *  reason through untouched, and neither may read as a healthy check.
 *
 *  `checking` is the press that has not answered yet. The phase on disk is
 *  still whatever the last check left, and a row that went on saying "up to
 *  date" for the second the request takes would read as the button doing
 *  nothing.
 *
 *  THE TWO KINDS OF COPY DIFFER IN ONE PLACE ONLY: an installed app has a
 *  version number and comes back in seconds; a copy run from a checkout
 *  (main/source-updater.mjs) has a count of changes and rebuilds for about a
 *  minute. Both are `ready`.
 */
export type UpdateLook = {
  /** What it found, one sentence. */
  sentence: string;
  /** The button's words. */
  button: string;
  /** Pressing it restarts onto the new version rather than looking again. */
  restart: boolean;
  /** Nothing to press: a check, a download or a rebuild is under way. */
  busy: boolean;
};

export function updateLook(
  state: UpdateState | null | undefined,
  { checking = false }: { checking?: boolean } = {},
): UpdateLook {
  const installing = !!state?.installing;
  const phase = checking && !installing ? 'checking' : (state?.phase ?? 'idle');
  const ready = phase === 'ready';
  const source = !!state?.source;
  const busy = phase === 'checking' || phase === 'downloading' || installing;
  const button = ready ? SAY.restart
    : installing ? CHECK_SAY.updating
    : phase === 'checking' ? CHECK_SAY.checking
    : phase === 'downloading' ? CHECK_SAY.downloading
    : CHECK_SAY.check;
  return { sentence: sentenceFor(phase, state, source), button, restart: ready, busy };
}

function sentenceFor(phase: string, state: UpdateState | null | undefined, source: boolean): string {
  // THE REBUILD FIRST, because a copy run from source is `installing` with
  // `ready` still just behind it, and the press has to be seen to have landed.
  if (state?.installing) return SAY.installing;
  if (phase === 'ready') {
    // A RESTART THAT DID NOT FINISH KEEPS ITS OWN WORDS. The sidebar card says
    // this; the row says it the same way, because it is the same failure.
    if (state?.error) return `${state.error.replace(/\.?$/, '.')} Pressing it again tries again.`;
    const how = source ? 'Restarting takes about a minute.' : 'Restarting takes a few seconds.';
    const what = source
      ? (typeof state?.behind === 'number' && state.behind > 0
        ? `${state.behind} new ${state.behind === 1 ? 'change' : 'changes'}.`
        : 'A new version is ready.')
      : (state?.newVersion ? `Version ${state.newVersion} has downloaded.` : 'A new version has downloaded.');
    return `${what} ${how}`;
  }
  if (phase === 'downloading') {
    return typeof state?.percent === 'number'
      ? `Downloading the new version, ${state.percent}%.`
      : 'Downloading the new version.';
  }
  if (phase === 'checking') return CHECK_SAY.looking;
  if (phase === 'current') return CHECK_SAY.current;
  // MAIN'S OWN REASON, UNTOUCHED. `shortError` in main/updater.mjs and `SAY` in
  // main/source-updater.mjs are both already sentences a person can read.
  if (phase === 'error' || phase === 'unsupported') return state?.error || CHECK_SAY.unknown;
  return CHECK_SAY.idle;
}

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
 * THE VERSION WHOSE SIDEBAR CARD WAS CLOSED WITH ITS ×
 *  (components/SidebarUpdate.tsx). Closing is for that version only: the next
 *  restart installs it anyway, and a newer one brings the card back. Kept
 *  across restarts, so a card closed this morning stays closed after lunch.
 *  Storage that is missing or refuses reads as nothing closed. */
export const UPDATE_CLOSED_KEY = 'zero.updateClosed';

type ClosedStore = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
const windowStore = (): ClosedStore => (typeof localStorage === 'undefined' ? undefined : localStorage);

export function readUpdateClosed(store: ClosedStore = windowStore()): string | null {
  try { return store?.getItem(UPDATE_CLOSED_KEY) || null; } catch { return null; }
}

/** A version the app could not name is not kept: closing it lasts this run. */
export function writeUpdateClosed(store: ClosedStore, version: string): void {
  if (!version) return;
  try { store?.setItem(UPDATE_CLOSED_KEY, version); } catch { /* closed for this run only */ }
}

/** Whether `closed` hides this card. Never while a restart is under way: the
 *  card saying "Updating" is how a press is seen to have done something. */
export function closedHere(update: { installing: boolean; version?: string | null }, closed: string | null): boolean {
  return !update.installing && closed !== null && closed === (update.version ?? '');
}
