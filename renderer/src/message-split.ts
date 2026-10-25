// PURE. How the typed message becomes a work item's title and body.
//
// NOTHING SHE TYPES MAY BE DROPPED, and for a long time something was. The
// title was `firstLine.trim.slice(0, 180)` and the overflow went NOWHERE: the
// body was built from the lines AFTER the first, so a message written as one
// paragraph lost everything past character 180 and no copy of it was kept
// anywhere. In a real store close to half the directives hit that cap, most
// of them cut mid-word.
//
// The rule now: THE TITLE IS A LABEL, THE BODY IS THE MESSAGE.
//
//   The first line fits a title.  The title is that line.
//   It does not fit.              The title is clipped at a sentence, the same
//                                 way the row's summary already is.
//
// The label may lose words; the message never does.
//
// AND THE FIRST LINE IS ONLY TAKEN OUT OF THE BODY WHEN A BLANK LINE SETS IT
// APART, the way a subject and a commit message's summary are set apart. A
// pasted stack trace has no blank line in it, so lifting its first line left
// the thread opening on "at getAvailability…": a stack with no error in it,
// and the error only in a label the row cuts with an ellipsis.

import { clipToSentence } from './list-rules';

// What a title is allowed to hold. The row draws the title on one line and
// clips it with an ellipsis, so anything past roughly this length is never
// read in full on any screen; the old 180 was a storage limit wearing a
// design's clothes, and it cut in the middle of words to reach it.
export const TITLE_BUDGET = 120;

// Short enough to be an abbreviation ("e.g.", "Mr.") rather than a sentence.
const FIRST_SENTENCE_MIN = 24;

// A list's mark is about the shape of the text and is never part of a name.
// The space after it is what keeps `--version`, `-5 degrees` and a dash inside
// a sentence exactly as they were typed.
const MARK = /^(?:[-*•]|\d{1,2}[.)])\s+/;

const unmarked = (line: string) => line.replace(MARK, '').trim() || line;

/**
 * A MESSAGE THAT IS A LIST OF PEERS, as one task per line, or nothing.
 *
 * Narrow on purpose: every line has to carry its own mark at the same indent,
 * so a paragraph over the bullets (context belonging to all of them), a nested
 * list and a continuation line all read as the one thread Send has always made.
 */
export function listedTasks(message: string): string[] {
  const lines = (message ?? '').trim().split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  if (lines.some((l) => /^\s/.test(l) || !MARK.test(l))) return [];
  const items = lines.map((l) => l.replace(MARK, '').trim()).filter(Boolean);
  return items.length === lines.length ? items : [];
}

// A label for a first line too long to be one. Failing that, as much as fits,
// clipped the way a row summary is, which at least stops on a word.
function titleFor(head: string): string {
  const end = head.search(/[.!?](\s|$)/);
  if (end >= FIRST_SENTENCE_MIN && end < TITLE_BUDGET) return head.slice(0, end + 1);
  return clipToSentence(head, TITLE_BUDGET);
}

export function splitMessage(message: string): { title: string; body: string } {
  const text = message.trim();
  const lines = text.split('\n');
  // The mark comes off the LABEL only; the body below is the message as typed.
  const head = unmarked((lines[0] ?? '').trim());
  // A first line too long to be a title is CLIPPED into one, so the body has
  // to carry the whole message whatever shape it is in.
  if (head.length > TITLE_BUDGET) return { title: titleFor(head), body: text };
  if (lines.length === 1) return { title: head, body: '' };
  if (!lines[1].trim()) return { title: head, body: lines.slice(2).join('\n').trim() };
  return { title: head, body: text };
}

// NO NOTICE ON THE ROWS THIS ALREADY ATE.

// THE WAY BACK, for a repeating task she wants to change.
//
// A rule is stored as a title and a body because `splitMessage` above split the
// one typed message into those two. Editing it has to put that one message
// back in front of her, not two fields she never filled in: the title is a
// label this app derived, and asking her to maintain a label she never wrote is
// a second thing to learn for no gain. So the box holds the message, she
// changes it, and `splitMessage` derives the label again — which is also why
// the Scheduled row cannot go stale while the instruction moves under it.
//
// The two shapes above, undone:
//   A subject.         Title is the first line, body is what followed the
//                      blank line under it, so the blank line goes back.
//   Anything else.     The body holds the whole thing already, first line
//                      included, and the title is a label derived from it.
export function joinMessage(part: { title: string; body?: string }): string {
  const body = (part.body ?? '').trim();
  if (!body) return part.title;
  if (body === part.title) return body;
  // WHICH OF THE TWO SHAPES THIS IS, DECIDED BY RUNNING THE SPLIT FORWARD
  // rather than by looking at the words. A clipped message is the only thing
  // that survives `splitMessage` unchanged: its first line is too long to be a
  // title, so the split hands back the SAME derived label and the whole text as
  // the body. Anything with a short first line comes back divided, which is the
  // tell that the title is a real line of hers and belongs back on top.
  //
  // This used to ask `body.startsWith(part.title)` instead, and a short first
  // line whose detail opened with those same words answered yes. The join then
  // dropped her first line, and since the box saves what it shows, one edit
  // would have cut it out of the rule that briefs every run after. Caught by
  // the round trip in `tests/a-repeating-task-can-be-edited.test.mjs`,
  // 2026-08-21.
  const again = splitMessage(body);
  if (again.body === body && again.title === part.title) return body;
  return `${part.title}\n\n${body}`;
}
