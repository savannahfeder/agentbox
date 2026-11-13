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
import { cloudShowcase, PRO_PITCH, setupSteps, teamPaid } from '../renderer/src/setup-split.ts';
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
  // The founder on the first version, a card of three ticked lines under "Start Pro.": "needs a
  // more compelling card that really convinces peope to use it (cloud first)", "make it clear
  // that with this plan each agent gets its own cloud computer", "this is too convoluted, i dont
  // even want to read", and "this should also be skibppable".
  // On the second: "Pro is NOT a 14 day free trial. We can make it 7 days", "remove the per
  // person", and "pro is not JUST cloud computers (though that is 90% of it). the multiplayer is
  // important, and i think you get cloud storage for artifacts too", shown "on the right side
  // rather than keeping the product the same".
  it('names what Pro brings in three short lines, the cloud computer first', () => {
    expect(PRO_PITCH.head).toBe('Upgrade to Pro.');
    expect(PRO_PITCH.perks.map((p) => p.title)).toEqual(['A computer for every agent', 'Your team in one inbox', 'Files saved in the cloud']);
  });
  it('gives seven free days, and the price with no per person', () => {
    expect(TEAM.trialDays).toBe(7);
    expect(PRO_PITCH.cta).toBe('Try Pro free for 7 days');
    expect(PRO_PITCH.terms).toBe(`Then $${TEAM.dollarsPerSeat} a month. Cancel any time.`);
    expect(JSON.stringify(PRO_PITCH)).not.toMatch(/per person|a person/);
  });
});

describe('the right side of the purchase page', () => {
  const show = fs.readFileSync(new URL('../renderer/src/components/ProShowcase.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');
  it('shows Pro in place of the app', () => {
    expect(split).toMatch(/if \(step === 'pay'\) root\.dataset\.setupPro = ''; else delete root\.dataset\.setupPro;/);
    expect(css).toMatch(/:root\[data-setup-pro\] #root \{ visibility: hidden; opacity: 0; \}/);
    expect(split).toMatch(/\{step === 'pay' && <ProShowcase agents=\{cloudShowcase\(p\.chats\.map\(\(t\) => t\.title\)\)\} team=\{p\.snap\?\.team\?\.team\?\.name \?\? null\} \/>\}/);
  });
  it('draws a card for each line on the left, in the same order', () => {
    expect([...show.matchAll(/data-perk="(\w+)"/g)].map((m) => m[1])).toEqual(PRO_PITCH.perks.map((p) => p.id));
  });
});

describe('the agents drawn on their own computers', () => {
  it('are the person’s own chats first', () => {
    expect(cloudShowcase(['Fix the crash', 'Add retries', 'Write tests'])).toEqual(['Fix the crash', 'Add retries', 'Write tests', 'Fix the flaky date picker test', 'Add a health check endpoint', 'Profile the slowest page']);
  });
  it('are always six, however many chats there are', () => {
    expect(cloudShowcase([])).toHaveLength(6);
    expect(cloudShowcase(Array.from({ length: 20 }, (_, i) => `Chat ${i}`))).toEqual(['Chat 0', 'Chat 1', 'Chat 2', 'Chat 3', 'Chat 4', 'Chat 5']);
  });
  it('never show the same agent twice, or a blank one', () => {
    const out = cloudShowcase(['  ', 'Add a health check endpoint']);
    expect(new Set(out).size).toBe(6);
    expect(out).not.toContain('');
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
  it('lists what Pro brings, and can be skipped', () => {
    expect(split).toMatch(/PRO_PITCH\.perks\.map\(\(k\) => <div key=\{k\.id\} className="ss-perk">/);
    expect(split).toMatch(/: PRO_PITCH\.cta, \(\) => void pay\(\), payState !== 'opening'\)\}\{quiet\('Skip for now', next\)\}/);
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
