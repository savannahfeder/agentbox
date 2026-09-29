// WHAT THE NEW TASK CARD'S FOOTER SHOWS AT REST.
//
// Her pick on, 2026-08-20, verbatim:
//
//   "I think the hover is definitely the winner. Once you've added something
//   beyond the project, everything that was shown on hover should still remain
//   but it should only have that different color background when you hover.
//
//   Note that I got things mistaken. It shouldn't always show the priority. It
//   should always show the project, so that's a default thing to show, and
//   whenever you hover over that area it should then show the other options."
//
// AND THEN SHE TESTED IT, same item, same day, with a screenshot of a brand new
// card sitting there fully open:
//
// Both halves of that are answered here, and they killed one rule each.
//
// 1. THE WASH IS GONE. There is no different background, on hover or ever.
//    Hover ADDS THE WORDS and does nothing else. This reverses the second
//    sentence of her earlier pick, which is allowed because she is the one
//    reversing it, and it is why `footerIsWashed` no longer exists rather than
//    being left returning false: a hook nobody may use is a hook someone
//    reconnects.
//
// 2. "BEYOND THE PROJECT" MEANS SOMETHING SHE DID ON THIS CARD. That is the
//    bug in her screenshot. The card remembers her last level and her last
//    model on purpose (../priority.ts, ../models.ts, both her asks), so a card
//    she has not touched opens already reading "Urgent priority." — and the
//    old rule read that as a level she had set, held the whole sentence open
//    from the first frame, and there was nothing left for the hover to reveal.
//    A remembered value is the card's memory, not a move; only a change she
//    makes here counts.
//
// So there is exactly one question left, and this file answers it without
// rendering anything: is the whole sentence showing? Yes while the pointer is
// on the footer, yes while one of its menus is open, and yes forever after once
// she changes something beyond the project ON THIS CARD. That last clause is
// what makes it a control rather than a trick: the moment the card stops being
// ordinary it stops hiding, and it stays that way while the card lives.
//
// The resting clause is the PROJECT, which is her correction: the card used to
// show "Medium priority." at rest and she does not want the level out front.
// When there is only one project the card draws no project clause at all
// (Compose.tsx has always done that: with one project there is nothing to
// choose), and a footer showing nothing at all is a control nobody finds, so
// the level takes the resting slot in that one case.

export interface FooterFacts {
  /** The pointer is somewhere on the footer. */
  hovered: boolean;
  /** One of the footer's own menus is open, so the line must not collapse. */
  menuOpen: boolean;
  /**
   * She moved the level ON THIS CARD, away from whatever it opened carrying.
   * NOT "a level is set": the card opens on her last one by design, and
   * reading that as a choice is what made her new card open with nothing left
   * to reveal.
   */
  priorityChanged: boolean;
  /**
   * A start time or a repeat rule is set. Value based rather than change
   * based, and the difference is honest rather than sloppy: nothing sticks a
   * schedule across cards, so a clock reading anything but "Starts now" can
   * only be this card's doing, whether she picked it from the menu or typed
   * the phrase into the message.
   */
  whenSet: boolean;
  /** She moved the model ON THIS CARD. Sticky, so the same rule as the level. */
  modelChanged: boolean;
  /**
   * She moved the effort ON THIS CARD. It lives inside the model drawer and is
   * remembered across cards exactly like the model, so the same rule: a
   * remembered level is the card's memory, a change here is hers.
   */
  effortChanged: boolean;
  /** The card is drawing a project clause, which needs more than one project. */
  hasProjectClause: boolean;
}

/** Anything she changed that is not the project. */
export function beyondTheProject(f: FooterFacts): boolean {
  return f.priorityChanged || f.whenSet || f.modelChanged || f.effortChanged;
}

/** Every clause visible, whether or not the pointer is here. */
export function footerIsOpen(f: FooterFacts): boolean {
  return f.hovered || f.menuOpen || beyondTheProject(f);
}

/** The one clause that never hides. */
export function restingClause(f: FooterFacts): 'project' | 'priority' {
  return f.hasProjectClause ? 'project' : 'priority';
}
