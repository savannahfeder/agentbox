// PURE. WHAT "REPLY" PUTS IN THE BOX.
//
// A conversation between two people has no sub-threads to open, so Reply on one
// message means the thing people already do by hand: quote it, and write under
// the quote. Drawing A (w-2e8aa16f0f) puts the action on the message; this is
// what pressing it leaves behind in the reply box.
//
// THE QUOTE IS SHORT ON PURPOSE. The message being replied to is on the screen
// directly above the box. Quoting six findings back at their author fills the
// box with text nobody will read and pushes what they are about to type off the
// bottom, so it takes the opening lines and says how much it left.

/** How much of a message a quote carries before it says there was more. */
export const QUOTE_LINES = 3;

export function quoteOf(text: string, limit = QUOTE_LINES): string {
  const lines = (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const kept = lines.slice(0, limit).map((l) => `> ${l}`);
  // The rest counted rather than cut silently: the difference between a short
  // quote and a message that looks like it only said three lines.
  if (lines.length > limit) kept.push(`> …${lines.length - limit} more line${lines.length - limit === 1 ? '' : 's'}`);
  return kept.join('\n');
}

/**
 * The draft after pressing Reply on a message. The quote goes ABOVE whatever is
 * already typed, with a blank line between, so a half-written sentence is never
 * cut in two by it and the caret has somewhere obvious to go. Quoting the same
 * message twice adds nothing: a double press is a slip, not a request for two
 * copies.
 */
export function withQuote(draft: string, text: string, limit = QUOTE_LINES): string {
  const quote = quoteOf(text, limit);
  if (!quote) return draft;
  const had = draft ?? '';
  if (had.includes(quote)) return had;
  return had.trim() ? `${quote}\n\n${had}` : `${quote}\n\n`;
}
