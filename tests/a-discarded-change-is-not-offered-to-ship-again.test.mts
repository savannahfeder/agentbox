// A change the agent says it discarded is not offered to ship again.
//
// What broke: in the overnight Cloud test (2026-11-16, round three, twice) a
// tester picked Discard on a cloud thread and confirmed. The cloud agent
// committed the removal and answered "Discarded the runbook change. ... no net
// changes from the original state", and the thread still sat in Needs you
// under "Ship it (recommended)" and "Discard the change", with a -140 change
// badge. The app adds that offer when a run leaves a change and the agent
// offered nothing; a removal commit is a change, so it asked again.
//
// The rule: an answer that opens on "Discarded", or says there are no net
// changes, leaves no decision, as "Merged" already does. A run that only
// mentions discarding something on the way to real work still asks.
import { describe, it, expect } from 'vitest';
import { shipOfferLive } from '../renderer/src/ship-offer.ts';

const finished = (result: string) => ({ status: 'open', result, wrote: { result: { ts: 10 } } });
const live = (result: string) => shipOfferLive(finished(result), { change: true, running: false });

describe('the app\'s own Ship it offer', () => {
  it('is not made over an answer that says the change was discarded', () => {
    expect(live('**Discarded the runbook change.**\n\nCommitted its removal as cba3751. The working tree is clean, with no net changes from the original state.')).toBe(false);
    expect(live('Discarded. The release-check doc is removed in 4f523eb.')).toBe(false);
  });

  it('is not made over an answer that says nothing changed in the end', () => {
    expect(live('**Removed the scratch doc.** Removal committed in 4f523eb, so there are no net file changes and nothing was merged.')).toBe(false);
  });

  it('is still made over real work that mentions discarding something', () => {
    expect(live('**The retry fix is committed.** I discarded the first approach and kept the backoff in client.ts.')).toBe(true);
    expect(live('**Added the runbook.** Committed as cba3751.')).toBe(true);
  });
});
