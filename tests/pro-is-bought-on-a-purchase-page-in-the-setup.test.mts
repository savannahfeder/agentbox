// PRO IS BOUGHT ON A PURCHASE PAGE IN THE SETUP (w-fbe5e95dea, 2026-11-10).
//
// The founder, after the plan step went in: "also i see no plan purchase page
// or anything (that was critical)". Picking Pro only skipped ahead to inviting
// people; nothing ever took payment. Now Pro goes on to name the team (it is
// made even with nobody invited, since seats are bought for a team), then to
// a purchase page: what Pro includes, when the first charge comes, and Add a
// card, which opens the team's Stripe checkout in the browser. The page waits
// there and moves on by itself once the cloud says the team has seats.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { proIncludes, setupSteps, teamPaid } from '../renderer/src/setup-split.ts';
import { TEAM } from '../cloud/gateway/plans.mjs';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');

describe('where the purchase page comes', () => {
  it('after the team is named, for Pro', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: false, project: true, signedIn: false, plan: 'pro' })).toEqual(['chats', 'account', 'plan', 'invite', 'pay', 'look']);
  });
  it('nowhere for Free, or for someone joining a team that is already paid for', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: false, project: true, signedIn: false, plan: 'free' })).not.toContain('pay');
    expect(setupSteps({ chats: 3, team: true, teammates: false, project: true, signedIn: true, plan: 'pro', onTeam: true })).not.toContain('pay');
  });
});

describe('what the page says', () => {
  const ends = Date.UTC(2026, 10, 24, 12);
  it('lists what Pro brings, at the cloud’s own numbers', () => {
    const lines = proIncludes(ends);
    expect(lines[0]).toBe('Your team in one inbox');
    expect(lines[1]).toBe(`${TEAM.agentsPerSeat} cloud agents at once, ${TEAM.hoursPerSeat} hours a month each`);
  });
  it('says when the first charge comes, and that cancelling before then costs nothing', () => {
    expect(proIncludes(ends)[2]).toBe('Nothing to pay until Nov 24. Cancel before then and pay nothing.');
  });
});

describe('when the page moves on', () => {
  it('once the team has seats, and not while it is still on its trial alone', () => {
    expect(teamPaid({ signedIn: true, team: { trial: false, seats: 1 } })).toBe(true);
    expect(teamPaid({ signedIn: true, team: { trial: true, seats: 0 } })).toBe(false);
    expect(teamPaid({ signedIn: true })).toBe(false);
    expect(teamPaid(null)).toBe(false);
  });
});

describe('the page on screen', () => {
  it('opens the team’s checkout and waits for the cloud to say it is paid', () => {
    expect(split).toMatch(/\} else if \(step === 'pay'\) \{/);
    expect(split).toMatch(/await api\.cloudAccountPay\('team'\)/);
    expect(split).toMatch(/const paid = teamPaid\(await api\.cloudAccountPlan\(\)\); if \(live && paid\) next\(\);/);
  });
  it('moves from the team’s name to the email field on Enter, where Enter on nothing goes on', () => {
    // Walking it, Enter in "Name your team" did nothing at all.
    expect(split).toMatch(/<input className="ss-input" data-ss-enter="to-email" placeholder="Name your team"/);
    expect(split).toMatch(/if \(typing && enter === 'to-email'\) \{ e\.preventDefault\(\); document\.querySelector<HTMLInputElement>\('\.setup-split input\[data-ss-enter="add"\]'\)\?\.focus\(\); return; \}/);
  });
  it('makes the team for Pro even when nobody is invited yet', () => {
    expect(split).toMatch(/if \(!list\.length && \(plan !== 'pro' \|\| p\.snap\?\.team\?\.team\)\) \{ next\(\); return; \}/);
  });
});
