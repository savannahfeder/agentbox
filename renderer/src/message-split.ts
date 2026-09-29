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
//   The first line fits a title.  Nothing changes. The title is that line and
//                                 the body is the detail under it, which is how
//                                 this has always worked and reads like email.
//   It does not fit.              The title is clipped at a sentence, the same
//                                 way the row's summary already is, and the
//                                 body carries the typed text VERBATIM, first
//                                 line included. The label may lose words; the
//                                 message never does.

import { clipToSentence } from './list-rules';

// What a title is allowed to hold. The row draws the title on one line and
// clips it with an ellipsis, so anything past roughly this length is never
// read in full on any screen; the old 180 was a storage limit wearing a
// design's clothes, and it cut in the middle of words to reach it.
export const TITLE_BUDGET = 120;

// Short enough to be an abbreviation ("e.g.", "Mr.") rather than a sentence.
const FIRST_SENTENCE_MIN = 24;

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
  const head = (lines[0] ?? '').trim();
  if (head.length <= TITLE_BUDGET) return { title: head, body: lines.slice(1).join('\n').trim() };
  return { title: titleFor(head), body: text };
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
//   Short first line.  Title is that line, body is what followed it.
//   Long first line.   Title was CLIPPED out of the body, and the body holds
//                      the whole thing already, first line included.
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
  return `${part.title}\n${body}`;
}
