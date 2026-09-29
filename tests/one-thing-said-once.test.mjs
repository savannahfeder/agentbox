// THE SAME ANSWER, TWICE, TWO SECONDS APART.
//
// On the row that showed this, nothing went wrong. A worker wrote its answer
// to the row at 21:36:05 and typed its closing message at 21:36:07, which is
// what every worker is told to do, and the thread drew both because both
// really happened. Two messages, same bold line, same minute, same name above
// them. It was not a rare case: a large share of rows with an agent message
// repeated an opening line back to back, many of them character for character.
//
// WHAT CAN SILENTLY BREAK HERE, which is what this file is for:
//
//   1. THE FOLD EATING A PARAGRAPH. Collapsing two messages that merely open
//      alike loses whatever the second one went on to say, and a thread cannot
//      report the sentence it did not draw. So every rule below is checked in
//      both directions: what goes, and what must survive it.
//   2. THE USER'S OWN MESSAGES. People repeat themselves on purpose, and a
//      rule that cannot tell their messages from an agent's would fold their
//      asks away.
//   3. THE ANSWER BLOCK AT THE FOOT. The pane lifts the row's own result out
//      of the stream and draws it under its own label. Drop the wrong copy of
//      a duplicated pair and that block silently stops existing.

import { describe, it, expect } from 'vitest';
import { itemThread } from '../renderer/src/item-thread.ts';

const T = Date.parse('2026-08-31T21:35:00Z');
const sec = 1000;
const at = (ms) => new Date(T + ms).toISOString().slice(11, 19);
const said = (thread) => thread.events.filter((e) => e.kind !== 'work');

/* ------------------- the row that actually showed it --------------------- */
// A reminder row, replayed as a ledger and the trace the run left on disk.
describe('the reminder row in her screenshot', () => {
  const answer = '**Reminder: send Sam an update message.**\n\nThis is your reminder, nothing was done on it. If you want help writing the message, reply here and say what you want Sam to know.';
  const closing = '**Reminder: send Sam an update message.**\n\nThe row is tagged [Reminder], so I did no work on it. It is in your inbox now with that line on it. Reply on the row if you want help drafting the message.';

  const ledger = [
    { id: 'w-ba', ts: T, source: 'system', patch: { title: 'Give Sam an update message [Reminder]', status: 'open' } },
    { id: 'w-ba', ts: T + 48 * sec, source: 'agent', claim: { holder: 'mcp-32029', leaseUntil: T + 348 * sec }, patch: { status: 'claimed' } },
    { id: 'w-ba', ts: T + 65 * sec, source: 'agent', patch: { status: 'done', result: answer } },
  ];
  const trace = {
    startedAt: T + 48 * sec,
    text: [
      '# Give Sam an update message [Reminder]',
      `${at(56 * sec)}  [mcp__agentbox__claim_work_item] w-ef1e7bd540`,
      `${at(65 * sec)}  [mcp__agentbox__update_work_item] w-ef1e7bd540`,
      `${at(67 * sec)}  ${closing}`,
      `${at(67 * sec)}  == RESULT (success · 4 turns) ==`,
      closing,
      `# exited (0) ${new Date(T + 68 * sec).toISOString()}`,
    ].join('\n'),
  };

  const thread = itemThread(ledger, [trace]);

  it('says the reminder once, not twice', () => {
    const bold = [...said(thread), ...(thread.outcome ? [{ text: thread.outcome.text }] : [])]
      .filter((e) => /Reminder: send Sam/.test(e.text ?? ''));
    expect(bold).toHaveLength(1);
  });

  // The copy that survives is the ROW's, because the inbox line reads that
  // field and the pane labels it. Keeping the run's copy instead would leave
  // the same words on the screen and quietly empty the block at the foot.
  it('keeps the row\'s own answer, under its own label', () => {
    expect(thread.outcome).not.toBeNull();
    expect(thread.outcome.field).toBe('result');
    expect(thread.outcome.text).toBe(answer);
  });

  it('does not pretend the run said nothing: its work is still on the row', () => {
    expect(thread.events.some((e) => e.kind === 'work')).toBe(true);
  });
});

