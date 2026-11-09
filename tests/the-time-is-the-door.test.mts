// The thread history: what the ledger's lines say happened.
//
// What is pinned here is the mapping, because that is where this can be wrong
// in a way that still looks right: an event credited to the wrong person, a
// lease heartbeat printed as something that happened, a rename that cannot say
// what the name was.

import { describe, it, expect } from 'vitest';
import { threadEvents, dayHeading, byDay, readable } from '../renderer/src/thread-history.ts';

const T = new Date('2026-08-13T13:55:00').getTime();
const min = 60_000;

// Her own sidebar thread, in the shapes its lines actually have.
const thread = [
  { id: 'w-1', ts: T, source: 'agent', patch: { title: 'The sidebar, five ways, one of them deleting it. Say a letter.', status: 'open', body: 'You are right and it is measurable.' } },
  { id: 'w-1', ts: T + 4 * min, source: 'founder', patch: { answer: 'Actually I really like the panel unit design.' } },
  { id: 'w-1', ts: T + 4 * min, source: 'agent', epoch: 1, claim: { holder: 'mcp-68686', leaseUntil: T + 9 * min }, patch: { status: 'claimed' } },
  { id: 'w-1', ts: T + 5 * min, source: 'agent', epoch: 1, claim: { holder: 'mcp-68686', leaseUntil: T + 10 * min }, patch: {}, heartbeat: true },
  { id: 'w-1', ts: T + 27 * min, source: 'agent', epoch: 1, patch: { title: 'The panel unlit is built, both quirks fixed.', body: 'B is built.' } },
  { id: 'w-1', ts: T + 36 * min, source: 'agent', epoch: 1, release: true },
  { id: 'w-1', ts: T + 37 * min, source: 'system', patch: { answeredThrough: T + 4 * min } },
  { id: 'w-1', ts: T + 42 * min, source: 'agent', patch: { status: 'done', result: 'Merged. The panel unlit is in main as 94e3626.' } },
  { id: 'w-1', ts: T + 46 * min, source: 'founder', patch: { answer: 'A couple issues I have noticed.' } },
  { id: 'w-1', ts: T + 46 * min, source: 'founder', patch: { status: 'open' } },
];

describe('what the ledger says happened', () => {
  it('reads her thread as the sentences she would use', () => {
    expect(threadEvents(thread).map((e) => e.said)).toEqual([
      'An agent opened this',
      'You replied',
      'An agent picked it up',
      'It renamed itself',
      'It came back to you',
      'You replied',
      'You sent it back',
    ]);
  });

  // A worker holding a task for an hour did ONE thing, not thirty. The lease is
  // the bulk of the file and none of it is news.
  it('says nothing about heartbeats, releases or the answer bookkeeping', () => {
    const noise = threadEvents([
      { id: 'w-1', ts: T, source: 'agent', epoch: 1, claim: { holder: 'x', leaseUntil: T }, patch: {}, heartbeat: true },
      { id: 'w-1', ts: T, source: 'agent', epoch: 1, release: true },
      { id: 'w-1', ts: T, source: 'system', patch: { answeredThrough: T } },
      { id: 'w-1', ts: T, source: 'agent', patch: { priority: 7, labels: ['founder'] } },
    ]);
    expect(noise).toEqual([]);
  });

  // Most of the inbox is filed BY agents, and she composes directives. Putting
  // her name on an agent's words inside her own thread is the one thing this
  // must never do; the line's own source is the answer, not a guess from kind.
  it('credits the first message to whoever wrote it', () => {
    const hers = [{ id: 'w-1', ts: T, source: 'founder', patch: { title: 'do this', status: 'open', body: 'the whole plan' } }];
    expect(threadEvents(hers)[0]).toMatchObject({ who: 'you', said: 'You opened this', words: 'the whole plan' });
  });

  // What the fold cannot answer at all: it keeps the latest title, so the old
  // one exists only in the line before.
  it('says what a renamed row used to be called', () => {
    expect(threadEvents(thread)[3].words).toBe('was "The sidebar, five ways, one of them deleting it. Say a letter."');
  });

  it('carries the words in full, so the component decides how much is shown', () => {
    expect(threadEvents(thread)[4].words).toBe('Merged. The panel unlit is in main as 94e3626.');
  });

  // One line, one event: a worker that rewrites the row and closes it in the
  // same write did one thing, and her reply outranks anything set beside it.
  it('lets the most newsworthy field on a line speak, and only it', () => {
    const both = threadEvents([
      { id: 'w-1', ts: T, source: 'agent', patch: { title: 'first', status: 'open' } },
      { id: 'w-1', ts: T + min, source: 'agent', patch: { title: 'renamed', status: 'done', result: 'the outcome' } },
    ]);
    expect(both.map((e) => e.said)).toEqual(['An agent opened this', 'It came back to you']);
  });

  it('reads an undone send as the withdrawal it is, not as words', () => {
    const undone = threadEvents([{ id: 'w-1', ts: T, source: 'founder', patch: { answer: '(withdrawn)' } }]);
    expect(undone).toEqual([{ at: T, who: 'you', said: 'You withdrew your reply' }]);
  });

  it('tells her close from an agent\'s', () => {
    const closes = threadEvents([
      { id: 'w-1', ts: T, source: 'founder', patch: { status: 'done' } },
      { id: 'w-1', ts: T + min, source: 'agent', patch: { status: 'done' } },
      { id: 'w-1', ts: T + 2 * min, source: 'agent', patch: { status: 'blocked' } },
    ]);
    expect(closes.map((e) => e.said)).toEqual(['You marked it done', 'It closed this', 'It stopped and asked you']);
  });
});

