// THE SETUP OFFERS A PLAN, AND PRO BRINGS THE TEAM (w-fbe5e95dea, 2026-11-10).
//
// The founder, walking the new first run: "it seems missing in onboarding is
// the payments process? we had agreed after talking with a yc founder that we
// would charge payment for people who want to go the team route. we also probs
// want to offer people cloud during their onboarding ... any paid plans should
// include multiplayer". The setup went from the account straight to inviting
// people, with "Free for 14 days." under it and no plan anywhere. It now asks
// for a plan after the account: Free, or Pro with your team and the cloud, at
// the prices the cloud already charges (cloud/gateway/plans.mjs). Inviting
// people comes only with Pro.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SETUP_PLANS, setupSteps } from '../renderer/src/setup-split.ts';
import { FREE, TEAM } from '../cloud/gateway/plans.mjs';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');

describe('the plan step', () => {
  it('comes after the account, before inviting, on a team build', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: false, project: true, signedIn: false, plan: 'pro' })).toEqual(['chats', 'account', 'plan', 'invite', 'pay', 'look']);
  });
  it('leaves out inviting when Free is picked, since the team is a paid thing', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: false, project: true, signedIn: false, plan: 'free' })).toEqual(['chats', 'account', 'plan', 'look']);
  });
  it('is not asked of someone already on a team, who goes on to invite', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: false, project: true, signedIn: true, plan: 'free', onTeam: true })).toEqual(['chats', 'invite', 'look']);
  });
  it('is not on a build with no team cloud', () => {
    expect(setupSteps({ chats: 3, team: false, teammates: false, project: true, plan: 'pro' })).not.toContain('plan');
  });
});

describe('the plans offered', () => {
  it('are Free and Pro, Free first', () => {
    expect(SETUP_PLANS.map((p) => p.id)).toEqual(['free', 'pro']);
  });
  it('price Pro as a team seat is priced, free for the trial the cloud gives', () => {
    const pro = SETUP_PLANS.find((p) => p.id === 'pro')!;
    expect(pro.price).toBe(`$${TEAM.dollarsPerSeat}`);
    // No per person: the founder took it off the purchase page (2026-11-10).
    expect(pro.per).toBe('a month');
    expect(pro.tag).toBe(`${TEAM.trialDays} days free`);
    expect(pro.sub).toBe(`Your team, plus ${TEAM.agentsPerSeat} cloud agents at once`);
  });
  it('say what Free keeps, with the cloud hours every account gets once', () => {
    const free = SETUP_PLANS.find((p) => p.id === 'free')!;
    expect(free.price).toBe('$0');
    expect(free.sub).toBe(`Just you, with ${FREE.hours} cloud hours to try`);
  });
});

describe('the step on screen', () => {
  it('lists the plans and ticks the one picked; Pro is paid for on its own page further on', () => {
    expect(split).toMatch(/\} else if \(step === 'plan'\) \{/);
    expect(split).toMatch(/SETUP_PLANS\.map\(\(pl\) => <Row key=\{pl\.id\}/);
    expect(split).toMatch(/<div className="ss-acts">\{go\('Continue', next\)\}<\/div>/);
  });
  it('no longer says the team is free for 14 days on the invite step', () => {
    expect(split).not.toMatch(/Free for 14 days\./);
  });
});
