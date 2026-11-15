// A THREAD'S PLACE IN NEEDS YOU COUNTS EVERY ROW THE LIST SHOWS.
//
// 2026-11-08 product-loop workday, issue 3, seen four times: Needs you read 7,
// and the fourth row, Plan the phone app, opened with "2 of 5" over it. The
// header walked only the plain thread rows; a teammate's question and a chat
// mention sat above them in the list and in its count, and the header left
// both out. Reproduced in the phone preview on 2026-11-09.
import { describe, it, expect } from 'vitest';
import { needsYouOrder, needsYouSpot, stepOver } from '../mobile/src/lib/needs-you';

const row = (id: string) => ({ product: 'agentbox', id });
const ask = (id: string, thread: { product: string; id: string } | null) => ({ question: { id }, thread });
const mention = (id: string) => ({ id });

// The preview's Needs you: a teammate's question with no thread, a mention, then five threads.
const order = needsYouOrder([ask('q1', null)], [mention('m1')], ['draw', 'plan', 'stuck', 'quality', 'limits'].map(row));

describe('the header over a thread opened from Needs you', () => {
  it('counts the question and the mention above the threads', () => {
    expect(needsYouSpot(order, row('plan'))).toEqual({ pos: 4, total: 7 });
    expect(needsYouSpot(order, row('limits'))).toEqual({ pos: 7, total: 7 });
  });

  it('places a question asked in a thread at its own row', () => {
    const o = needsYouOrder([ask('q1', row('asked'))], [], [row('draw')]);
    expect(needsYouSpot(o, row('asked'))).toEqual({ pos: 1, total: 2 });
    expect(needsYouSpot(o, row('draw'))).toEqual({ pos: 2, total: 2 });
  });

  it('has no place for a thread that is not in Needs you', () => {
    expect(needsYouSpot(order, row('elsewhere'))).toBeNull();
  });
});

describe('the arrows', () => {
  it('step from thread to thread', () => {
    expect(stepOver(order, row('plan'), 1)).toEqual(row('stuck'));
    expect(stepOver(order, row('plan'), -1)).toEqual(row('draw'));
  });

  it('skip a chat or a question with no thread, which open no thread page', () => {
    expect(stepOver(order, row('draw'), -1)).toBeNull();
    const o = needsYouOrder([ask('q1', row('asked'))], [mention('m1')], [row('draw')]);
    expect(stepOver(o, row('draw'), -1)).toEqual(row('asked'));
    expect(stepOver(o, row('asked'), 1)).toEqual(row('draw'));
  });

  it('stop at the last row', () => {
    expect(stepOver(order, row('limits'), 1)).toBeNull();
  });
});
