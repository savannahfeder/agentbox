// PURE. WHAT EACH BUTTON ON THE FORMATTING BAR DOES TO THE TEXT IN THE BOX.
//
// Drawing A of the messages redesign (w-2e8aa16f0f) puts a bar under the reply
// box in a chat: bold, italic, strike, link, lists, quote, code. A message is
// markdown and always has been — the thread renders it — so every one of these
// writes the markdown somebody would have typed, and pressing one on a
// selection you already wrapped unwraps it again.
//
// It is a module of its own rather than a handler inside the composer for the
// usual reason: where the caret ends up is the whole of whether a formatting
// button is usable, and there is no symptom for getting it wrong. A bold button
// that wraps the right characters and leaves the caret outside the asterisks
// makes everything typed next bold-and-then-not.

export type Format = 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'bullet' | 'number' | 'quote';

export interface Boxed {
  text: string;
  /** Where the selection sits afterwards, so the caret lands inside the marks. */
  from: number;
  to: number;
}

// The pair each one wraps a selection in. A list and a quote are not pairs:
// they open each line, and are handled below.
const WRAPS: Record<string, [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strike: ['~~', '~~'],
  code: ['`', '`'],
};

// What each line-led format puts at the front of every line it touches.
const LEADS: Record<string, (n: number) => string> = {
  bullet: () => '- ',
  number: (n) => `${n + 1}. `,
  quote: () => '> ',
};

// The words that stand in for a selection that is not there, so pressing bold
// on an empty box leaves something to type over rather than four bare asterisks.
const STANDS_IN: Record<Format, string> = {
  bold: 'bold text', italic: 'italic text', strike: 'strike', code: 'code',
  link: 'text', bullet: 'item', number: 'item', quote: 'quote',
};

/** The lines a selection covers, grown out to whole lines at either end. */
function lineSpan(text: string, from: number, to: number) {
  const start = text.lastIndexOf('\n', from - 1) + 1;
  const ended = text.indexOf('\n', to);
  return { start, end: ended === -1 ? text.length : ended };
}

export function applyFormat(text: string, from: number, to: number, what: Format): Boxed {
  const picked = text.slice(from, to);

  // A LINK IS THE ONE THAT IS NOT A WRAP. The words go in the brackets and the
  // caret lands in the parentheses, because the address is the part nobody has
  // yet: that is the whole reason this button exists rather than typing it.
  if (what === 'link') {
    const words = picked || STANDS_IN.link;
    const made = `[${words}]()`;
    const at = from + made.length - 1;
    return { text: text.slice(0, from) + made + text.slice(to), from: at, to: at };
  }

  const lead = LEADS[what];
  if (lead) {
    const { start, end } = lineSpan(text, from, to);
    const block = text.slice(start, end) || STANDS_IN[what];
    const lines = block.split('\n');
    // ALREADY LED ON EVERY LINE MEANS TAKE IT OFF. A list button that only ever
    // adds leaves no way back except deleting characters one at a time.
    const marks = lines.map((_, n) => lead(n));
    const on = lines.every((line, n) => line.startsWith(marks[n]));
    const out = lines.map((line, n) => (on ? line.slice(marks[n].length) : marks[n] + line)).join('\n');
    return { text: text.slice(0, start) + out + text.slice(end), from: start, to: start + out.length };
  }

  const [open, close] = WRAPS[what];
  // ALREADY WRAPPED MEANS UNWRAP, whether the marks are inside the selection or
  // just outside it: both are what somebody means by pressing bold on bold text.
  if (picked.startsWith(open) && picked.endsWith(close) && picked.length >= open.length + close.length) {
    const bare = picked.slice(open.length, picked.length - close.length);
    return { text: text.slice(0, from) + bare + text.slice(to), from, to: from + bare.length };
  }
  const before = text.slice(from - open.length, from);
  const after = text.slice(to, to + close.length);
  if (picked && before === open && after === close) {
    const cut = from - open.length;
    return { text: text.slice(0, cut) + picked + text.slice(to + close.length), from: cut, to: cut + picked.length };
  }
  const words = picked || STANDS_IN[what];
  const made = open + words + close;
  return {
    text: text.slice(0, from) + made + text.slice(to),
    from: from + open.length,
    to: from + open.length + words.length,
  };
}

/**
 * Drop something in at the caret: an @ for a name, or an emoji. It replaces a
 * selection the way typing would, and leaves the caret after what it put in.
 */
export function insertAt(text: string, from: number, to: number, what: string): Boxed {
  const at = from + what.length;
  return { text: text.slice(0, from) + what + text.slice(to), from: at, to: at };
}
