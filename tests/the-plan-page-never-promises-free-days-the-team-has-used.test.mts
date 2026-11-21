// The setup's plan page said "Try Pro free for 7 days" and "First 7 days, Free"
// to every team, while the team's checkout gives only the free days left since
// the team was made, and none once 2 or fewer are left: such a team was charged
// the same day. Measured by opening the team checkout on the gateway at each
// point in a team's first week and comparing Stripe's trial end with the words
// the page drew for the same moment.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM, teamFreeDays } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { PRO_PITCH, proFreeDays, proOffer } from '../renderer/src/setup-split.ts';

const A = '11111111-1111-4111-8111-111111111111';
const DAY = 24 * 60 * 60_000;
const MADE = Date.UTC(2026, 10, 17, 9);
const ENDS = MADE + TEAM.trialDays * DAY;
const inTrial = (endsAt: number) => ({ signedIn: true, plan: 'team' as const, team: { trial: true, endsAt, seats: 0 } });

async function checkoutTrialDays(at: number): Promise<number> {
  let form: Record<string, string> = {};
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const u = new URL(url);
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') return json(200, { data: [{ id: 'price_team' }] });
    if (u.pathname === '/v1/checkout/sessions') { form = Object.fromEntries(new URLSearchParams(init.body)); return json(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }); }
    return json(404, { error: { message: 'not faked' } });
  };
  const team = { id: 'team-1', createdAt: MADE, members: [A], owners: [A] };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => k, put: async (k: string) => k, head: async (k: string) => k },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t: string) => (t === 'session-a' ? { id: A } : null),
    teams: async (p: string) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl }),
    now: () => at,
    plans: PLANS,
  });
  const key = (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
  await gw.handle({ method: 'POST', path: '/v1/checkout', headers: { authorization: `Bearer ${key}`, host: 'gw.example.on.aws' }, body: JSON.stringify({ plan: 'team' }) });
  const end = form['subscription_data[trial_end]'];
  return end ? (Number(end) * 1000 - at) / DAY : 0;
}

describe('the free days a team has left', () => {
  it('are none at exactly 2 days left, which Stripe will not trial', () => {
    expect(teamFreeDays(ENDS, ENDS - 2 * DAY)).toBe(0);
  });
  it('are 3 just past 2 days left, rounded up as the checkout rounds them', () => {
    expect(teamFreeDays(ENDS, ENDS - 2 * DAY - 1)).toBe(3);
    expect(teamFreeDays(ENDS, ENDS - 3 * DAY)).toBe(3);
  });
  it('are none at the end and after it', () => {
    expect(teamFreeDays(ENDS, ENDS)).toBe(0);
    expect(teamFreeDays(ENDS, ENDS + DAY)).toBe(0);
  });
  it('are all 7 for a team made today', () => {
    expect(teamFreeDays(ENDS, MADE + 60_000)).toBe(TEAM.trialDays);
  });
  it('are what the team checkout gives Stripe, at every point in the week', async () => {
    for (const at of [MADE + 60_000, MADE + 2.5 * DAY, ENDS - 3 * DAY, ENDS - 2 * DAY - 60_000, ENDS - 2 * DAY, ENDS - DAY, ENDS + DAY]) {
      expect(await checkoutTrialDays(at)).toBe(proFreeDays(true, inTrial(ENDS), at));
    }
  });
});

describe('what the plan page knows', () => {
  it('a person with no team yet gets the whole week, as the team is made when Pro starts', () => {
    expect(proFreeDays(false, null, ENDS + 30 * DAY)).toBe(TEAM.trialDays);
  });
  it('a team in its trial gets what is left of it', () => {
    expect(proFreeDays(true, inTrial(ENDS), ENDS - 4 * DAY)).toBe(4);
  });
  it('a team the cloud names no trial for has no free days', () => {
    expect(proFreeDays(true, { signedIn: true, plan: 'none' }, ENDS + DAY)).toBe(0);
    expect(proFreeDays(true, { signedIn: true, plan: 'team', team: { trial: false, endsAt: null, seats: 2 } }, ENDS + DAY)).toBe(0);
  });
  it('a team whose plan has not been read claims no free days', () => {
    expect(proFreeDays(true, null)).toBe(0);
  });
});

describe('what the plan page says', () => {
  it('is unchanged for a brand new team', () => {
    expect(proOffer(TEAM.trialDays)).toEqual({ trial: PRO_PITCH.trial, paid: PRO_PITCH.paid, cta: PRO_PITCH.cta });
    expect(PRO_PITCH.cta).toBe('Try Pro free for 7 days');
  });
  it('names the days left when fewer than 7', () => {
    expect(proOffer(3)).toEqual({ trial: { ...PRO_PITCH.trial, label: 'First 3 days' }, paid: PRO_PITCH.paid, cta: 'Try Pro free for 3 days' });
  });
  it('makes no free claim when none are left, and the button starts Pro now', () => {
    const none = proOffer(0);
    expect(none).toEqual({ trial: null, paid: { ...PRO_PITCH.paid, label: 'From today' }, cta: 'Start Pro now' });
    expect(JSON.stringify(none)).not.toMatch(/free|try/i);
  });
  it('uses no colons or em dashes', () => {
    for (const d of [0, 3, 7]) expect(JSON.stringify(Object.values(proOffer(d)).flatMap((v) => (v && typeof v === 'object' ? Object.values(v) : [v])))).not.toMatch(/[:—]/);
  });
  it('is what the setup draws, from the plan the cloud reads', () => {
    const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
    expect(split).toMatch(/const offer = proOffer\(proFreeDays\(hasTeam, seen\)\);/);
    expect(split).toMatch(/offer\.trial && <div>/);
    expect(split).toMatch(/: offer\.cta, \(\) => void pay\(\)/);
    expect(split).not.toMatch(/PRO_PITCH\.(trial|paid|cta)\b/);
  });
});
