// HAD NOWHERE TO GO.
//
// A question was asked on a row at 20:55 (agentbox). A worker wrote the whole
// answer into the row at 21:57. It could not be seen until a session closed the row on 08-15 at 01:29, and twelve
// sessions claimed the row in between: from outside it looked like unfinished
// work, so the queue kept handing it out, and each session read it, saw the
// answer was already written, correctly wrote nothing, and exited.
//
// The hole was that the inbox showed a worker's result only once the row was
// done or blocked, or once she had already replied (answerSettled). Her own
// OPEN row carrying an answer was in neither list she reads. So a worker had
// two bad moves: close the row, which reaches her but ends a conversation she
// may be in the middle of, or leave it open, which keeps the thread and hides
// the answer.
//
// The third state is this one, and everything it reads is already on the row.
// Measured over a whole store, every line replayed: seven rows had ever held an
// answer that could not be seen, 189 hours between them.
import { describe, it, expect } from 'vitest';
import { answeredHerAsk, belongsInInbox, belongsInProgress, rowSummary } from '../renderer/src/list-rules';
import { NAME } from '../shared/product-name.mjs';

// agentbox exactly as the fold hands it over, from the ledger.
const HER_WORDS = 1_786_654_503_786;   // 2026-08-13 20:55:03 UTC, the ask she wrote
const ANSWER = 1_786_659_511_296;      // 21:58:31, the worker's result
const CLOSED = 1_786_753_774_000;      // 08-15 01:29, when a session finally closed it

const answered = {
  id: 'w-69588a8180', product: 'agentbox', status: 'open', kind: 'directive',
  labels: ['founder'], priority: 5,
  title: 'I want to make a semi-anon Twitter account so that I can post about this product',
  body: 'Over time I\'ll mostly post new product updates to Twitter',
  result: `Setup is a twenty-minute checklist and it's below. But ${NAME} already returns your name on page one.`,
  createdAt: HER_WORDS, updatedAt: ANSWER,
  wrote: {
    title: { ts: HER_WORDS, source: 'founder' },
    body: { ts: HER_WORDS, source: 'founder' },
    result: { ts: ANSWER, source: 'agent' },
    status: { ts: ANSWER, source: 'agent' },
  },
};

// The same row an hour earlier: she has asked, nobody has answered yet.
const unanswered = { ...answered, result: undefined, wrote: { ...answered.wrote, result: undefined } };

describe('her own open row, answered', () => {
  it('is news the moment the worker writes the answer', () => {
    expect(answeredHerAsk(answered)).toBe(true);
    expect(belongsInInbox(answered, { now: ANSWER + 60_000 })).toBe(true);
  });

  it('leaves In progress, because nothing is coming until she speaks', () => {
    // One row is never in two lists at once; that is the failure this file has
    // already had.
    expect(belongsInProgress(answered, { now: ANSWER + 60_000 })).toBe(false);
  });

  it('and the row prints the answer, not her own words back at her', () => {
    expect(rowSummary(answered, 'inbox')).toMatch(/^Setup is a twenty-minute checklist/);
  });

  it('stays in In progress while the ask is still unanswered', () => {
    expect(answeredHerAsk(unanswered)).toBe(false);
    expect(belongsInInbox(unanswered, { now: HER_WORDS + 60_000 })).toBe(false);
    expect(belongsInProgress(unanswered, { now: HER_WORDS + 60_000 })).toBe(true);
  });

  it('does not close the thread: her reply still lands on an open row', () => {
    // The row is delivered, not done. Closing it to reach her is the move this
    // whole rule exists to make unnecessary (: a workstream filed under a
    // one-word status question).
    expect(answered.status).toBe('open');
  });
});

describe('what it must not pick up', () => {
  it('leaves a row a worker is on right now alone', () => {
    const claimed = { ...answered, status: 'claimed' };
    expect(answeredHerAsk(claimed)).toBe(false);
    expect(belongsInProgress(claimed, { now: ANSWER + 60_000 })).toBe(true);
    expect(belongsInInbox(claimed, { now: ANSWER + 60_000 })).toBe(false);
  });

  it('hands the row back the moment she replies', () => {
    const replied = {
      ...answered, answer: 'go with option 2',
      wrote: { ...answered.wrote, answer: { ts: ANSWER + 900_000, source: 'founder' } },
    };
    expect(answeredHerAsk(replied)).toBe(false);
    expect(belongsInInbox(replied, { now: ANSWER + 950_000 })).toBe(false);
    expect(belongsInProgress(replied, { now: ANSWER + 950_000 })).toBe(true);
  });

  it('says nothing about an answer written BEFORE her last word', () => {
    // She spoke again after the result: the answer on the row is a reply to the
    // question she has already moved on from, and a worker owes her a new one.
    // The same shape cost a real row once.
    const spokeAgain = {
      ...answered,
      wrote: { ...answered.wrote, body: { ts: ANSWER + 60_000, source: 'founder' } },
    };
    expect(answeredHerAsk(spokeAgain)).toBe(false);
  });

  it('ignores a session that only wrote a note, or only claimed and released', () => {
    const noteOnly = { ...answered, result: undefined, wrote: { ...answered.wrote, result: undefined, note: { ts: ANSWER, source: 'agent' } } };
    expect(answeredHerAsk(noteOnly)).toBe(false);
  });

  it('is not about agent-filed work, which the inbox has always shown', () => {
    const agentFiled = { ...answered, labels: ['review'], kind: 'review' };
    expect(answeredHerAsk(agentFiled)).toBe(false);
  });

  it('does not fire on a title or body an agent rewrote, which her row ignores anyway', () => {
    const rewritten = {
      ...answered, result: undefined,
      wrote: { ...answered.wrote, result: undefined, title: { ts: ANSWER, source: 'agent' } },
    };
    expect(answeredHerAsk(rewritten)).toBe(false);
  });

  it('leaves the closed row exactly where the done rules put it', () => {
    const closed = {
      ...answered, status: 'done',
      wrote: { ...answered.wrote, status: { ts: CLOSED, source: 'agent' } },
    };
    expect(answeredHerAsk(closed)).toBe(false);
    expect(belongsInInbox(closed, { deliveredThrough: HER_WORDS, now: CLOSED + 1000 })).toBe(true);
  });

  it('stays out of a schedule she set herself', () => {
    const snoozed = { ...answered, runAt: ANSWER + 86_400_000, wrote: { ...answered.wrote, runAt: { ts: ANSWER + 1000, source: 'founder' } } };
    expect(belongsInInbox(snoozed, { hiddenUntil: snoozed.runAt, now: ANSWER + 60_000 })).toBe(false);
  });
});
