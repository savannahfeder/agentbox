// SOMEONE INVITED TO A TEAM IS ASKED TO JOIN IT, NOT TO PAY.
//
// Preparing the first onboarding call (2026-11-20), the invited teammate's
// setup was read step by step: they sign in with the invited address, the
// invitation is waiting, and the next page was "Upgrade to Pro." with "Try Pro
// free for 7 days", a second subscription for a person whose seat the owner
// already pays for. The invitation only showed later, as a row in Needs you.
// Now the setup asks them to join in place of the plan page, and once they
// have joined it never offers Pro. Measured on setupSteps and on the setup's
// own source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { setupSteps } from '../renderer/src/setup-split.ts';

const base = { chats: 2, team: true, teammates: false, project: true, signedIn: false, agents: 1 };

describe('the setup of someone with an invitation waiting', () => {
  it('asks them to join in place of the plan page', () => {
    expect(setupSteps({ ...base, invited: true })).toEqual(['chats', 'account', 'join', 'look']);
  });
  it('still offers Pro to someone nobody invited', () => {
    expect(setupSteps({ ...base, invited: false })).toEqual(['chats', 'account', 'plan', 'look']);
    expect(setupSteps(base)).toEqual(['chats', 'account', 'plan', 'look']);
  });
  it('asks nothing of someone already on a team', () => {
    expect(setupSteps({ ...base, signedIn: true, onTeam: true, invited: true })).toEqual(['chats', 'look']);
  });
  it('asks nothing on a copy with no team cloud', () => {
    expect(setupSteps({ ...base, team: false, invited: true })).toEqual(['chats', 'look']);
  });
});

describe('the join page', () => {
  const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
  it('reads the invitation the cloud found for the signed-in address, and stays a join page after joining', () => {
    expect(split).toMatch(/const invite = p\.snap\?\.team\?\.invites\?\.\[0\] \?\? null;/);
    expect(split).toMatch(/invited: !!invite \|\| !!joined/);
  });
  it('joins with the same call the inbox row uses, and only on a press', () => {
    expect(split).toMatch(/await api\.teamAcceptInvite\(invite\.teamId\)/);
    expect(split).toMatch(/step === 'join'/);
  });
  it('lets them go on without joining', () => {
    expect(split).toMatch(/quiet\('Not now', next\)/);
  });
});
