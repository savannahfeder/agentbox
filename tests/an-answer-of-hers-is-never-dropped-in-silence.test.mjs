// AN ANSWER OF HERS IS NEVER DROPPED IN SILENCE.
//
// The session before this one closed the hole for FRESH work: a run that dies
// on a row nobody has answered now writes a sentence there. This is the other
// half, and it is the worse one, because she did something first.
//
// She answers a row. The app spawns a continuation to carry the answer. It
// dies. `settleDelivery` hands the answer back for another go, twice, and on
// the third failure returns 'given up' and writes nothing anywhere she can
// see. The row goes on showing the message she was replying to, so it reads
// exactly like a row nobody has got to yet, forever. The one writer that could
// have spoken, `sayTheRunDied`, sat behind `!continuation`.
//
// MEASURED on a real store: two rows had a run die after an answer with
// nothing said back, 9 dead runs between them, and the live one had been
// waiting two hours.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

// The row this was found on, with an answer on it.
const ITEM = {
  id: 'w-595f3ccad4', product: 'agentbox', status: 'open',
  title: 'Agent speed: what is safe to cut from our scaffolding, and what it would buy',
  answer: 'Yes this is all understood.',
  wrote: { answer: { ts: 1_787_872_000_000, source: 'founder' } },
};
const ANSWER = ITEM.answer;

// Verbatim from sessions//1787878588373.log.
const HER_LIMIT = "You've hit your session limit · resets 6pm (America/Los_Angeles)";

// THE ROW AS THE STORE WOULD REALLY HAND IT BACK, and this is the half that was
// missing. The store double here had no `readItem` at all, and `spokeOnTheRow`
// answers TRUE for a row it cannot read. So every test below used to take the
// branch for an agent having spoken since the answer was written, the one branch
// none of them is about, and the last one passed for entirely the wrong reason.
// The row is readable now and, by default, unchanged since she wrote: nobody
// has answered her.
const UNCHANGED = ITEM;

// And the same row after a worker has put something on it, which is the only
// thing that makes a delivery real.
const ANSWERED_ON_THE_ROW = {
  ...ITEM,
  wrote: { ...ITEM.wrote, result: { ts: ITEM.wrote.answer.ts + 1_000, source: 'agent' } },
};

let sup;
let written;
let rowNow;
beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-answers-'));
  written = [];
  rowNow = UNCHANGED;
  sup = new Supervisor(
    { storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => [rowNow],
      listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }],
      readItem: () => rowNow,
      settleAnswer() {},
      recordSessionResult(product, id, patch) { written.push({ product, id, ...patch }); },
    },
    root,
  );
});

const mark = () => sup._handledAnswers.add(sup._answerKey(ITEM, ANSWER));
const deadOnALimit = () => ({ engine: 'claude', tail: ['session exited (1)'], result: HER_LIMIT, resultIsError: true });

// THE REAL METHOD THE EXIT HANDLER CALLS, not a copy of its decision. That is
// why `settleDeliveryAndSay` exists as a method at all.
const settleTheWayTheExitHandlerDoes = (session) => sup.settleDeliveryAndSay(ITEM, ANSWER, session, null);

describe('a continuation that keeps dying eventually says so on the row', () => {
  it('stays quiet while another attempt is still coming', () => {
    mark(); expect(settleTheWayTheExitHandlerDoes(deadOnALimit())).toBe('retrying');
    mark(); expect(settleTheWayTheExitHandlerDoes(deadOnALimit())).toBe('retrying');
    expect(written).toHaveLength(0);
  });

  it('speaks once we have stopped trying, and names the limit', () => {
    for (let n = 0; n < 3; n += 1) { mark(); settleTheWayTheExitHandlerDoes(deadOnALimit()); }
    expect(written).toHaveLength(1);
    expect(written[0].result).toMatch(/at its usage limit/);
    expect(written[0].result).toMatch(/starts again on its own at 6pm/);
  });

  it('leaves the row open, because her answer still wants carrying', () => {
    for (let n = 0; n < 3; n += 1) { mark(); settleTheWayTheExitHandlerDoes(deadOnALimit()); }
    expect(written[0].status).toBe('open');
  });

  it('says nothing when the delivery actually worked', () => {
    rowNow = ANSWERED_ON_THE_ROW;
    mark();
    expect(settleTheWayTheExitHandlerDoes({ result: 'Cut the scaffolding.', resultIsError: false })).toBe('delivered');
    expect(written).toHaveLength(0);
  });

  it('never overwrites a worker that spoke for itself', () => {
    // A session that finished cleanly AND left a word on the row has already
    // answered her. Three of those must not produce a supervisor sentence.
    rowNow = ANSWERED_ON_THE_ROW;
    for (let n = 0; n < 3; n += 1) { mark(); settleTheWayTheExitHandlerDoes({ result: 'Done.', resultIsError: false }); }
    expect(written).toHaveLength(0);
  });
});

