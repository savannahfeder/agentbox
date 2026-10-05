// THE QUESTION, AT THE TOP OF THE STRIP SHE ANSWERS FROM.
//
// It named the control and never the choice, so the one line with the most
// attention on it in the whole pane, sitting directly above three numbered
// answers, said nothing about what was being asked. The ask itself is up in the
// message, and the message SCROLLS while the strip is docked: by the time she
// has read down to the options the sentence they answer is off the top of the
// screen. That is the whole of what she is reporting.
//
// So the heading is the ask now. It comes off the SAME field the options came
// off (`optionsFrom`), which is the field the pane is leading with, so the
// question and its answers can never come from two different rounds.
import { optionsFrom } from './format';
import { clipToSentence } from './list-rules';

// Two lines of the strip's heading, near enough. Wider than the inbox row's 112
// because this line has the whole pane's width and does not have to hold itself
// to one line the way a list does.
export const ASK_BUDGET = 130;

interface AskFields { result?: string; note?: string; body?: string; title?: string }

// A line that is not the ask, whatever else it is: a numbered line is the list
// itself, an image is a picture somebody pasted, a quote is what somebody else
// said. Headings are handled in the loop below, which has to remember them.
function isFurniture(line: string): boolean {
  return /^\s*\d+[.)]\s/.test(line)
    || /^\s*[-*+]\s/.test(line)
    || /^!\[[^\]]*\]\([^)]*\)$/.test(line)
    || /^>/.test(line)
    || /^([-*_]\s*){3,}$/.test(line);
}

// Markdown down to the words. The strip draws this as plain text, so a stray
// `**` or a link's URL would read as punctuation she has to look past.
function words(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// The two sections that are never the ask. "Where we were" is the recap the
// question format allows, and a recap is the one thing a reader has asked us
// not to lead with: an answer, not the state of their own replies. "Gist" is a
// heading old workers wrote above their first paragraph, which the pane already
// strips out of the message itself.
const RECAP_HEAD = /where we were|^\s*gist\s*$/i;

// THE WHOLE SENTENCE, BEFORE THE BUDGET TOUCHES IT.
//
// `askLine` below is this, clipped. They are one walk over the message so the
// two can never disagree about which sentence the ask even is: the card that
// opens on hover has to be the same words she is already half-reading, or it
// reads as a different message rather than the rest of this one.
export function askFull(item: AskFields): string {
  const text = item[optionsFrom(item)] ?? '';
  // THE TITLE IS ALREADY ON THE SCREEN and stays there: it sits in the band
  // above the scroll rather than in it, so that scrolling down cannot cost her
  // the name of the task. Repeating it two inches lower would spend this line
  // saying what she can already read. On a message written as one paragraph
  // the title is a label cut FROM the body (message-split.ts), which is exactly
  // how that repeat would happen.
  const label = (item.title ?? '').replace(/…$/, '').trim();
  let under = '';
  for (const raw of text.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    if (/^#{1,4}\s/.test(line)) { under = line.replace(/^#{1,4}\s*/, ''); continue; }
    if (isFurniture(line) || RECAP_HEAD.test(under)) continue;
    if (label && line.startsWith(label)) line = line.slice(label.length).trim();
    // A bold opening is the ask by convention (briefs/worker.md: line one is
    // the thing she has to say back, in bold). When the paragraph carries more
    // after it, the bold part alone is the question and the rest is context.
    const bold = line.match(/^\*\*(.+?)\*\*/);
    const said = words(bold ? bold[1] : line);
    if (!said) continue;
    return said;
  }
  return '';
}

export function askLine(item: AskFields): string {
  return clipToSentence(askFull(item), ASK_BUDGET);
}

/**
 * Whether the strip is showing her less than the whole question.
 *
 * TWO WAYS TO LOSE WORDS HERE, AND ONLY ONE OF THEM IS VISIBLE TO THE DOM.
 * `clipToSentence` cuts the string at 130 characters before it is ever
 * rendered, and the result fits the two-line clamp comfortably, so a heading
 * that has already lost half its sentence measures as not clipped. Measured
 * across her fifteen ledgers on 2026-08-29: of 450 rows that draw an offer,
 * 303 have their ask cut by the 130 budget, at a median length of 263
 * characters. Reading the box alone would have opened the card on almost none
 * of them.
 *
 * The box still has to be read, because the clamp cuts a SECOND time on a
 * narrow pane: a 128-character ask survives the budget and still wants three
 * lines. Either cut is words she cannot see, and either one opens the card.
 *
 * `box` is null when nothing has been measured yet, which is the string test
 * on its own rather than a guess at the layout.
 */
export function askIsClipped(
  shown: string,
  full: string,
  box: { scrollHeight: number; clientHeight: number } | null,
): boolean {
  if (!shown) return false;
  if (full.length > shown.length) return true;
  return !!box && box.scrollHeight - box.clientHeight > 1;
}
