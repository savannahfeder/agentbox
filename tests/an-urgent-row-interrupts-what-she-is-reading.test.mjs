// AN URGENT ROW TAKES THE SCREEN, AND GIVES IT BACK.
//
// Most of this file is about when NOT to. Taking the screen off her is the
// kind of thing that is right once and wrong twenty times, and every wrong
// time is silent: interrupting her mid-reply costs her the sentence she was
// typing, and interrupting for a row that was already in the list turns every
// task she opens into a bounce somewhere else. The design rule is to always
// know the next step without overload, so the rules are pure and pinned here
// rather than living inside a component.

import { describe, it, expect } from 'vitest';
import { urgentInterruption, taskToReturnTo, isUrgentRow } from '../renderer/src/interrupt.ts';

const NOW = 1_787_600_000_000;

const row = (id, priority, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', title: `row ${id}`,
  priority, createdAt: NOW, updatedAt: NOW, ...extra,
});

const ask = (over) => urgentInterruption({
  reading: null, inbox: [], known: new Set(), spent: new Set(), typing: false, ...over,
});

describe('when an urgent row may take the screen', () => {
  // The case she described, exactly: she is reading a Medium, an Urgent one
  // arrives, and it comes to the front.
  it('interrupts a medium task with an urgent row that just arrived', () => {
    const urgent = row('w-urgent', 9);
    expect(ask({ reading: row('w-medium', 5), inbox: [urgent] })).toBe(urgent);
  });

  // with nothing open there is nothing to interrupt, and the inbox already
  // puts the urgent row at the top.
  it('does nothing while she is not reading anything', () => {
    expect(ask({ reading: null, inbox: [row('w-urgent', 9)] })).toBeNull();
  });

  // The one that would make her hate it. A row that was already in her inbox
  // is not an arrival; interrupting for those would bounce her off every task
  // she opened for as long as the urgent row sat there.
  it('does not interrupt for a row that was already in the inbox', () => {
    const urgent = row('w-urgent', 9);
    expect(ask({
      reading: row('w-medium', 5), inbox: [urgent], known: new Set(['w-urgent']),
    })).toBeNull();
  });

  // Never over her words. There is no version of this worth the sentence she
  // was in the middle of typing.
  it('does not interrupt while she is typing', () => {
    expect(ask({
      reading: row('w-medium', 5), inbox: [row('w-urgent', 9)], typing: true,
    })).toBeNull();
  });

  // Urgent interrupts NON-urgent, and nothing else. One urgent row displacing
  // another is churn, not triage.
  it('does not interrupt an urgent task she is already reading', () => {
    expect(ask({ reading: row('w-reading', 9), inbox: [row('w-urgent', 9)] })).toBeNull();
  });

  // High is not Urgent. Her scale has four words on it and only the top one
  // takes the screen.
  it('does not interrupt for a high row', () => {
    expect(ask({ reading: row('w-medium', 5), inbox: [row('w-high', 7)] })).toBeNull();
  });

  // Once, ever. Coming back to the task she was on was her choice; putting her
  // back on the urgent row after that would be the app arguing with her.
  it('does not interrupt twice with the same row', () => {
    expect(ask({
      reading: row('w-medium', 5), inbox: [row('w-urgent', 9)], spent: new Set(['w-urgent']),
    })).toBeNull();
  });

  // The row she is already reading cannot interrupt her with itself, however
  // it got into the list.
  it('does not interrupt with the row she already has open', () => {
    const reading = row('w-same', 5);
    expect(ask({ reading, inbox: [row('w-same', 9)] })).toBeNull();
  });

  // An agent cannot promote its own proposal into something that takes her
  // screen. itemPriority discards an agent's number, and this is that rule
  // reaching all the way to the front.
  it('ignores a nine an agent wrote on its own row', () => {
    const agentRow = row('w-agent', 9, { wrote: { priority: { ts: NOW, source: 'agent' } } });
    expect(ask({ reading: row('w-medium', 5), inbox: [agentRow] })).toBeNull();
  });

  // Her compose box stamps priority as 'system', not 'founder'. Reading only
  // 'founder' anywhere in this app throws away the Urgent tag on her own rows,
  // which is the trap shared/rank.mjs is written to avoid.
  it('takes an urgent row her compose box stamped as system', () => {
    const hers = row('w-hers', 9, { wrote: { priority: { ts: NOW, source: 'system' } } });
    expect(ask({ reading: row('w-medium', 5), inbox: [hers] })).toBe(hers);
  });

  // Two arrive at once: the inbox is already in her order, so the first one
  // wins and the second does not queue up behind it as a second yank.
  it('takes the first urgent row in her order and only that one', () => {
    const first = row('w-first', 9);
    const second = row('w-second', 9);
    expect(ask({ reading: row('w-medium', 5), inbox: [first, second] })).toBe(first);
  });
});

describe('bringing her back to the task she was on', () => {
  // The half that makes the other half bearable.
  it('gives back the task she was reading', () => {
    const held = row('w-medium', 5);
    expect(taskToReturnTo(held, [held])).toBe(held);
  });

  // Read out of the CURRENT items, not the snapshot taken when she was moved.
  // Minutes can pass on the urgent row, and handing her back the old card is
  // how she reads a stale result and thinks nothing happened.
  it('gives back the current version of it, not the one from before', () => {
    const held = row('w-medium', 5);
    const moved = { ...held, updatedAt: NOW + 60_000, result: 'a worker finished it' };
    expect(taskToReturnTo(held, [moved])).toBe(moved);
  });

  // Finished or archived while she was away: she goes to the list, which is
  // where she would have been.
  it('gives nothing back when the task finished while she was away', () => {
    const held = row('w-medium', 5);
    expect(taskToReturnTo(held, [{ ...held, status: 'done' }])).toBeNull();
  });

  it('gives nothing back when the task is gone', () => {
    expect(taskToReturnTo(row('w-medium', 5), [])).toBeNull();
  });

  it('gives nothing back when nothing was held', () => {
    expect(taskToReturnTo(null, [row('w-medium', 5)])).toBeNull();
  });
});

describe('what counts as urgent', () => {
  it('is her nine and nothing below it', () => {
    expect(isUrgentRow(row('a', 9))).toBe(true);
    expect(isUrgentRow(row('a', 7))).toBe(false);
    expect(isUrgentRow(row('a', 5))).toBe(false);
    expect(isUrgentRow(null)).toBe(false);
  });
});