/* ================= and the run that died without dying =================== */
//
// THE WORST SHAPE OF ALL, AND IT WAS THE ONE STILL OPEN. `settleDelivery` is
// two independent tests joined: did the process exit cleanly, AND did an agent
// leave a word on the row since she wrote. A run can pass the first and fail
// the second -- a Codex turn that talks in its thread and never touches the
// store, a worker that claims the row and finishes without writing, a session
// on an install with no store MCP at all -- and that is exactly what the retry
// counter is for.
//
// But `settleDeliveryAndSay` only spoke when `saidNothingSheCanUse(session)`,
// which is false for a clean exit. So on the third attempt `settleDelivery`
// returned 'given up', the writer stayed quiet, and the answered open row was
// NEITHER settled NOR returned to her inbox with anything on it. It reads
// exactly like a row nobody has got to yet, forever, after she did something.
// That is the sentence CLAUDE.md is built around: when the system swallows
// something she said, she cannot tell it from the work not happening.

describe('a continuation that runs cleanly and never reaches the row', () => {
  const cleanButSilent = () => ({ engine: 'codex', tail: [], result: 'I had a look at this.', resultIsError: false });

  it('keeps trying while there are attempts left', () => {
    mark(); expect(settleTheWayTheExitHandlerDoes(cleanButSilent())).toBe('retrying');
    mark(); expect(settleTheWayTheExitHandlerDoes(cleanButSilent())).toBe('retrying');
    expect(written).toHaveLength(0);
  });

  it('says on the row that her answer never landed, once we have stopped trying', () => {
    for (let n = 0; n < 3; n += 1) { mark(); settleTheWayTheExitHandlerDoes(cleanButSilent()); }
    expect(written).toHaveLength(1);
    expect(written[0].result).toMatch(/did not reach this task/i);
    expect(written[0].status).toBe('open');
  });

  // AND IT IS NOT THE DEAD-RUN SENTENCE. That one says nothing ran; something
  // did run here, it just never got her answer onto the row, and telling her
  // "the agent stopped before it did anything" would be false.
  it('does not claim the run never started', () => {
    for (let n = 0; n < 3; n += 1) { mark(); settleTheWayTheExitHandlerDoes(cleanButSilent()); }
    expect(written[0].result).not.toMatch(/stopped before it did anything/);
  });

  // THE CASE THAT MUST NOT MATCH, either way round: a run that died still gets
  // the dead-run sentence, and a run that answered gets nothing.
  it('leaves a dead run to the sentence that is about dying', () => {
    for (let n = 0; n < 3; n += 1) { mark(); settleTheWayTheExitHandlerDoes(deadOnALimit()); }
    expect(written[0].result).toMatch(/at its usage limit/);
  });

  it('says nothing at all when the run did reach the row', () => {
    rowNow = ANSWERED_ON_THE_ROW;
    for (let n = 0; n < 3; n += 1) { mark(); settleTheWayTheExitHandlerDoes(cleanButSilent()); }
    expect(written).toHaveLength(0);
  });

  // A slash command answers in the thread and deliberately writes nothing on
  // the row, so it can never pass the row test and must not be redelivered or
  // spoken for.
  it('leaves a command run alone, because writing nothing on the row is its job', () => {
    mark();
    expect(sup.settleDeliveryAndSay(ITEM, ANSWER, cleanButSilent(), null, { command: true })).toBe('delivered');
    expect(written).toHaveLength(0);
  });
});
