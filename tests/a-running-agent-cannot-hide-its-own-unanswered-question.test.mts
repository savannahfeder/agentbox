// A running agent cannot hide its own unanswered question.
//
// Two rules take a row out of Needs you the moment something is happening to
// it: `live`, a session is on the row (w-bc976fd247), and `shipping`, the app's
// ship queue still owes it a ship (w-0c1ba766eb). Both were written for rows
// where nothing was being asked of anybody, and both were written as
// UNCONDITIONAL early returns.
//
// So an agent that asks you a question and keeps running removes its own
// question from the person it is asking. Nothing on the row says so: it reads
// "working" in In progress, and the options card addressed to you is in no list
// you read. That is the exact shape the founder has already ruled on once, for
// a different field: "an agent could remove its own question from the person it
// was asking" is why `parkedByAgent` gates workers and never the inbox.
//
// Their ranking, 2026-10-09, on this part of the app: "If we have false
// negatives, we lose tasks, which is a really big problem... false negatives
// are worse than false positives."
//
// MEASURED on the real store before the fix, 44 ledgers, 2,563 rows, 116,192
// ledger lines, with 12,597 session traces read for the times:
//
//   179 rows have been claimed by a worker while they were still asking
//       something. That is the state, but being claimed does not hide a row:
//       a claimed question is in both lists already;
//     6 rows had a SPAWNED SESSION whose life actually overlapped the window
//       in which their question was unanswered, which is the state that hid
//       it, and the overlap totalled under a minute;
//     1 row ever carried the ship label while still asking something;
//     0 rows change list today, so nothing moves under anybody.
//
// So the hole is narrow in practice and was worth closing anyway: it is a
// false negative, the direction that loses work, and the fix costs one
// condition. An earlier note on this thread put it at 185 rows by counting
// the claimed state; that proxy over-counts the real thing by about thirty
// times (scripts/scratch/questions-a-session-hides.mjs and
// scripts/scratch/how-long-a-question-was-hidden.mjs).
//
// THE FIX IS ONE EXCEPTION AND NOTHING ELSE. A row that is still asking you
// something keeps the two vetoes off it; every other row is untouched, both
// incidents above keep their behaviour, and the row stays in In progress as
// well, because a session really is on it. A claimed question is already in
// both lists today — the veto was the one case where attaching a session
// changed that.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { belongsInInbox, belongsInProgress, belongsOnTheRail, stillAsksYou } from '../renderer/src/list-rules';

const NOW = 1_791_800_000_000;

// An agent's question to you, filed under the thread it came out of, with its
// options in the body and no answer yet.
const question = (extra) => ({
  id: 'w-q', status: 'open', kind: 'question', labels: [], parent: 'w-parent',
  title: 'Which of these two should I build first?', updatedAt: NOW,
  wrote: { title: { ts: NOW - 300_000, source: 'agent' } }, ...extra,
});
// A review is the same shape: an agent addresses it to you and only you can
// settle it, which is why `isProposal` refuses to hide one either.
const review = (extra) => question({ id: 'w-r', kind: 'review', ...extra });

const inbox = (i, opts) => belongsInInbox(i, { now: NOW, ...opts });
const progress = (i, opts) => belongsInProgress(i, { now: NOW, ...opts });

describe('a question still waiting on you survives both vetoes', () => {
  it('the hole: a session is on the row and the question is unanswered', () => {
    expect(inbox(question(), { live: true })).toBe(true);
    expect(progress(question(), { live: true })).toBe(true); // and a worker IS on it
  });

  it('the same while the app still owes the row a ship', () => {
    expect(inbox(question(), { shipping: true })).toBe(true);
    expect(progress(question(), { shipping: true })).toBe(true);
  });

  it('a review an agent addressed to you, the same way', () => {
    expect(inbox(review(), { live: true })).toBe(true);
    expect(inbox(review(), { shipping: true })).toBe(true);
  });

  it('a claimed question reads the same with a session on it as without one', () => {
    const claimed = question({ status: 'claimed' });
    expect(inbox(claimed, { live: false })).toBe(true);  // what it already did
    expect(inbox(claimed, { live: true })).toBe(true);   // and now attaching a session does not change it
  });

  it('a withdrawn approval is not an answer, so the question is still yours', () => {
    expect(inbox(question({ answer: '(withdrawn)' }), { live: true })).toBe(true);
  });

  it('is still on the rail, as it was', () => {
    expect(belongsOnTheRail(question(), { now: NOW, live: true })).toBe(true);
  });
});

describe('the cases that must NOT match', () => {
  it('an answered question is the agent\'s again, and a session keeps it there', () => {
    const answered = question({ answer: 'Option 1: do it' });
    expect(inbox(answered, { live: true })).toBe(false);
    expect(inbox(answered, { shipping: true })).toBe(false);
  });

  it('the reported row of w-bc976fd247: blocked by its own agent, nothing asked', () => {
    const blocked = { id: 'w-ac7f0c0cbb', status: 'blocked', kind: 'bug', updatedAt: NOW, wrote: {} };
    expect(inbox(blocked, { live: true })).toBe(false);
    expect(progress(blocked, { live: true })).toBe(true);
  });

  it('the reported row of w-0c1ba766eb: a directive marked to ship', () => {
    const marked = { id: 'w-usage', status: 'open', kind: 'bug', labels: ['bug', 'ship'], updatedAt: NOW, wrote: {} };
    expect(inbox(marked, { shipping: true })).toBe(false);
  });

  it('a question YOU put away stays away, session or not', () => {
    expect(inbox(question(), { live: true, hiddenUntil: NOW + 3_600_000 })).toBe(false);
  });

  it('a question written down in Later and not begun stays in Later', () => {
    expect(inbox(question({ start: 'later' }), { live: true })).toBe(false);
  });

  it('a finished question is the archive\'s business, not this exception\'s', () => {
    const done = question({ status: 'done', wrote: { status: { ts: NOW, source: 'agent' } } });
    expect(stillAsksYou(done)).toBe(false);
    expect(inbox(done, { live: true })).toBe(false);
  });

  it('a question waiting on another thread that can still finish is in Later', () => {
    const waiting = question({ status: 'blocked', blockedBy: ['w-other'] });
    expect(inbox(waiting, { live: true, waitingOn: ['w-other'] })).toBe(false);
  });

  it('an ordinary directive a worker is running is In progress and nothing else', () => {
    const directive = { id: 'w-d', status: 'claimed', kind: 'directive', labels: ['founder'], updatedAt: NOW, wrote: {} };
    expect(stillAsksYou(directive)).toBe(false);
    expect(inbox(directive, { live: true })).toBe(false);
    expect(progress(directive, { live: true })).toBe(true);
  });
});

describe('the window applies the same exception, ahead of its team branches', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('neither veto in App.tsx drops a row that is still asking you', () => {
    // A LATER EXCEPTION MAY BE ADDED TO EITHER LINE AND NEITHER MAY BE
    // RELAXED, so the regex allows further `&& !...` terms and nothing else. An
    // agent frozen on a permission request is the second of them (F-28).
    expect(app).toMatch(/if \(liveIds\.has\(i\.id\) && !stillAsksYou\(i\)( && ![^)]+\(i\))*\) return false;/);
    expect(app).toMatch(/if \(shippingIds\.has\(i\.id\) && !stillAsksYou\(i\)( && ![^)]+\(i\))*\) return false;/);
  });
});
