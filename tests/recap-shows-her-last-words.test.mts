// A filed thread opens with her own words, once.
//
// The bug it fixes: a question row showing "IN RESPONSE TO" (the parent's
// agent message, 27m old) directly above "YOUR REPLY" (the user's answer on
// this row, 2m old), directly above the agent's body (17m old). Three grey
// boxes, two of them saying the same thing in the agent's voice, and the
// user's newest words rendered above a message written before them.
//
// The last of those boxes is gone too (tests/nothing-is-quoted-above-the-
// message), so what recapFor picks is only ever the thread's first message,
// and every shape that fed a box now answers null.

import { describe, it, expect } from 'vitest';
import { recapFor, closedBy, resultLeads } from '../renderer/src/recap';

const row = (over = {}) => ({
  id: 'w-1', product: 'p', productName: 'P', status: 'blocked', title: 'A title',
  kind: 'question', labels: [], priority: 0, epoch: 0, claim: null,
  createdAt: 1000, updatedAt: 2000, ...over,
});

describe('recapFor', () => {
  it('a reply on THIS row is state, not context: the parent drops out', () => {
    const parent = row({ id: 'w-0', kind: 'question', title: 'The earlier ask', body: 'agent prose' });
    const item = row({ answer: 'yes, go ahead', wrote: { answer: { ts: 5000, source: 'founder' } } });
    expect(recapFor(item, parent)).toBeNull();
  });

  it('without a reply here, it shows what she said on the row before', () => {
    const parent = row({ id: 'w-0', title: 'The earlier ask', answer: 'do the first one', wrote: { answer: { ts: 3000, source: 'founder' } } });
    // Filed after that reply. One written after the thread was filed is not
    // its ask (a-filed-thread-opens-with-the-message-that-asked-for-it).
    expect(recapFor(row({ createdAt: 3500 }), parent)).toEqual({
      kind: 'said', text: 'do the first one', at: 3000, on: 'The earlier ask',
    });
  });

  it('a directive she composed is her words even with no answer typed on it', () => {
    const parent = row({ id: 'w-0', kind: 'directive', title: 'I need help with something', body: 'here is the situation', createdAt: 700 });
    expect(recapFor(row(), parent)).toEqual({
      kind: 'said', text: 'here is the situation', at: 700, on: 'I need help with something',
    });
  });

  // The case that produced the cluttered screenshot: an agent question whose
  // parent is another agent question. She said nothing on either, so the
  // thread has no first message of hers and opens on the agent.
  it('an agent parent she never answered gives the thread nothing', () => {
    const parent = row({ id: 'w-0', kind: 'question', title: 'The earlier ask', body: 'a long agent message', updatedAt: 2500 });
    expect(recapFor(row(), parent)).toBeNull();
  });

  it('a withdrawn send is a tombstone, not words', () => {
    const parent = row({ id: 'w-0', kind: 'question', title: 'The earlier ask', answer: '(withdrawn)' });
    expect(recapFor(row({ answer: '(withdrawn)' }), parent)).toBeNull();
  });

  it('no parent and no reply means nothing above the message', () => {
    expect(recapFor(row(), null)).toBeNull();
  });
});

// Both are, where the agent wrote status done and a result that reversed the
// whole ask, and left the title and body saying "Merging is the only thing
// left."
describe('a closed row', () => {
  const closed = (source, over = {}) => row({
    status: 'done', result: 'Closed, the thing this was blocked on came back as a no.',
    wrote: { status: { ts: 7000, source } }, ...over,
  });

  it('knows the difference between her filing it and an agent ending it', () => {
    expect(closedBy(closed('founder'))).toBe('founder');
    expect(closedBy(closed('agent'))).toBe('agent');
    expect(closedBy(closed('system'))).toBe('agent'); // machinery is not her
    expect(closedBy(row())).toBeNull();               // not closed at all
  });

  // The regression. An agent-closed row is in her inbox precisely BECAUSE it is
  // news, so the news has to lead instead of sitting under a withdrawn
  // recommendation.
  it('leads with the result when an agent ended it', () => {
    expect(resultLeads(closed('agent'))).toBe(true);
  });

  it('does not rearrange a row she filed herself', () => {
    expect(resultLeads(closed('founder'))).toBe(false);
  });

  it('does not lead with a result that is not there', () => {
    expect(resultLeads(closed('agent', { result: '   ' }))).toBe(false);
    expect(resultLeads(closed('agent', { result: undefined }))).toBe(false);
  });

  it('leaves an open row alone, however much it has been worked on', () => {
    expect(resultLeads(row({ status: 'blocked', result: 'progress so far' }))).toBe(false);
  });
});
