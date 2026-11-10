// A KEY PRESSED IN THE FIRST MOMENT A PERMISSION CARD IS UP WAS AIMED AT WHAT
// WAS THERE BEFORE IT. ⌘1 allows, and a card that slid in under a hand already
// on its way to a key must not take that press as a yes. The same length as a
// number's settle on a thread the app moved you to (renderer/src/pick-settles.ts).

export const CARD_SETTLES_MS = 800;

/** The answer each chord gives the card in front, by the key's lower-case name. ⌘Y and ⌘N stay as quiet aliases. */
export const CHORD_ANSWERS: Readonly<Record<string, boolean>> = Object.freeze({ 1: true, 2: false, y: true, n: false });

/** Whether a chord pressed at `now` answers a card first drawn at `shownAt` (null: not known, so it does). */
export const chordLands = (shownAt: number | null | undefined, now: number): boolean => shownAt == null || now - shownAt >= CARD_SETTLES_MS;
