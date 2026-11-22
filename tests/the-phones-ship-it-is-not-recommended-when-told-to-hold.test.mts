// On 2026-11-20 (b9df49726, c9fdc15b2) the desktop stopped marking Ship it
// "recommended" when you told the agent not to ship, or the agent said the
// change was not ready (Focus.tsx `shipAsk`, `held`). The phone builds the
// same offer from the same function (mobile/src/lib/thread.ts) but never
// passed `held`, so it still recommended shipping work you had held. Found by
// the phone parity audit of 2026-11-21.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agentSaidNotReady, saidNotToShip, shipOfferFor } from '../renderer/src/ship-offer';

const thread = fs.readFileSync('mobile/src/lib/thread.ts', 'utf8');
const focus = fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8');
const HOLD = '{ held: saidNotToShip(item.body, item.answer) || agentSaidNotReady(item.result) }';

describe("the phone's Ship it", () => {
  it('is held by the same words as on the desktop', () => {
    expect(focus).toContain(HOLD);
    expect(thread).toContain(HOLD);
  });
  it('recommends nothing once held, and keeps its options', () => {
    const stands = { committed: true, uncommitted: false } as Parameters<typeof shipOfferFor>[0];
    const open = shipOfferFor(stands, null);
    const held = shipOfferFor(stands, null, { held: true });
    expect(open?.options.some((o) => o.recommended)).toBe(true);
    expect(held?.options.length).toBe(open?.options.length);
    expect(held?.options.some((o) => o.recommended)).toBe(false);
  });
  it('the rules it reads are the desktop rules', () => {
    expect(typeof saidNotToShip).toBe('function');
    expect(typeof agentSaidNotReady).toBe('function');
  });
});
