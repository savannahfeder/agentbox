// NAMING A THREAD IS NOT NEWS ABOUT IT.
//
// Found in the 3-hour cloud test, 2026-10-22. The app names every unnamed open
// thread, one every fifteen seconds (`nameTheRows`, main/supervisor.mjs), and
// the fold moved `updatedAt` on every line it read, the name included. Lists
// break ties on `updatedAt` (`byRunningOrder`, renderer/src/list-rules.ts), so
// threads nobody had touched for days climbed to the top of the inbox reading
// "updated just now": 31 old rows in one test copy in seven minutes.
//
// The rule is applied on READ, like the heartbeat rule above it in the fold,
// because the lines that did it are already in the ledger and a row already
// pushed up has to come back down.
//
// Covered here: the name alone (the reported case), the name arriving with
// anything else (still news, either side of the boundary), an ordinary write
// (must NOT match), and the two things the name write still has to do — set
// the name, and record when it was written, which is what tells a rename from
// a naming (`rowTitle`).

import { describe, it, expect } from 'vitest';
import { foldWorkItems } from '../shared/work-items.mjs';

const T0 = 1_792_000_000_000;
const MIN = 60_000;

const opened = { id: 'w-old', ts: T0, source: 'founder', patch: { title: 'Look at the usage bar', body: 'it reads 0' } };
const named = (at) => ({ id: 'w-old', ts: at, source: 'agent', patch: { label: 'Usage bar reads zero' } });

const one = (lines) => foldWorkItems(lines, T0 + 100 * MIN).get('w-old');

describe('a line that only names a thread', () => {
  it('leaves the thread where it was in the list', () => {
    const item = one([opened, named(T0 + 90 * MIN)]);
    expect(item.updatedAt).toBe(T0);
  });

  it('still names it, and still records when it was named', () => {
    const item = one([opened, named(T0 + 90 * MIN)]);
    expect(item.label).toBe('Usage bar reads zero');
    expect(item.wrote.label.ts).toBe(T0 + 90 * MIN);
  });

  it('is the only line on the row, so the row has a moment all the same', () => {
    const item = one([named(T0 + 90 * MIN)]);
    expect(item.createdAt).toBe(T0 + 90 * MIN);
    expect(item.updatedAt).toBe(T0 + 90 * MIN);
  });
});

describe('what still moves a thread', () => {
  it('a name arriving with anything else: the something else is news', () => {
    const item = one([opened, { id: 'w-old', ts: T0 + 90 * MIN, source: 'agent', patch: { label: 'Usage bar reads zero', status: 'claimed' } }]);
    expect(item.updatedAt).toBe(T0 + 90 * MIN);
  });

  it('an ordinary write', () => {
    const item = one([opened, { id: 'w-old', ts: T0 + 90 * MIN, source: 'agent', patch: { note: 'had a look' } }]);
    expect(item.updatedAt).toBe(T0 + 90 * MIN);
  });

  it('a word from the person on a thread that has already been named', () => {
    const item = one([opened, named(T0 + 10 * MIN), { id: 'w-old', ts: T0 + 20 * MIN, source: 'founder', patch: { answer: 'fix it' } }]);
    expect(item.updatedAt).toBe(T0 + 20 * MIN);
  });
});
