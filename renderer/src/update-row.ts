// THE ROW THAT SAYS A NEW AGENTBOX IS WAITING, AND WHAT IT SAYS WHEN SHE OPENS
// IT.
//
// Four ways of announcing it were drawn in her own inbox and photographed
// (designs//four-ways/index.html). She picked this one, 2026-08-29:
//
// SO IT IS NOT A BANNER AND IT IS NOT A TOAST. It is a WorkItem, built here,
// dropped into the inbox, and from that point on the list, the selection, the
// keys and the reading pane do not know it is different. That is the move
// `trouble-row.ts` already makes, for the same reason: an inbox is what this
// product is, and a thing that wants her attention and does not land in the
// list is the one exception she would have to learn.
//
// WHAT IT MAY NOT DO is write. There is no ledger with a row called `update` in
// it, so `isUpdateRow` is what every action path checks before it tries,
// exactly as `isTroubleRow` is checked beside it.
//
// AND SAYING NO THROWS NOTHING AWAY.Closing the row hides the ROW, for this
// version only. The download stays on the disk, Settings > General still says
// "Restart to update", and ⌘K still carries it. There is no verb anywhere in
// this app that discards an update.

import type { UpdateState, WorkItem } from './types';
import { NAME } from '../../shared/product-name.mjs';

/** The one id this row ever has. It is not in any ledger and never will be. */
export const UPDATE_ID = 'update';

export function isUpdateRow(i: { id?: string } | null | undefined): boolean {
  return !!i && i.id === UPDATE_ID;
}

/**
 * WHETHER THE APP MENTIONS THE NEW VERSION AT ALL RIGHT NOW.
 *
 *  One question, one answer, because two screens ask it: the inbox builds the
 *  row from it and ⌘K offers "Restart to update the app" from it. Two copies of
 *  this rule is how the row disappears from one surface and stays on the other.
 *
 * NOT DURING THE WALK.
 *
 *  The walk is a made list with one row in it at a time, and every sentence on
 *  the screen points at that row. `walkRows` in ./onboarding.ts already holds
 *  everything else back for exactly that reason, and it holds back the LEDGER,
 *  which this row is not in. So the veto has to be stated here or the one row
 *  the app builds by itself walks straight through it. It is a delay and never
 *  a loss: the download is already on the disk, the walk ends, and the row is
 *  in her inbox on the next draw.
 *
 *  `closed` is the version she has already pressed E on, and an empty string
 *  means she has closed none. */
export function announcesUpdate(
  state: UpdateState | null | undefined,
  at: { walking: boolean; closed: string },
): boolean {
  if (at.walking) return false;
  // WHILE IT REBUILDS THE ROW STAYS. On a copy run from source the restart
  // takes about a minute, and a row that vanished the moment Restart was
  // pressed would read as the press doing nothing.
  if (!state?.ready && !state?.installing) return false;
  return !(at.closed && at.closed === (state.newVersion ?? ''));
}

// THE WORDS, IN ONE PLACE, because the row, the pane and Settings all say them
// and three vocabularies for one fact is how a person stops trusting any of
// them. No "click here", no key, no metaphor: the sentence says what pressing
// it costs, which is the only part she cannot work out by looking.
export const SAY = {
  ready: `A new version of ${NAME} is ready`,
  how: `Restart ${NAME} when you are ready. It has already downloaded, restarting takes a few seconds and puts you back where you were.`,
  restart: 'Restart to update',
  // A COPY RUN FROM SOURCE rebuilds before it comes back, so "a few seconds"
  // would be untrue there (main/source-updater.mjs).
  howSource: `Restart ${NAME} when you are ready. The new code has already downloaded. Restarting rebuilds the app first, takes about a minute, and puts you back where you were.`,
  installing: `Updating. ${NAME} restarts by itself in about a minute.`,
  changed: 'What changed:',
  retry: 'The last try did not finish, so nothing restarted. Pressing Restart tries again.',
} as const;

/** The label the row wears while it rebuilds, so the button can say so. */
const INSTALLING = 'installing';

export function updateInstalling(item: { labels?: string[] } | null | undefined): boolean {
  return !!item?.labels?.includes(INSTALLING);
}

/**
 * Which versions, when there are two of them to name. Undefined rather than a
 *  guess when the app has not told us yet: a version number invented on this
 *  side is worse than no version number. */
export function versionLine(state: UpdateState | null | undefined): string | null {
  const now = state?.currentVersion;
  const next = state?.newVersion;
  if (!now) return null;
  return next && next !== now ? `You are on ${now}. The new one is ${next}.` : `You are on ${now}.`;
}

/**
 * WHAT OPENING IT SHOWS HER. The row's own sentence leads, because the row and
 *  the pane must open with the same words or she reads one message in the list
 *  and a different one when she opens it. The versions come under it, where the
 *  grey notes go: they are the one thing here for somebody who already knows
 *  what a version number is. */
export function updateBody(state: UpdateState | null | undefined): string {
  const v = versionLine(state);
  if (!state?.source) return v ? `${SAY.how}\n\n${v}` : SAY.how;
  // A COPY RUN FROM SOURCE says what changed, because its versions are commit
  // ids and a commit id tells a person nothing. The titles are the commits'
  // own first lines, newest first.
  const parts: string[] = [SAY.howSource];
  if (state.error) parts.push(`${SAY.retry} ${state.error}`);
  const changes = state.changes ?? [];
  if (changes.length) {
    const more = (state.behind ?? changes.length) - changes.length;
    const list = changes.map((c) => `- ${c}`);
    if (more > 0) list.push(`- and ${more} more`);
    parts.push(`${SAY.changed}\n\n${list.join('\n')}`);
  }
  if (v) parts.push(v);
  return parts.join('\n\n');
}

/**
 * THE ROW ITSELF, in the shape everything downstream already reads.
 *
 *  BOTH TIMES ARE WHEN THE DOWNLOAD FINISHED (`readyAt`, main/updater.mjs), not
 *  when the row was built, for the reason the trouble row states: the right end
 *  of a row answers "how old is this", and an update that came down at lunchtime
 *  should say lunchtime rather than "now" on every redraw.
 *
 *  `priority` stays at the middle and `product` is empty. This is about the app
 *  and not about any one product's work, and an empty `productName` draws
 *  nothing in the column that would name one. */
export function updateRow(state: UpdateState | null | undefined, now = Date.now()): WorkItem {
  const at = state?.readyAt ?? now;
  return {
    id: UPDATE_ID,
    product: '',
    productName: '',
    status: 'open',
    title: SAY.ready,
    body: updateBody(state),
    kind: 'update',
    labels: state?.installing ? [INSTALLING] : [],
    priority: 5,
    epoch: 0,
    claim: null,
    createdAt: at,
    updatedAt: at,
  };
}