/* --------------------- the same words written twice ---------------------- */
describe('one message written more than once', () => {
  const long = 'Blocked on: your pick between three diary designs, drawn in the real app. Nothing is built yet.';

  // Four identical results in twenty seconds, which is what an
  // `update_work_item` that retries looks like in the ledger. The fold
  // keeps one value; the thread used to draw four.
  it('draws a result written four times once', () => {
    const ledger = [
      { id: 'w-r', ts: T, source: 'founder', patch: { title: 'Diaries', body: 'Give every agent a diary.' } },
      { id: 'w-r', ts: T + 10 * sec, source: 'agent', patch: { result: long } },
      { id: 'w-r', ts: T + 19 * sec, source: 'agent', patch: { result: long } },
      { id: 'w-r', ts: T + 28 * sec, source: 'agent', patch: { result: long } },
      { id: 'w-r', ts: T + 31 * sec, source: 'agent', patch: { status: 'done', result: long } },
    ];
    const thread = itemThread(ledger, []);
    const copies = [...said(thread), ...(thread.outcome ? [thread.outcome] : [])]
      .filter((e) => e.text === long);
    expect(copies).toHaveLength(1);
    expect(thread.outcome?.text).toBe(long);
  });

  // A worker rewrites the body to the ask, then hands the same words back as
  // the result, because the inbox row reads one field and the pane reads the
  // other. Many real pairs were exactly this.
  it('draws a body and an identical result once', () => {
    const ledger = [
      { id: 'w-b', ts: T, source: 'agent', patch: { title: 'Landing page', body: long } },
      { id: 'w-b', ts: T + 60 * sec, source: 'agent', patch: { status: 'done', result: long } },
    ];
    expect(said(itemThread(ledger, [])).filter((e) => e.text === long)).toHaveLength(0);
    expect(itemThread(ledger, []).outcome?.text).toBe(long);
  });

  // THE FULLER TEXT ALWAYS SURVIVES. A checkpoint that opens with the result
  // and then goes on is not the result, and folding it away would lose the
  // going on.
  it('never drops the copy that says more', () => {
    const more = `${long}\n\nThe fourth design is a wall chart and it is the one I would build.`;
    const ledger = [
      { id: 'w-m', ts: T, source: 'agent', patch: { note: more } },
      { id: 'w-m', ts: T + 60 * sec, source: 'agent', patch: { status: 'done', result: long } },
    ];
    const thread = itemThread(ledger, []);
    const texts = [...said(thread), ...(thread.outcome ? [thread.outcome] : [])].map((e) => e.text);
    expect(texts).toContain(more);
    expect(texts.filter((t) => t === long)).toHaveLength(0);
  });
});

/* ------------ the same bold line over two different answers -------------- */
//
// THE OTHER HALF OF THE PROBLEM: not the same summary twice, but the same bold
// line twice over. Two runs answer the same row, each with its own paragraph,
// and both open on the same line because that is what every worker is told to
// write. Folding one away would eat a paragraph, so neither goes. The second
// one is drawn without the line the reader has just read, and keeps every word.
describe('a bold line she has already read', () => {
  const head = '**Round nine is on the page.**';
  const one = `${head}\n\nThe headline is the short one you picked.`;
  const two = `${head}\n\nThe footer went back to grey after you called the blue loud.`;
  const three = `${head}\n\nAnd the price line is off the hero entirely.`;
  // A third message under them, so the last answer is not lifted to the foot
  // and every one of these stays in the stream where the rule can be read.
  const after = 'Nothing else is waiting on you.';

  const ledger = [
    { id: 'w-n', ts: T, source: 'agent', patch: { note: one } },
    { id: 'w-n', ts: T + 300 * sec, source: 'agent', patch: { note: two } },
    { id: 'w-n', ts: T + 600 * sec, source: 'agent', patch: { note: three } },
    { id: 'w-n', ts: T + 900 * sec, source: 'founder', patch: { answer: after } },
  ];
  const texts = said(itemThread(ledger, [])).map((e) => e.text);

  it('draws the bold line once over the three of them', () => {
    expect(texts.filter((t) => t.includes(head))).toHaveLength(1);
  });

  // THE WHOLE POINT. A fold here would have lost these two sentences.
  it('keeps every word underneath it', () => {
    expect(texts.join('\n')).toContain('The headline is the short one you picked.');
    expect(texts.join('\n')).toContain('The footer went back to grey after you called the blue loud.');
    expect(texts.join('\n')).toContain('And the price line is off the hero entirely.');
    expect(said(itemThread(ledger, [])).filter((e) => e.who === 'it')).toHaveLength(3);
  });

  // The heading does not come back every other message. `three` is measured
  // against what `two` was WRITTEN as, not against what `two` is drawn as.
  it('does not let the line reappear on the third message', () => {
    expect(texts[2].startsWith('And the price line')).toBe(true);
  });

  // A message that is nothing but its opening has no body to keep, so taking
  // the line off it would leave a blank message on the screen.
  it('leaves a message that is only its opening alone', () => {
    const bare = [
      { id: 'w-o', ts: T, source: 'agent', patch: { note: one } },
      { id: 'w-o', ts: T + 300 * sec, source: 'agent', patch: { note: head } },
      { id: 'w-o', ts: T + 900 * sec, source: 'founder', patch: { answer: after } },
    ];
    expect(said(itemThread(bare, [])).map((e) => e.text)).toContain(head);
  });

  // THE BLOCK AT THE FOOT IS DRAWN FROM THE ROW'S OWN FIELD AND KEEPS ITS
  // HEADING, because it is lifted out of the stream and labelled on its own.
  it('leaves the answer at the foot whole', () => {
    const live = [
      { id: 'w-f', ts: T, source: 'agent', patch: { note: one } },
      { id: 'w-f', ts: T + 300 * sec, source: 'agent', patch: { status: 'done', result: two } },
    ];
    expect(itemThread(live, []).outcome?.text).toBe(two);
  });

  // The user's own repeats are left alone. Two asks opening the same way are
  // two asks, drawn as they were typed.
  it('never takes a line off anything she wrote', () => {
    const hers = [
      { id: 'w-y', ts: T, source: 'founder', patch: { title: 'Landing', body: one } },
      { id: 'w-y', ts: T + 300 * sec, source: 'founder', patch: { answer: two } },
    ];
    const mine = said(itemThread(hers, [])).filter((e) => e.who === 'you').map((e) => e.text);
    expect(mine).toContain(one);
    expect(mine).toContain(two);
  });
});

