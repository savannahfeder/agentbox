// A CONVERSATION'S ROW IN THE LIST SAYS THE LATEST REAL LINE.
//
// Reported 2026-10-05 on w-2e8aa16f0f: the list "looked a bit weird" under the
// first real conversation between two teammates. Measured against the rule as
// it stood, on that conversation, two things were wrong with the one line a
// row gets:
//
//   1. IT WAS THE OLDEST MESSAGE, NOT THE NEWEST. The newest message counted as
//      news only when its writer was not the writer of the ask. One teammate
//      both started the conversation and sent the latest message, so the test
//      failed and the row printed their FIRST message — days old, already read,
//      and the one thing on the row that could not be news.
//
//   2. IT OPENED ON A LABEL. That latest message begins "Additional:" on a line
//      of its own. Every line of a message is joined with spaces to make the
//      preview, so the row read "Additional: Title: Send gives no sign that it
//      is working…": two labels and then, maybe, a word of what was said.
//
// So the row takes the newest thing said, and starts at the first line of it
// that is a line rather than a heading for one.
//
// THE RULE IS MEASURED WHERE THE ROW ACTUALLY READS IT. The inbox draws a
// conversation through `messageLine` (threads/page-rules.ts), not through
// `rowSummary`: photographed in the built app, the row still read the sender's
// name and then "Additional:" with the summary rule already fixed, because the
// summary rule is not what that row prints. Both are covered below, and the
// first describe is the one the screenshot was of.
import { describe, it, expect } from 'vitest';
import { rowSummary } from '../renderer/src/list-rules.ts';
import { messageLine } from '../renderer/src/threads/page-rules.ts';

const MAYA = 'p-maya', ME = 'p-me';
const row = (fields) => ({ status: 'open', ...fields });

const DIRECT = { slug: 'direct-maya', name: 'Direct', team: { projectId: 'tp-1', direct: true, people: [MAYA], sharedBy: ME } };
const ADDITIONAL = 'Additional:\n\nTitle: Send gives no sign that it is working\n\nProblem: I pressed Send on a long message.';

describe('the line a conversation’s row prints in the inbox', () => {
  const convo = (answer) => ({
    id: 'w-1', product: 'direct-maya', title: 'Sending my findings', body: 'Sending my findings here:',
    answer, people: [ME, MAYA], createdBy: MAYA,
    wrote: { body: { ts: 1, by: MAYA }, answer: { ts: 2, by: MAYA } },
  });

  it('steps over a bare label and says the line under it', () => {
    expect(messageLine(convo(ADDITIONAL), DIRECT, ME).text).toBe('Title: Send gives no sign that it is working');
  });

  it('keeps a real sentence that happens to end in a colon', () => {
    const said = 'Here is what I found in the three files I read this morning:\nThe first one is fine.';
    expect(messageLine(convo(said), DIRECT, ME).text).toBe('Here is what I found in the three files I read this morning:');
  });

  it('prints the label when the label is all there is', () => {
    expect(messageLine(convo('Additional:'), DIRECT, ME).text).toBe('Additional:');
  });

  it('leaves every row that is not a conversation alone', () => {
    expect(messageLine(convo(ADDITIONAL), { slug: 'work', name: 'Work', team: { projectId: 'tp-2' } }, ME)).toBe(null);
  });
});

describe('which message a conversation’s row prints', () => {
  it('takes the newest one even when the same person wrote both', () => {
    const i = row({
      body: 'Sending my findings here:',
      answer: 'One more thing I forgot.',
      wrote: { body: { ts: 1, by: MAYA }, answer: { ts: 2, by: MAYA } },
    });
    expect(rowSummary(i, 'inbox')).toBe('One more thing I forgot.');
  });

  it('still takes a teammate’s reply over your own ask', () => {
    const i = row({
      body: 'Could you check the six findings?',
      answer: 'All six hold up.',
      wrote: { body: { ts: 1, by: ME }, answer: { ts: 2, by: MAYA } },
    });
    expect(rowSummary(i, 'inbox')).toBe('All six hold up.');
  });

  // THE BOUNDARY THE OTHER SIDE. A reply older than the ask is not the news:
  // the ask was rewritten after it, and that rewrite is the newest thing said.
  it('leaves an older reply alone when the ask was written after it', () => {
    const i = row({
      body: 'The newer question.',
      answer: 'An older answer.',
      wrote: { body: { ts: 9, by: ME }, answer: { ts: 2, by: MAYA } },
    });
    expect(rowSummary(i, 'inbox')).toBe('The newer question.');
  });

  // AND THE CASE THAT MUST NOT CHANGE: with nobody signed in no line carries a
  // writer, and every row in the single-person app reads exactly as it did.
  it('changes nothing on a Mac where no line has a writer', () => {
    const i = row({
      body: 'The ask she typed.',
      answer: 'A reply she typed.',
      wrote: { body: { ts: 1 }, answer: { ts: 2 } },
    });
    expect(rowSummary(i, 'inbox')).toBe('The ask she typed.');
  });
});

describe('a message that opens on a label', () => {
  const additional = 'Additional:\n\nTitle: Send gives no sign that it is working\n\nProblem: I pressed Send on a long message.';

  it('starts at the line under it, not at the label', () => {
    const i = row({ body: 'x', answer: additional, wrote: { body: { ts: 1, by: MAYA }, answer: { ts: 2, by: MAYA } } });
    expect(rowSummary(i, 'inbox')).toMatch(/^Title: Send gives no sign/);
  });

  it('prints one line rather than running every line together', () => {
    const i = row({ body: 'x', answer: additional, wrote: { body: { ts: 1, by: MAYA }, answer: { ts: 2, by: MAYA } } });
    expect(rowSummary(i, 'inbox')).not.toContain('Problem:');
  });

  // THE CASE THAT MUST NOT BE SKIPPED. A line ending in a colon that says
  // something is a sentence, not a heading, and taking it off would be the same
  // fault the other way round.
  it('keeps a real sentence that happens to end in a colon', () => {
    const said = 'Here is what I found in the three files I read this morning:\nThe first one is fine.';
    const i = row({ body: 'x', answer: said, wrote: { body: { ts: 1, by: MAYA }, answer: { ts: 2, by: MAYA } } });
    expect(rowSummary(i, 'inbox')).toMatch(/^Here is what I found/);
  });

  it('prints the label when the label is all there is', () => {
    const i = row({ body: 'x', answer: 'Additional:', wrote: { body: { ts: 1, by: MAYA }, answer: { ts: 2, by: MAYA } } });
    expect(rowSummary(i, 'inbox')).toBe('Additional:');
  });
});
