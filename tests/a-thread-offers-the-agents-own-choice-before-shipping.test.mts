// A run ended on "Should I drop it in this migration?" followed by "1. Drop it
// in this migration / 2. Keep it for now and drop it in a later release", and
// it had left an uncommitted change. The box under the answer offered "1 Ship
// it (recommended) / 2 Discard the change", so pressing 1 shipped the change
// instead of answering the question (screen review of the dark tour, the
// thread page). Measured by feeding that result to parseOptions: [], because a
// list without a heading counted as choices only when one was marked
// recommended, and with no choices read the ship offer took the box.
//
// A closing numbered list right after a question is the agent's own choice,
// marked or not, and the ship offer only comes when the answer offers none.
import { describe, expect, it } from 'vitest';
import { itemOptions, parseOptions, stripOptionsSection } from '../renderer/src/format';
import { shipOfferLive } from '../renderer/src/ship-offer';

const reported = [
  'I added an `Idempotency-Key` check to `POST /payments` in `src/routes/payments.js`, and a `payment_requests` table that keeps each key with the response it got.',
  '',
  'One decision before I go on. The old unique index on `(appointment_id, amount)` now overlaps the new key. **Should I drop it in this migration?** Dropping it is simpler, but on a busy table it locks writes while it runs.',
  '',
  '1. Drop it in this migration',
  '2. Keep it for now and drop it in a later release',
].join('\n');

const thread = (result: string) => ({
  status: 'open',
  labels: [],
  body: 'A retried POST /payments can charge a clinic twice. Add an idempotency key on the route.',
  result,
  wrote: { body: { ts: 100 }, result: { ts: 200 } },
});
const changed = { change: true, running: false };
const unchanged = { change: false, running: false };

describe('an answer that asks with its own numbered choices', () => {
  it('offers those choices and not the ship offer, when the run left a change', () => {
    const item = thread(reported);
    expect(itemOptions(item)).toEqual([
      { n: 1, text: 'Drop it in this migration', recommended: false },
      { n: 2, text: 'Keep it for now and drop it in a later release', recommended: false },
    ]);
    expect(shipOfferLive(item, changed)).toBe(false);
  });

  it('offers the same choices when the run left no change', () => {
    const item = thread(reported);
    expect(itemOptions(item).map((o) => o.n)).toEqual([1, 2]);
    expect(shipOfferLive(item, unchanged)).toBe(false);
  });

  it('takes the list out of the prose, keeping the question', () => {
    const stripped = stripOptionsSection(reported);
    expect(stripped).toContain('Should I drop it in this migration?');
    expect(stripped).not.toContain('Keep it for now');
  });

  it('reads a question that ends the line before the list', () => {
    expect(parseOptions(['Which layout do you want?', '1. Columns', '2. Cards'].join('\n')).map((o) => o.text))
      .toEqual(['Columns', 'Cards']);
  });
});

describe('an answer that offers no choice of its own', () => {
  it('gets the ship offer as before when the run left a change', () => {
    const item = thread('I added an `Idempotency-Key` check to `POST /payments` and a `payment_requests` table. Tests pass.');
    expect(itemOptions(item)).toEqual([]);
    expect(shipOfferLive(item, changed)).toBe(true);
  });

  it('gets the ship offer over a closing list of what it did', () => {
    const item = thread(['Done. What I changed:', '', '1. Added the key check', '2. Added the table'].join('\n'));
    expect(itemOptions(item)).toEqual([]);
    expect(shipOfferLive(item, changed)).toBe(true);
  });

  it('gets the ship offer when the question is a paragraph earlier than the list', () => {
    const result = ['Should I worry about the old index? No, it still holds.', '', 'Steps I took:', '1. Added the check', '2. Added the table'].join('\n');
    expect(parseOptions(result)).toEqual([]);
    expect(shipOfferLive(thread(result), changed)).toBe(true);
  });

  it('gets the ship offer when the answer carries on well past a list after a question', () => {
    const result = ['Should I drop it?', '', '1. Drop it', '2. Keep it', '', 'I dropped it.', 'Tests pass.', 'The table is live.'].join('\n');
    expect(parseOptions(result)).toEqual([]);
    expect(shipOfferLive(thread(result), changed)).toBe(true);
  });
});
