// HOW LONG THE PHONE'S UNDO LASTS, AND HOW LONG THE MAC LEAVES IT ALONE.
//
// The phone takes a send back only while no computer has claimed it
// (renderer/src/phone-send.ts). Her Mac looked for phone sends every five
// seconds and claimed each one on sight, so most of the time the Undo on the
// six-second toast lost the race and read "Your computer already has it".
// Her words, from the phone app (2026-10-29): "Undo isn't working".
//
// So the Mac leaves anything Undo can take back alone for a little longer
// than the toast is up. The margin is for the phone's network round trip.

/** How long the phone's toast, and so its Undo, stays up. */
export const PHONE_UNDO_MS = 6000;
/** How long the Mac leaves a phone send that Undo can take back. */
export const PHONE_UNDO_HOLD_MS = PHONE_UNDO_MS + 2000;
// The kinds the phone's Undo takes back (takeBack in renderer/src/phone-rows.ts).
// A stop, a run-now or an answer to a permission card goes at once.
const UNDOABLE = new Set(['reply', 'new', 'close', 'snooze', 'schedule']);
// A computer clock this far behind the cloud's is wrong, and holding by it
// would hold for as long as it is wrong.
const SKEW_MS = 60_000;

/** Is this phone send still inside its Undo window? */
export function heldForUndo(cmd, now, holdMs = PHONE_UNDO_HOLD_MS) {
  if (!holdMs || !UNDOABLE.has(cmd?.kind)) return false;
  const made = Date.parse(cmd.createdAt ?? cmd.created_at ?? '');
  if (!Number.isFinite(made)) return false;
  const age = now - made;
  return age < holdMs && age > -SKEW_MS;
}
