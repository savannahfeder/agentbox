// A ROW SHE ANSWERED MUST NOT COME BACK SAYING WHAT IT SAID BEFORE SHE SPOKE.
//
// It took twenty-two seconds. She replied at 12:32:19. A session was spawned,
// exited at 12:32:42 with a result and no error, and never touched her row: no
// claim, no note, no result, no commit. `settleDelivery` read that exit as a
// delivery and wrote `answeredThrough`, so `answerSettled` went true, so
// `belongsInProgress` let the row go and `belongsInInbox` took it back — under
// the branch that means THE AGENT HAS FINISHED ACTING ON HER ANSWER. Nothing
// had. The row it handed her was byte-for-byte the row she had just answered,
// result and all, because nobody had written anything since.
//
// Five settle events in her store in two days were that shape, all on Agentbox:.
// On the result she was handed back had been written twenty seconds BEFORE she
// answered, and she archived the row nineteen seconds later.
//
// The two halves of the repair, and they are deliberately both:
//   the WRITER  stops calling a silent session a delivery, so her answer gets
//               another one instead of being marked carried (settleDelivery).
//   the RULE    stops believing the mark on its own, so the marks already on
//               disk, and any written by a build that predates this, cannot
//               route a row wrong (answerSettled).

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { agentSpokeSince, answerSettled } from '../shared/answers.mjs';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules';

const ANSWERED = 1_786_735_939_755; // 2026-08-14 12:32:19, "merge it"
const SETTLED = 1_786_735_962_089;  // 12:32:42, twenty-two seconds later
const NOW = 1_786_735_980_000;      // 12:33:00, when she was looking at it

// exactly as the fold held it at 12:33: her reply on it, the mark written, and
// the newest agent word on the row three minutes OLDER than her reply. Her
// title and body, so neither can be rewritten; the result is the one she had
// already read.
const silent = {
  status: 'open', kind: 'directive', labels: ['founder'],
  answer: 'merge it',
  answeredThrough: ANSWERED,
  updatedAt: SETTLED,
  wrote: {
    answer: { ts: ANSWERED, source: 'founder' },
    status: { ts: ANSWERED, source: 'founder' },
    result: { ts: 1_786_735_764_957, source: 'agent' }, // 12:29:24, before she spoke
    note: { ts: 1_786_735_509_385, source: 'agent' },   // 12:25:09
    title: { ts: 1_786_684_251_149, source: 'founder' },
    body: { ts: 1_786_684_251_149, source: 'founder' },
  },
};

// The same row after a session actually did the work and said so.
const spoken = {
  ...silent,
  wrote: { ...silent.wrote, result: { ts: SETTLED, source: 'agent' } },
};

describe('an answer is settled only when a session left a word on the row', () => {
  it('does not count a mark with nothing written since she spoke', () => {
    expect(answerSettled(silent)).toBe(false);
    expect(answerSettled(spoken)).toBe(true);
  });

  it('does not count a note, which is written for the next session and not for her', () => {
    // 2026-08-13: she answered at 12:32:54, a session wrote a note at 12:57:13
    // and no result, and the row came back to her carrying a result written ten
    // minutes before she spoke.
    const noted = { ...silent, wrote: { ...silent.wrote, note: { ts: SETTLED, source: 'agent' } } };
    expect(answerSettled(noted)).toBe(false);
  });

  it('counts a rewritten title or body, which she reads in the list', () => {
    const retitled = { ...silent, wrote: { ...silent.wrote, title: { ts: SETTLED, source: 'agent' } } };
    expect(answerSettled(retitled)).toBe(true);
  });

  it('does not count claiming the row, which is what the silent session did', () => {
    // The claim and the release are two status writes and say nothing. If they
    // counted, every session that died holding the row would read as delivered.
    const claimed = { ...silent, wrote: { ...silent.wrote, status: { ts: SETTLED, source: 'agent' } } };
    expect(agentSpokeSince(claimed, ANSWERED)).toBe(false);
    expect(answerSettled(claimed)).toBe(false);
  });

  it('does not count her own writes as the agent having answered her', () => {
    const hersOnly = { ...silent, wrote: { ...silent.wrote, body: { ts: SETTLED, source: 'founder' } } };
    expect(answerSettled(hersOnly)).toBe(false);
  });
});

describe('where the row goes', () => {
  const opts = { deliveredThrough: 0, hiddenUntil: 0, now: NOW };

  it('leaves the row she answered in In progress, not back in her inbox', () => {
    expect(belongsInInbox(silent, opts)).toBe(false);
    expect(belongsInProgress(silent, { deferredUntil: 0, now: NOW })).toBe(true);
  });

  it('still delivers the row when a session finished and wrote the news', () => {
    expect(belongsInInbox(spoken, opts)).toBe(true);
    expect(belongsInProgress(spoken, { deferredUntil: 0, now: NOW })).toBe(false);
  });
});

describe('the supervisor no longer calls a silent session a delivery', () => {
  const item = { id: 'w-cf877cb4bb', product: 'agentbox', answer: 'merge it', wrote: silent.wrote };
  const clean = { result: 'Read the row.', resultIsError: false };
  let sup; let written;

  const supervisorOver = (row) => {
    written = [];
    const s = new Supervisor(
      { storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 3, authProfiles: ['default'] },
      {
        listItems: () => [],
        readItem: () => row,
        settleAnswer: (slug, id, ts) => written.push([slug, id, ts]),
      },
      '/nonexistent-app',
    );
    s._handledAnswers.add(s._answerKey(item, item.answer));
    return s;
  };

  beforeEach(() => { sup = supervisorOver(silent); });

  it('does not write the mark, and hands her answer to another session', () => {
    expect(sup.settleDelivery(item, item.answer, clean, null)).toBe('retrying');
    expect(written).toEqual([]);
    expect(sup._answerDelivered(item, item.answer)).toBe(false);
  });

  it('gives up after three silent sessions rather than respawning forever', () => {
    for (const expected of ['retrying', 'retrying', 'given up']) {
      sup._handledAnswers.add(sup._answerKey(item, item.answer));
      expect(sup.settleDelivery(item, item.answer, clean, null)).toBe(expected);
    }
    expect(written).toEqual([]);
  });

  it('writes the mark when the session left the news on the row', () => {
    sup = supervisorOver(spoken);
    expect(sup.settleDelivery(item, item.answer, clean, null)).toBe('delivered');
    expect(written).toEqual([['agentbox', 'w-cf877cb4bb', ANSWERED]]);
  });

  it('settles when the row cannot be read, rather than punishing it for our failure', () => {
    sup = supervisorOver(null);
    expect(sup.settleDelivery(item, item.answer, clean, null)).toBe('delivered');
  });
});
