// READING THE HALF OF AN OPTION THAT IS CUT OFF.
//
// TWO CLAUSES, AND BOTH ARE LOAD-BEARING:
//
// 1. NOTHING MOVES. The strip is 207px today and it is 207px with this built.
//    The card is out of the flow, so the message above it never shrinks and no
//    row under the pointer ever shifts out from under it. That is the whole
//    reason B beat A, which grew the strip to 247px on a long option.
// 2. ONLY WHILE HOVERING. Arrowing the options with the keyboard
//    does NOT open the card, even though the app tracks that selection and the
//    first drawing used it. Hover is a thing the hand does on purpose and
//    stops doing on purpose; keyboard selection moves through every option on
//    the way to the one she wants, and a card that flashes open on each of
//    them is the cognitive overload the design law rejects.
//
// AND ONE RULE THAT FOLLOWS: the card only opens on an option whose
// words are actually cut. About two thirds of options fit in the two lines the
// strip shows, and on those the card would print
// the same sentence she is already reading, one inch higher. Showing it there
// is noise, so it is not shown.

/** What a clamped `.opt-text` measures: what it wants against what it shows. */
export type OptionTextBox = {
  /** `scrollHeight`: the height the whole option wants. */
  scrollHeight: number;
  /** `clientHeight`: the two lines the strip actually gives it. */
  clientHeight: number;
};

/**
 * Whether this option has words the strip is not showing.
 *
 * The 1px slack is not superstition: a line box at 14px/1.45 is 20.3px, so a
 * two-line clamp rounds to a clientHeight that can sit a fraction under the
 * scrollHeight of the very same two lines. Without the slack every option in
 * the store looks clipped and the card opens on all of them.
 */
export function optionIsClipped(box: OptionTextBox): boolean {
  return box.scrollHeight - box.clientHeight > 1;
}

/**
 * Which option the card is open on, given what the pointer is over.
 *
 * Null is the resting state and it is the common one: no pointer on a row, or
 * a pointer on a row that fits. `hovered` is the option number under the
 * pointer, and NOTHING ELSE FEEDS THIS — not the keyboard selection, not the
 * recommended flag. That is clause 2 above, in the one function that decides it.
 */
export function optionPeek(hovered: number | null, clipped: boolean): number | null {
  if (hovered === null) return null;
  return clipped ? hovered : null;
}
