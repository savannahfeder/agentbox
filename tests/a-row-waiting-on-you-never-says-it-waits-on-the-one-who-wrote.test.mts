// A ROW WAITING ON YOU NEVER SAYS IT WAITS ON THE PERSON WHO WROTE TO YOU.
//
// Jordan: "A row said WAITING ON SOFIA even though it was
// Sofia's note waiting on me." She commented on a file in a record he opened, so
// the newest message was still his and the word named her. A row held in Needs you
// is on you, whoever spoke last. Opened, the same row read DONE at the top.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { waitingWord } from '../renderer/src/threads/page-rules.ts';

const ME = 'jordan';
const direct = { slug: 'dm', team: { projectId: 'x', direct: true, sharedBy: ME, people: ['sofia'] } };
const work = { slug: 'w', team: { projectId: 'y' } };
const nameOf = () => 'Sofia';
const hisLast = { people: [ME, 'sofia'], createdBy: ME, status: 'open', wrote: { body: { ts: 1, by: ME } } };

describe('in Needs you', () => {
  it('her note on a thread where he spoke last is on him', () => {
    expect(waitingWord(hisLast, direct, ME, nameOf, { inNeedsYou: true })).toBe('Waiting on you');
  });
  it('a row held by her in a shared project that is in his list is too', () => {
    expect(waitingWord({ assignee: 'sofia' }, work, ME, nameOf, { inNeedsYou: true })).toBe('Waiting on you');
  });
});

describe('out of Needs you', () => {
  it('the same row still names her', () => {
    expect(waitingWord(hisLast, direct, ME, nameOf)).toBe('Waiting on Sofia');
    expect(waitingWord({ assignee: 'sofia' }, work, ME, nameOf)).toBe('Waiting on Sofia');
  });
  it('nobody signed in says only Waiting', () => {
    expect(waitingWord(hisLast, direct, null, nameOf, { inNeedsYou: true })).toBe('Waiting');
  });
});

it('the row passes which tab it is drawn under, and a Done word in Needs you is not left standing', () => {
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  expect(pages).toMatch(/inNeedsYou: tab === 'inbox'/);
  expect(pages).toMatch(/peopleWaitOnYou/);
});
