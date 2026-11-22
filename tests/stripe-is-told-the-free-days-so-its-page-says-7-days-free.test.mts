// STRIPE IS TOLD THE FREE DAYS, SO ITS PAGE SAYS 7 DAYS FREE.
//
// The live team checkout on 2026-11-21 read "6 days free" beside the app's
// "Try Pro free for 7 days". Read back from Stripe's own page data, it had been
// handed a trial end 604,799 seconds after it opened, and the page said 6 both
// a minute later and an hour later: Stripe words a trial end as the whole days
// left when the page draws, rounded down. The earlier fix (whole days, rounded
// up, still sent as an end time) gives exactly 7 days at the moment the
// checkout is made, which reads 6 as soon as anyone opens it. Now the checkout
// hands Stripe the number of days, which its page shows as it is given and
// counts from the moment the card goes in.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM, PLAN_TRIAL } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DAY = 24 * 60 * 60_000;
const MADE = Date.UTC(2026, 10, 21, 19, 1, 5);

function checkoutAt(at: number, { freeUntil = null as number | null, hadSubscription = false } = {}) {
  const sessions: Array<Record<string, string>> = [];
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') return json(200, { data: [{ id: `price_${form.get('lookup_keys[0]')}` }] });
    if (u.pathname === '/v1/checkout/sessions') { sessions.push(Object.fromEntries(form)); return json(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }); }
    return json(404, { error: { message: 'not faked' } });
  };
  const team = { id: 'team-1', createdAt: MADE, freeUntil, members: [A], owners: [A] };
  const objects = memoryObjects();
  if (hadSubscription) void objects.put('ledger/teams/team-1.json', JSON.stringify({ plan: 'none', seats: 0, stripe: { customer: 'cus_1', subscription: 'sub_old', status: 'canceled', paid: true } }));
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (k: string) => `https://b/${k}`, head: async (k: string) => `https://b/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t: string) => (t === 'session-a' ? { id: A } : null),
    teams: async (p: string) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl }),
    now: () => at,
    plans: PLANS,
  });
  return async (plan: string) => {
    const key = (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    await gw.handle({ method: 'POST', path: '/v1/checkout', headers: { authorization: `Bearer ${key}`, host: 'gw.example.on.aws' }, body: JSON.stringify({ plan }) });
    return sessions[0];
  };
}

describe('the free days Stripe is given', () => {
  it('are the week itself for a team made a second ago, with no end time to count down', async () => {
    const sent = await checkoutAt(MADE + 1000)('team');
    expect(sent['subscription_data[trial_period_days]']).toBe(String(TEAM.trialDays));
    expect(sent['subscription_data[trial_end]']).toBeUndefined();
  });
  it('are the week for a person’s own plan too', async () => {
    const sent = await checkoutAt(MADE + 1000)('pro');
    expect(sent['subscription_data[trial_period_days]']).toBe(String(PLAN_TRIAL.days));
    expect(sent['subscription_data[trial_end]']).toBeUndefined();
  });
  it('are the days given by hand when they outlast the week, rounded up to a whole day', async () => {
    const at = MADE + DAY;
    const sent = await checkoutAt(at, { freeUntil: at + 13.5 * DAY })('team');
    expect(sent['subscription_data[trial_period_days]']).toBe('14');
  });
  it('are none for a team that has had a subscription and has no days given', async () => {
    const sent = await checkoutAt(MADE + DAY, { hadSubscription: true })('team');
    expect(sent['subscription_data[trial_period_days]']).toBeUndefined();
    expect(sent['subscription_data[trial_end]']).toBeUndefined();
  });
});
