// THE PHONE'S BANNER SAYS AGENTBOX IS NOT OPEN, AND TO OPEN IT (w-a4465e645b).
//
// The banner over the phone's inbox said "Your computer was last online 3
// hours ago. What you send waits for it." What it measures is when Agentbox on
// the computer last wrote to the account, so a laptop that was on with
// Agentbox quit read as a computer that was off, and nothing said what to do.
// The owner picked this wording from five drawn in the phone preview. Measured
// on phoneStatusLine: before the change every away line began "Your computer".
import { describe, it, expect } from 'vitest';
import { phoneStatusLine } from '../renderer/src/phone-rows.ts';

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const line = (awayMs, cloud = false) => phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - awayMs, cloud }, NOW);

describe('the banner with Agentbox away and no cloud', () => {
  it('names Agentbox and says to open it', () => {
    expect(line(3 * 3600_000)).toBe('Agentbox on your computer was last online 3 hours ago. Open it to run what you send.');
  });
  it('shows once Agentbox has missed its heartbeats, and not a moment before', () => {
    expect(line(89_000)).toBe(null);
    expect(line(91_000)).toMatch(/^Agentbox on your computer was last online .+\. Open it to run what you send\.$/);
  });
  it('leaves the cloud line alone, since the cloud carries on without Agentbox open', () => {
    expect(line(3 * 3600_000, true)).toBe('Your computer is off. Replies carry on in Agentbox Cloud.');
  });
});
