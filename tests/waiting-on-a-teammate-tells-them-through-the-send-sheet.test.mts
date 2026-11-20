// WAITING ON A TEAMMATE TELLS THEM, THROUGH THE SEND SHEET (2026-11-20).
//
// Synthetic team run: Sam set his "Payment amount in cents or decimals" thread
// to More actions › Waits on… › Theo. Theo was never told: nothing in his
// Needs you, nothing on Sam's page for him. Sam saw only a "Waits on Theo"
// chip, with no note box and nothing saying Theo knew. Waits on… was a third
// door to what Help and Review do. Picking a teammate there now opens the
// send sheet on them, so the wait comes with a message in their inbox; a
// task's block, a thread and someone off the team stay a plain wait.
// Measured by reading the menu's wiring and the rule it uses.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { personToAsk } from '../renderer/src/threads/ThreadMenu.tsx';

describe('a wait that is a person', () => {
  it('asks them through the sheet', () => {
    expect(personToAsk('person:p-theo', { blocks: false, canAsk: true })).toBe('p-theo');
  });
  it('stays a plain wait on a task, a thread, someone off the team, or where nothing can be sent', () => {
    expect(personToAsk('person:p-theo', { blocks: true, canAsk: true })).toBeNull();
    expect(personToAsk('w-9', { blocks: false, canAsk: true })).toBeNull();
    expect(personToAsk('card:p-theo:w-9', { blocks: false, canAsk: true })).toBeNull();
    expect(personToAsk('name:Legal', { blocks: false, canAsk: true })).toBeNull();
    expect(personToAsk('person:p-theo', { blocks: false, canAsk: false })).toBeNull();
  });
  it('is what the Waits on menu does on a press', () => {
    const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');
    expect(menu).toContain("const ask = personToAsk(c.id, { blocks, canAsk: !!share });");
    expect(menu).toContain("if (ask) { setWaiting(false); openSend([ask], wantFirst(step) ?? 'review'); return; }");
  });
});
