// PURE. Which approval card is on stage, and whether it is on its way out.
//
// The chord is answered in the MAIN process (it has to outrank the game), so
// the renderer learned nothing at all: the next store push simply arrived with
// one fewer approval and React unmounted the card between two frames. Nothing
// said allowed, nothing said denied, nothing moved.
//
// An exit needs the answered card to keep the stage for a beat after the
// snapshot has already forgotten it, which is what this decides. The rule that
// matters most is the second one: WHILE A CARD IS LEAVING, THE NEXT CARD DOES
// NOT TAKE THE STAGE. A queue that shuffles forward under her hands is the
// whack-a-mole that made one-card-at-a-time necessary in the first place, and
// an exit animation is the exact moment it would happen again.

import { CHORD_ANSWERS, chordLands } from '../../shared/card-settles.mts';

export interface StagedApproval { id: string }

export function approvalClickAllowed(phone: boolean, detail: number, pressed: string | null, target: string): boolean {
  return !phone || detail === 0 || pressed === target;
}

/** Long past a slow answer, and short enough that a person is still looking at the card. */
export const PRESS_WITHIN_MS = 20_000;

/**
 * A press that gets no answer comes back as a refusal that says so, because
 * until it does the card has nothing true to show.
 */
export async function pressWithin<T>(press: () => Promise<T> | undefined, ms = PRESS_WITHIN_MS): Promise<T | { ok: false; error: string } | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      press(),
      new Promise<{ ok: false; error: string }>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, error: 'the app did not answer. Press again' }), ms);
      }),
    ]);
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'it did not go through' };
  } finally {
    clearTimeout(timer);
  }
}

export interface Answered {
  id: string;
  allow: boolean;
}

export interface Stage<T extends StagedApproval> {
  /** The card to draw, or nothing. */
  card: T | null;
  /** Set only while that card is leaving: what she just decided. */
  verdict: 'allow' | 'deny' | null;
  /** How many are queued behind the card on stage. */
  waiting: number;
}

/**
 * @param pending  the approvals in the current snapshot, oldest first
 * @param answered what she just decided, until its animation is done
 * @param leaving  the card that held the stage when she decided; it may already
 *                 be gone from `pending`, and it still has an exit to finish
 */
export function approvalStage<T extends StagedApproval>(
  pending: readonly T[] | null | undefined,
  answered: Answered | null | undefined,
  leaving: T | null | undefined,
  blocked = false,
): Stage<T> {
  if (blocked) return { card: null, verdict: null, waiting: 0 };
  const queue = Array.isArray(pending) ? pending.filter(Boolean) : [];

  // The answered card keeps the stage: still in the snapshot if the push has
  // not landed yet, otherwise the copy we remembered before it went.
  const departing = answered
    ? (queue.find((a) => a.id === answered.id) ?? (leaving?.id === answered.id ? leaving : null))
    : null;

  if (departing) {
    return {
      card: departing,
      verdict: answered!.allow ? 'allow' : 'deny',
      // Everything else is behind it, including whatever is now first in the
      // snapshot: it waits its turn rather than jumping into a leaving card.
      waiting: queue.filter((a) => a.id !== departing.id).length,
    };
  }

  // An answer for a card nobody remembers (a stale event, an app that reloaded
  // mid-animation) is not worth holding an empty stage for.
  const card = queue[0] ?? null;
  return { card, verdict: null, waiting: card ? queue.length - 1 : 0 };
}

/**
 * ⌘1 or ⌘2 (⌘Y or ⌘N still work) as the page heard it, as an answer to the card
 * on screen. Main answers a key the window received and takes it from the page,
 * so this hears only the presses main never saw. A press in the card's first
 * moment answers nothing (shared/card-settles.mts).
 */
/** ⌘3 on a key card in front opens its reply box: the card's id, or null. */
export function cardReplyChord(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }, cardId: string | null, keyCard: boolean, shownAt: number | null = null, now = Date.now()): string | null {
  if (!cardId || !keyCard || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key !== '3') return null;
  return chordLands(shownAt, now) ? cardId : null;
}

export function cardChord(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }, cardId: string | null, shownAt: number | null = null, now = Date.now()): Answered | null {
  if (!cardId || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return null;
  const allow = CHORD_ANSWERS[e.key.toLowerCase()];
  if (allow === undefined || !chordLands(shownAt, now)) return null;
  return { id: cardId, allow };
}
