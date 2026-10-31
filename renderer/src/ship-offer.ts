// PURE. THE DECISION A FINISHED RUN LEFT BEHIND, WHEN THE RUN OFFERED NONE.
//
// An offer is read off the agent's own words and nowhere else (./format), so
// whether finished work can be shipped from its thread comes down to whether
// that run remembered to write an Options section. One that forgot leaves its
// commits on a branch with no way out of the thread but a typed sentence.
//
// The app already knows what it asks here: the file the supervisor writes when
// a worker exits says the run left a change (../change-figures), and the row
// says nothing has happened to it since.
//
// IT IS A FLOOR, NOT A POLICY. An agent that offers its own pick keeps it,
// whatever it says, because its words know what the run did and these do not.
//
// AND THE CHANGE ALONE IS NOT ENOUGH TO PICK THE WORDS WITH. It says what a
// run touched and never said whether any of it reached a commit, so the offer
// read the same over a branch with a commit on it, over loose edits nobody
// committed, and over work that had just been thrown away. The folder is read
// when the run ends (main/git-change.mjs) and `shipOfferFor` below answers off
// that; `shipOfferLive` is unchanged and still decides whether the app asks at
// all.
import { offerIsLive, type ParsedOption } from './format';

/** The label the ship queue takes a thread by (main/ship-queue.mjs). */
export const SHIP_LABEL = 'ship';

export const SHIP_ASK = 'Ship this change?';

/** Answered the way the agents' own ship offers are, in their words. */
export const SHIP_OFFER: ParsedOption[] = [
  { n: 1, text: 'Ship it', recommended: true },
  { n: 2, text: 'Discard the change', recommended: false },
];

// Shipping pushes a branch, so over loose edits "Ship it" would have shipped
// nothing at all (F-79).
export const NOT_COMMITTED_ASK = 'This change was never committed.';
export const COMMIT_FIRST_OFFER: ParsedOption[] = [
  { n: 1, text: 'Commit it and ship', recommended: true },
  { n: 2, text: 'Discard the change', recommended: false },
];

// AND A COMMIT NEEDS A NAME AND AN EMAIL (F-139). A new user's first task
// ended on "Commit it and ship (recommended)" drawn under the agent's own
// "What name and email should I use for the commit?", and no press on the card
// could answer that. So where git cannot name an author the recommended press
// is the one that supplies one: it opens the reply box with its own words in
// it and they type the name and email under them (./format.ts, needsYourWords),
// which is how "Change something first" already works.
export const NAME_YOURSELF_ASK = 'Git does not know who you are, so this change was never committed.';
export const NAME_YOURSELF_OFFER: ParsedOption[] = [
  { n: 1, text: 'Commit it and ship, as the name and email below', recommended: true },
  { n: 2, text: 'Discard the change', recommended: false },
];

/**
 * What the folder a run worked in holds, as the saved change records it
 * (main/git-change.mjs). Null on any of them is "could not be read", which is
 * every product with no repository.
 */
export interface Standing {
  committed: boolean | null;
  uncommitted: boolean | null;
  knowsYou: boolean | null;
}
export const UNREAD: Standing = { committed: null, uncommitted: null, knowsYou: null };

/** The standing off a saved change. Anything that is not a yes or a no on the
 *  file is unread, never a guess. */
export function standingFrom(change: unknown): Standing {
  const c = change as { committed?: unknown; uncommitted?: unknown; knowsYou?: unknown } | null | undefined;
  if (!c || typeof c !== 'object') return UNREAD;
  const flag = (v: unknown) => (typeof v === 'boolean' ? v : null);
  return { committed: flag(c.committed), uncommitted: flag(c.uncommitted), knowsYou: flag(c.knowsYou) };
}

/**
 * The offer itself, or null when the folder holds nothing to ask about.
 *
 * Nothing committed and nothing loose is a thread whose change was discarded:
 * there is no decision left in it, and "Ship it (recommended)" over that was
 * F-83.
 *
 * `headed` is whether the ask is drawn over the options on the one-at-a-time
 * page, where the agent's own question is already the page's headline. Only
 * the offer that SAYS something does: a run that ended on "Ship the conversion
 * and test?" with "Ship this change?" printed under it is the same question
 * twice.
 */
export function shipOfferFor(stands: Standing): { ask: string; options: ParsedOption[]; headed: boolean } | null {
  if (stands.committed === false && stands.uncommitted === false) return null;
  if (stands.committed === false && stands.uncommitted === true) {
    return stands.knowsYou === false
      ? { ask: NAME_YOURSELF_ASK, options: NAME_YOURSELF_OFFER, headed: true }
      : { ask: NOT_COMMITTED_ASK, options: COMMIT_FIRST_OFFER, headed: true };
  }
  return { ask: SHIP_ASK, options: SHIP_OFFER, headed: false };
}

interface Finished {
  status?: string;
  labels?: string[];
  result?: string;
  note?: string;
  body?: string;
  answer?: string;
  wrote?: Record<string, { ts: number } | undefined>;
}

const at = (item: Finished, field: string) => item.wrote?.[field]?.ts ?? 0;

/**
 * Whether the app asks on this thread's behalf. `change` is whether the run
 * left one (the figures the pane already reads), `running` whether anything is
 * still going on the row.
 */
export function shipOfferLive(item: Finished, { change, running }: { change: boolean; running: boolean }): boolean {
  if (!change || running) return false;
  // A thread you have finished with is yours, and a thread already waiting on
  // the ship queue is not asking anybody anything.
  if (item.status === 'done') return false;
  if ((item.labels ?? []).includes(SHIP_LABEL)) return false;
  // A result is written when a worker exits, so it is also how the pane knows
  // the run ended at all.
  if (!(item.result ?? '').trim()) return false;
  // AND IT IS THE NEWEST WORD ON THE ROW, which is the one test that covers
  // all of: it has shipped (the queue writes its note after), its ship failed
  // (the same), and you have already answered it (a run is on its way).
  if (at(item, 'result') < at(item, 'note') || at(item, 'result') < at(item, 'answer')) return false;
  return !offerIsLive(item);
}
