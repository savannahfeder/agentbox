// A TEST COPY OFF THE CLOUD NEVER SENDS WORK TO THE REAL CLOUD.
//
// On 2026-11-13 a power test started without --cloud sent its tester's
// threads to the Mac owner's real Agentbox Cloud: the copy's config named no
// cloudRuns, so it took the app's default, "send what does not fit here",
// and with maxConcurrentSessions 2 the third thread went. There Claude
// answered that the subscription was switched off, so every Claude thread in
// the test failed, and the tester was shown the owner's four cloud accounts.
// Measured in the copy's app.log ("w-… cloud start") and its session logs.
import { describe, it, expect } from 'vitest';

const { copyConfig } = await import('../.claude/skills/verify-agentbox/scripts/live.mjs');

describe("a copy's cloud setting", () => {
  const base = { storeRoot: '/s', engine: 'real' };

  it('is off for a copy started without --cloud', () => {
    expect(copyConfig(base).cloudRuns).toBe(false);
  });

  it('stays off through a restart, whatever the copy wrote before', () => {
    expect(copyConfig(base, { cloudRuns: null }).cloudRuns).toBe(false);
    expect(copyConfig(base, { cloudRuns: 'all' }).cloudRuns).toBe(false);
  });

  it('is left on for a copy asked onto the cloud or a stand-in cloud', () => {
    expect(copyConfig({ ...base, cloud: true }).cloudRuns).toBe('all');
    expect(copyConfig({ ...base, standInCloud: true }).cloudRuns).toBe('all');
  });
});
