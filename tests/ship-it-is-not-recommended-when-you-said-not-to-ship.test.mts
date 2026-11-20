// SHIP IT IS NOT RECOMMENDED WHEN YOU SAID NOT TO SHIP (2026-11-20).
//
// Rounds one and three of the team test: a tester told the agent "do not merge
// or deploy", the run left a change, and the thread offered "Ship it
// (recommended)" beside "Discard the change". Both choices are still offered;
// only the recommendation goes, because the person's own words outrank it.
// Measured by the pure offer the thread page draws.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { agentSaidNotReady, saidNotToShip, shipOfferFor } from '../renderer/src/ship-offer.ts';

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

// Round seven: the agent itself wrote that the route "is not production-ready"
// and persistence must come first, and "Ship it" sat right under it. The agent's
// own answer counts when it says the change is not ready; its usual "without
// pushing" does not, or every committed change would lose the recommendation.
describe('when the agent says the change is not ready', () => {
  it('holds the recommendation', () => {
    expect(agentSaidNotReady('The payment route is not production-ready. Persistence must come first.')).toBe(true);
    expect(agentSaidNotReady('It is not ready to ship until retries are covered.')).toBe(true);
    expect(agentSaidNotReady('It is not yet ready to merge.')).toBe(true);
    // Round eight: "shared durable storage is required before production and nothing shipped".
    expect(agentSaidNotReady('Shared durable storage is required before production, so nothing shipped.')).toBe(true);
    // Round eleven: both testers were offered "Ship it, recommended" under these.
    expect(agentSaidNotReady('Before shipping, I recommend rejecting invalid timestamps on new bookings.')).toBe(true);
    expect(agentSaidNotReady('The full suite has a failure in the export test, and the retry store is in memory.')).toBe(true);
    expect(agentSaidNotReady('Two tests failed: the export test and the refund test.')).toBe(true);
    expect(agentSaidNotReady('Coordinate durable storage with Sam before it goes to production.')).toBe(true);
    // Round twelve's retest.
    expect(agentSaidNotReady('The full suite had four passing tests and one failure.')).toBe(true);
    expect(agentSaidNotReady('The full suite has one existing failure in the overlap test.')).toBe(true);
    expect(agentSaidNotReady('The full suite still fails the existing overlap test.')).toBe(true);
    expect(agentSaidNotReady('Mixed time formats or offsets can produce incorrect results.')).toBe(true);
    expect(agentSaidNotReady('Keys are lost on restart, so a retry after a deploy can charge twice.')).toBe(true);
  });
  it('does not read a passing suite or a past fix as not ready', () => {
    expect(agentSaidNotReady('0 tests failed and 41 passed.')).toBe(false);
    expect(agentSaidNotReady('The test that failed before now passes.')).toBe(false);
    expect(agentSaidNotReady('I ran the suite before committing. Everything passes.')).toBe(false);
    expect(agentSaidNotReady('All 13 tests pass with no failures.')).toBe(false);
    expect(agentSaidNotReady('It no longer produces incorrect totals.')).toBe(false);
  });
  it('does not hold it for a change that is ready, or one committed without pushing', () => {
    expect(agentSaidNotReady('Committed on the branch without pushing. Ready to ship.')).toBe(false);
    expect(agentSaidNotReady('All tests pass.')).toBe(false);
    expect(agentSaidNotReady(null)).toBe(false);
  });
  it('is read from the result where Focus asks', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toMatch(/held: saidNotToShip\(item\.body, item\.answer\) \|\| agentSaidNotReady\(item\.result\)/);
  });
});
