// THE COMMAND BAR OFFERED "Waits on" WITH NOTHING AFTER IT.
//
// A power tester on a team (2026-11-23) pressed Ctrl+K on a to-do and read
// four bare "Waits on" rows between named ones. Her copy holds her teammate's
// threads in their shared project as summary lines only (no title, `by` the
// teammate): blockChoices took each for one of hers, named it by its empty
// title, pointed it at her own card, and hid the teammate's card that does
// carry the title. Measured on her ledger: twelve such rows in payments-api.
import { describe, it, expect } from 'vitest';
import { blockChoices } from '../shared/team-tasks.mts';
import { cardWait, personWait, waitChoices } from '../shared/thread-waits.mts';

const names: Record<string, string> = { lena: 'Lena Fischer', sam: 'Sam Ortiz' };
const people = [{ id: 'lena', name: 'Lena Fischer' }, { id: 'sam', name: 'Sam Ortiz' }];
const samsRow = { id: 'w-sam', product: 'payments-api', status: 'open', createdBy: 'sam', updatedAt: 9 };
const samsCard = { personId: 'sam', threadId: 'w-sam', visible: true, title: 'Optional pagination', state: 'running', updatedAt: 9 };
const lenasRow = { id: 'w-lena', product: 'payments-api', status: 'open', createdBy: 'lena', title: 'Checkout prototype', updatedAt: 8 };
const handedToLena = { id: 'w-given', product: 'payments-api', status: 'open', createdBy: 'sam', runner: 'lena', title: 'Bookings empty state', updatedAt: 7 };

describe("a to-do's Blocked by choices", () => {
  const offered = (items: object[], cards: object[] = [samsCard]) => blockChoices({
    holder: 'sam', me: 'lena', people, items: items as never, cards, nameOf: (id) => names[id] ?? 'Someone', published: () => true,
  });

  it("offer a teammate's thread once, by its card's name, not as a bare row of yours", () => {
    const out = offered([samsRow]);
    expect(out.map((c) => c.label)).toEqual(['You', 'Sam: Optional pagination']);
    expect(out.map((c) => c.id)).toEqual([personWait('lena'), cardWait('sam', 'w-sam')]);
  });

  it('never offer a choice with no name, even when no card stands for the row', () => {
    expect(offered([samsRow], []).every((c) => c.label.trim())).toBe(true);
    expect(offered([samsRow], []).map((c) => c.id)).not.toContain(cardWait('lena', 'w-sam'));
  });

  it('still offer your own threads, and one handed to you, by their names', () => {
    const out = offered([lenasRow, handedToLena], []);
    expect(out.map((c) => c.label)).toEqual(['You', 'Checkout prototype', 'Bookings empty state']);
    expect(out.map((c) => c.id)).toContain(cardWait('lena', 'w-given'));
  });
});

describe("a thread's Waits on choices", () => {
  const offered = (items: object[]) => waitChoices({
    item: { id: 'w-here', product: 'payments-api' }, me: 'lena', people, items: items as never, cards: [samsCard], nameOf: (id) => names[id] ?? 'Someone',
  });

  it("offer a teammate's thread by their card, once, and not as 'a thread'", () => {
    expect(offered([samsRow, lenasRow]).map((c) => c.label)).toEqual(['Sam', 'Sam: Optional pagination', 'Checkout prototype']);
  });
});
