// PURE. WHICH TURN AN AGENT'S OPTIONS BELONG TO, and whether they are still a
// question.
//
// The options used to be drawn in a slot above the reply box, which is a
// sibling of the scroll, so they stood at the foot of every thread that had
// ever asked one for as long as it was open, however far the conversation had
// moved past them. Said 2026-10-05: "it should instead occur at the end
// of the turn/message where it occured, not stuck at the bottom... Once I've
// seen it as a user, I don't really want to see it continuously. It's been
// processed."
//
// So the strip needs two facts it never needed while it was docked, and they
// are both here rather than in the component, because what is MISSING from
// this decision has no symptom: a block drawn on the wrong turn, or drawn as a
// live question after it was answered, renders perfectly happily.
//
//   WHICH TURN. The offer comes off one field of the row (`optionsFrom`: the
//   result, else the checkpoint, else the ask), and the conversation draws that
//   same field as a message. So the turn that carries the offer is the turn
//   whose words ARE that field, compared whole. Nothing is matched on the
//   options list alone, because a thread can hold an older round's list and
//   matching on it would print a second question in the middle of the page.
//
//   WHETHER IT IS STILL A QUESTION. That rule already exists and is not
//   re-decided here: `offerIsLive` says an offer written after your last word is
//   live and one you have spoken since is spent. Pressing a number and typing a
//   sentence are the same thing to it, which is the answer to the case this row
//   had to decide: a question you scrolled past and replied to in prose is
//   processed.
//
// WHAT IS NEW IS THAT A SPENT OFFER IS STILL DRAWN. It used to vanish, so the
// thread lost the record of what was actually on the table when it was
// answered. It stays on its turn as a record, not a control, with the one that
// was pressed marked; `picked` is that number, and null for a typed answer.
import { itemOptions, offerIsLive, optionsFrom, type ParsedOption } from './format';

export interface Offer {
  /** The offering field, whole and unchanged: how a turn is recognised. */
  text: string;
  options: ParsedOption[];
  /** Still waiting on you. False once you have said anything since. */
  live: boolean;
  /** The number you pressed, when that is how you answered it. */
  picked: number | null;
}

interface OfferFields {
  result?: string;
  note?: string;
  body?: string;
  answer?: string;
  wrote?: Record<string, { ts: number } | undefined>;
}

// How a pick is written to the row: `Option 3: Leave it on the branch`
// (App.tsx, `pickOption`). Anchored, so a typed sentence that merely mentions
// an option number is never read as a press.
const PRESSED = /^\s*Option\s+(\d+)\s*:/i;

/** The number you pressed, or null if you typed your answer instead. */
export function pickedOption(item: { answer?: string }): number | null {
  const m = PRESSED.exec(item?.answer ?? '');
  return m ? Number(m[1]) : null;
}

/** The offer on this row, if it made one, however long ago it was answered. */
export function offerFor(item: OfferFields): Offer | null {
  const options = itemOptions(item);
  if (!options.length) return null;
  const text = (item[optionsFrom(item)] ?? '').trim();
  if (!text) return null;
  const live = offerIsLive(item);
  return { text, options, live, picked: live ? null : pickedOption(item) };
}

/**
 * Is this the turn the offer was made on?
 *
 * Whole-text equality, which is the same test the pane already makes when it
 * takes the options list out of the message it is about to draw underneath
 * (`cleanMessage`). The two have to agree: a turn that loses its list without
 * gaining the block would print the question with no way to answer it.
 */
export function offerOnTurn(text: string | undefined | null, offer: Offer | null): boolean {
  return !!offer && !!text && text.trim() === offer.text;
}