// Her third correction, and the one with a cause worth remembering: the drawing
// wrote "Yest 6:07pm" in a right-aligned column, so the only row carrying a word
// was also the only one whose left edge stuck out, and the word read as "yes".
describe('the day', () => {
  it('is written out and never abbreviated', () => {
    const now = new Date('2026-08-13T21:00:00').getTime();
    expect(dayHeading(new Date('2026-08-13T06:07:00').getTime(), now)).toBe('Today');
    expect(dayHeading(new Date('2026-08-12T18:07:00').getTime(), now)).toBe('Yesterday');
    expect(dayHeading(new Date('2026-08-06T18:07:00').getTime(), now)).toMatch(/Thu.*Aug.*6/);
    expect(dayHeading(new Date('2026-08-06T18:07:00').getTime(), now)).not.toMatch(/Yest/);
  });

  it('groups the events under it in the order they happened', () => {
    const now = new Date('2026-08-13T21:00:00').getTime();
    const days = byDay(threadEvents([
      { id: 'w-1', ts: new Date('2026-08-12T18:07:00').getTime(), source: 'agent', patch: { title: 'a', status: 'open' } },
      { id: 'w-1', ts: new Date('2026-08-13T09:00:00').getTime(), source: 'founder', patch: { answer: 'yes' } },
      { id: 'w-1', ts: new Date('2026-08-13T09:30:00').getTime(), source: 'agent', patch: { status: 'done' } },
    ]), now);
    expect(days.map((d) => [d.day, d.events.length])).toEqual([['Yesterday', 1], ['Today', 2]]);
  });
});

// What a line shows is a QUOTE of what was written, not a rendering of it: a
// worker's markdown inside a ledger line is noise, and the message itself is the
// row in the pane, one glance away.
describe('the quote', () => {
  it('takes the format\'s punctuation off and keeps the words', () => {
    expect(readable('## Context\nMerged into `main`, **green**.')).toBe('Context\nMerged into main, green.');
  });

  it('drops an image nobody can read as text, and keeps what a link said', () => {
    expect(readable('Look: ![pasted.png](attachments/pasted.png)')).toBe('Look:');
    expect(readable('see [the drawing](designs/a.html)')).toBe('see the drawing');
  });
});
