// A thread you handed over says who has it on the board, as it does in the list.
//
// What broke: Theo handed his health thread to Priya, and Priya handed her
// bookings thread to Theo. In the list, each giver's thread sat in In progress
// as "With Priya" / "With Theo". Switched to the board, the same card said only
// its project ("Payments API", "Web app"), so the giver could not tell who had
// it, and beside the hand-over's reply card in Needs you ("Theo wrote back")
// it read as a second, ownerless copy of the same thread. Measured on both
// testers' board pictures and ledgers: each card was the giver's own thread,
// closed "Given to …", with the hand-over task still open.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { handedOnWord } from '../renderer/src/threads/page-rules.ts';
import { sentWords, threadLink } from '../shared/thread-link.mts';
import { GIVEN_TASK } from '../shared/team-rules.mts';

const THEO = 'theo';
const PRIYA = 'priya';
const thread = (o: Record<string, unknown> = {}) => ({ id: 'w-health', product: 'payments-api', status: 'done', answer: 'Given to Priya Shah.\n\nPlease take over.', ...o });
const task = (o: Record<string, unknown> = {}) => ({
  id: 't1', product: 'dm', labels: [GIVEN_TASK], status: 'open', assignee: PRIYA, createdBy: THEO, people: [THEO, PRIYA],
  body: sentWords('Node Payments API liveness route', threadLink(THEO, 'w-health')!, 'Please take over.'), ...o,
});

describe('the word on a thread you handed over', () => {
  it('is With and their first name while they hold it', () => {
    expect(handedOnWord(thread() as never, [task()] as never, THEO)).toBe('With Priya');
  });

  it('says they finished it once they closed the task', () => {
    expect(handedOnWord(thread() as never, [task({ status: 'done', wrote: { status: { by: PRIYA, ts: 9 } } })] as never, THEO)).toBe('Priya finished it');
  });

  it('says only whom it was handed to when the task is not on this computer', () => {
    expect(handedOnWord(thread() as never, [] as never, THEO)).toBe('Handed to Priya');
  });

  it('is nothing on a thread that was closed, not handed over', () => {
    expect(handedOnWord(thread({ answer: 'Done. The route returns 200.' }) as never, [task()] as never, THEO)).toBeNull();
    expect(handedOnWord(thread({ status: 'open' }) as never, [task()] as never, THEO)).toBeNull();
  });
});

describe('the list and the board', () => {
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  const board = pages.slice(pages.indexOf('export function InboxBoard'));
  const row = pages.slice(0, pages.indexOf('export function InboxBoard'));

  it('both say it with the one rule', () => {
    expect(row).toMatch(/handedOnWord\(item, team \? allItems \?\? \[\] : null, team\?\.me \?\? null\)/);
    expect(board).toMatch(/handedOnWord\(e\.item, team \? allItems \?\? \[\] : null, team\?\.me \?\? null\)/);
  });
});
