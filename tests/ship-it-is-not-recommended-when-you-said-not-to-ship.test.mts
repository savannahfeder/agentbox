// SHIP IT IS NOT RECOMMENDED WHEN YOU SAID NOT TO SHIP (2026-11-20).
//
// Rounds one and three of the team test: a tester told the agent "do not merge
// or deploy", the run left a change, and the thread offered "Ship it
// (recommended)" beside "Discard the change". Both choices are still offered;
// only the recommendation goes, because the person's own words outrank it.
// Measured by the pure offer the thread page draws.
import { describe, it, expect } from 'vitest';
import { saidNotToShip, shipOfferFor } from '../renderer/src/ship-offer.ts';

const committed = { committed: true, uncommitted: false } as never;

describe('what the person said', () => {
  it('reads not to merge, ship, deploy or push, however it is put', () => {
    expect(saidNotToShip('Add request IDs. Do not merge or deploy.')).toBe(true);
    expect(saidNotToShip("Review it, but don't ship yet")).toBe(true);
    expect(saidNotToShip('Fix it without pushing anything')).toBe(true);
    expect(saidNotToShip(null, 'Never deploy on Fridays')).toBe(true);
  });
  it('does not read words that only mention shipping', () => {
    expect(saidNotToShip('Ship it when the tests pass')).toBe(false);
    expect(saidNotToShip('Write the release note for the merge')).toBe(false);
    expect(saidNotToShip(undefined)).toBe(false);
  });
});

describe('the offer', () => {
  it('recommends shipping when nobody said otherwise', () => {
    expect(shipOfferFor(committed)!.options.map((o) => o.recommended)).toEqual([true, false]);
  });
  it('keeps both choices and recommends neither when you said not to ship', () => {
    const offer = shipOfferFor(committed, null, { held: true })!;
    expect(offer.options.map((o) => [o.text, o.recommended])).toEqual([['Ship it', false], ['Discard the change', false]]);
  });
  it('still offers nothing when the run left nothing', () => {
    expect(shipOfferFor({ committed: false, uncommitted: false } as never, null, { held: true })).toBeNull();
  });
});