/* ------------------------- what must not collapse ------------------------ */
describe('what stays on the screen', () => {
  // TWO MESSAGES THAT MERELY OPEN ALIKE ARE TWO MESSAGES. This is the line the
  // fold must not cross: deciding they are one needs a judgement about their
  // wording, and getting it wrong eats a paragraph she never sees again.
  it('keeps two checkpoints that share an opening and then diverge', () => {
    const one = '**Round nine is on the page.**\n\nThe headline is the short one you picked.';
    const two = '**Round nine is on the page.**\n\nThe footer went back to grey after you called the blue loud.';
    const ledger = [
      { id: 'w-t', ts: T, source: 'agent', patch: { note: one } },
      { id: 'w-t', ts: T + 300 * sec, source: 'agent', patch: { note: two } },
    ];
    const thread = itemThread(ledger, []);
    const texts = [...said(thread), ...(thread.outcome ? [thread.outcome] : [])].map((e) => e.text);
    expect(texts).toContain(one);
    expect(texts).toContain(two);
  });

  it('never folds her own words away, however she repeats herself', () => {
    const hers = 'I still cannot find the landing page task and I have looked twice.';
    const ledger = [
      { id: 'w-h', ts: T, source: 'founder', patch: { title: 'Landing page', body: hers } },
      { id: 'w-h', ts: T + 60 * sec, source: 'founder', patch: { answer: hers } },
    ];
    const thread = itemThread(ledger, []);
    expect(said(thread).filter((e) => e.who === 'you')).toHaveLength(2);
  });

  // A short line is not evidence of anything. "Done." sits inside almost any
  // paragraph, so containment below forty characters proves nothing and two
  // terse messages stay two messages.
  it('keeps two short messages that happen to overlap', () => {
    const ledger = [
      { id: 'w-s', ts: T, source: 'agent', patch: { note: 'Merged.' } },
      { id: 'w-s', ts: T + 60 * sec, source: 'agent', patch: { result: 'Merged. Your app has it after a restart.' } },
    ];
    const thread = itemThread(ledger, []);
    const texts = [...said(thread), ...(thread.outcome ? [thread.outcome] : [])].map((e) => e.text);
    expect(texts).toContain('Merged.');
    expect(texts).toContain('Merged. Your app has it after a restart.');
  });

  // A run that wrote nothing to the row still gets to speak. Dropping its
  // closing message here would leave the task blank.
  it('keeps a run\'s closing message when the row carries no answer', () => {
    const closing = 'I read the paper. It argues that scaling laws hold to about a trillion tokens.';
    const trace = {
      startedAt: T,
      text: [
        '# read the paper',
        `${at(10 * sec)}  [Read] paper.pdf`,
        `${at(20 * sec)}  ${closing}`,
        `# exited (0) ${new Date(T + 21 * sec).toISOString()}`,
      ].join('\n'),
    };
    const ledger = [
      { id: 'w-p', ts: T, source: 'founder', patch: { title: 'Read this', body: 'Read this paper and explain it.' } },
      { id: 'w-p', ts: T, source: 'agent', claim: { holder: 'mcp-9', leaseUntil: T + 300 * sec }, patch: { status: 'claimed' } },
    ];
    const thread = itemThread(ledger, [trace]);
    const texts = [...said(thread), ...(thread.outcome ? [thread.outcome] : [])].map((e) => e.text);
    expect(texts).toContain(closing);
  });
});
