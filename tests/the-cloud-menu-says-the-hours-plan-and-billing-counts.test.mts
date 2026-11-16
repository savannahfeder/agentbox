// THE CLOUD MENU SAYS THE HOURS PLAN AND BILLING COUNTS.
//
// What broke (2026-11-16, overnight Cloud testers): the Cloud menu said about
// 400 agent-hours this month while Settings > Plan and Billing said about 510
// hours used. The menu summed this Mac's own ledger (main/cloud/usage.mts):
// only runs started from this Mac, only once they came home, at the
// sandbox's wall time, from the Mac's local month. Billing shows the server's
// `usedSeconds`, every run on the account from every computer and the phone,
// which is what the plan's hours are spent on. Measured in the fixtures
// `cloud=managed&cloudplan=pro`: menu "1.6 agent-hours", billing "88 of 400
// hours"; after the fix the menu says 88.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudMonthLine } from '../renderer/src/cloud-menu';

const mine = { runs: 31, agentHours: 400.2, estimatedCost: 0, costPerAgentHour: null };

describe('the Cloud menu\'s hours this month', () => {
  it('says the server\'s count once Agentbox Cloud has said it', () => {
    expect(cloudMonthLine(mine, { signedIn: true, usedSeconds: 510.4 * 3600 })).toBe('510.4 agent-hours');
  });

  it('says the server\'s count when it is under this Mac\'s, as after a month turns over in UTC first', () => {
    expect(cloudMonthLine(mine, { signedIn: true, usedSeconds: 12 * 3600 })).toBe('12 agent-hours');
  });

  it('says nothing used when the server counts none, whatever this Mac kept', () => {
    expect(cloudMonthLine(mine, { signedIn: true, usedSeconds: 0 })).toBe('Nothing in the cloud yet this month');
  });

  it('keeps this Mac\'s own count where no server has said one', () => {
    expect(cloudMonthLine(mine)).toBe('400.2 agent-hours');
    expect(cloudMonthLine(mine, null)).toBe('400.2 agent-hours');
    expect(cloudMonthLine(mine, { signedIn: false })).toBe('400.2 agent-hours');
    expect(cloudMonthLine(mine, { signedIn: true })).toBe('400.2 agent-hours');
  });

  it('is handed the plan the app read, all the way to the menu', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toMatch(/cloudMonthLine\(cloud\.month, cloudPlan\)/);
    expect(pages).toMatch(/<CloudButton cloud=\{cloud\} cloudPlan=\{cloudPlan\}/);
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/<HeaderActions[\s\S]{0,1200}cloudPlan=\{cloudPlan\}/);
  });
});
