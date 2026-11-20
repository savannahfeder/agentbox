// A THREAD YOU HANDED ON SAYS WHERE IT WENT, AND A REPLY CANNOT TAKE IT BACK (2026-11-20).
//
// On a synthetic team, Sam handed "Payment amount as cents or decimal" to Theo
// with Hand it over. His thread then said "You marked it done" and its row
// read DONE, so he could not tell whether Theo had it open or finished. A
// stray draft in the reply box then went out: the reply reopened the thread,
// wrote over "Given to Theo Okafor: …", and the "TO Theo" chip went. Z took
// the reply back by writing "(withdrawn)" over the answer, so the hand-over
// stayed gone. Measured on the ledger lines and the row: the close and the
// hand-over are one line, drawn as a plain close, and a reply on a handed-on
// thread was written like any other.
//
// The line now says who it was given to, the row says "Given to Theo", and a
// reply on a thread you gave away is refused in the window and in main with
// the way to take it back, so nothing cancels a hand-over without a word.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { statusCell } from '../renderer/src/status-word.ts';
import { handedToName, replyOnHandedOn } from '../shared/thread-cards.mts';
import type { LedgerLine, WorkItem } from '../renderer/src/types.ts';

const T = Date.UTC(2026, 10, 20, 2, 26);
const GIVEN = 'Given to Theo Okafor: Hi Theo, handing this to you since the payment routes overlap.';
const row = (o: Partial<WorkItem> = {}) => ({ id: 'w-cents', product: 'payments-api', title: 'Payment amount as cents or decimal', status: 'done', answer: GIVEN, labels: ['founder'], updatedAt: T, createdAt: T - 3_600_000, ...o }) as WorkItem;

describe('the thread you handed on', () => {
  it('says you gave it to Theo, not that you marked it done', () => {
    const lines = [
      { id: 'w-cents', ts: T - 60_000, source: 'founder', patch: { body: 'Should amounts be cents or decimals?' } },
      // handOn writes the answer, then the close a moment after, as Sam's ledger has them.
      { id: 'w-cents', ts: T, source: 'founder', patch: { answer: GIVEN } },
      { id: 'w-cents', ts: T + 1, source: 'founder', patch: { status: 'done' } },
    ] as LedgerLine[];
    const said = threadEvents(lines).map((e) => (e as { said?: string }).said).filter(Boolean);
    expect(said).toContain('You gave it to Theo');
    expect(said).not.toContain('You marked it done');
  });

  it('still says you marked it done when you closed it yourself', () => {
    const lines = [
      { id: 'w-a', ts: T - 1, source: 'founder', patch: { answer: 'Looks right, thanks.' } },
      { id: 'w-a', ts: T, source: 'founder', patch: { status: 'done' } },
    ] as LedgerLine[];
    expect(threadEvents(lines).map((e) => (e as { said?: string }).said)).toContain('You marked it done');
  });

  it('reads "Given to Theo" on its row, not Done', () => {
    const cell = statusCell(row(), { now: T });
    expect(cell.word).toBe('Given to Theo');
    expect(statusCell(row({ answer: 'Thanks, all good.' }), { now: T }).word).not.toBe('Given to Theo');
  });

  it('names who has it', () => {
    expect(handedToName(row())).toBe('Theo Okafor');
    expect(handedToName(row({ answer: 'Given to Theo Okafor.' }))).toBe('Theo Okafor');
    expect(handedToName(row({ status: 'open' }))).toBeNull();
  });
});

describe('a reply on a thread you handed on', () => {
  it('is refused with the way to take it back, the reported one', () => {
    expect(replyOnHandedOn(row(), 'please also check the refunds route')).toBe('You gave this to Theo. Write to Theo, or reopen it to take it back.');
  });

  it('is not refused once you have reopened it, or on a thread you closed yourself', () => {
    expect(replyOnHandedOn(row({ status: 'open' }), 'more')).toBeNull();
    expect(replyOnHandedOn(row({ answer: 'Done, thanks.' }), 'more')).toBeNull();
  });

  it('leaves the app\'s own writes alone: an empty reply and an undo', () => {
    expect(replyOnHandedOn(row(), '   ')).toBeNull();
    expect(replyOnHandedOn(row(), '(withdrawn)')).toBeNull();
  });

  it('is refused by the window before it is sent, and by main for anything else that writes', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/const handedOff = replyOnHandedOn\(item, text\);\s*if \(handedOff\) \{ putBack\(new Error\(handedOff\)\); return; \}/);
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    expect(ipc).toMatch(/replyOnHandedOn\(/);
  });
});
