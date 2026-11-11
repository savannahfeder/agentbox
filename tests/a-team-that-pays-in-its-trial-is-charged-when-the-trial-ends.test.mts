// A TEAM THAT PAYS IN ITS TRIAL IS CHARGED WHEN THE TRIAL ENDS (w-fbe5e95dea, 2026-11-10).
//
// The founder: the team route is the one that pays, and the setup must take
// payment for it ("i see no plan purchase page or anything (that was
// critical)"). The setup offers Pro with free days first, and every team
// gets them from the day it was made. But the team checkout opened Stripe
// with no trial, so a card added in the setup was charged $40 a seat on the
// spot. The checkout now hands Stripe the team's own trial end, so the card
// is taken now and charged when the free days are up. Stripe will not take a
// trial ending within 48 hours, so a team that close to the end pays now.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const HOST = 'gw.example.on.aws';
const DAY = 24 * 60 * 60_000;
const MADE = Date.UTC(2026, 10, 17, 9);
const TRIAL_ENDS = MADE + TEAM.trialDays * DAY;

function setup(start: number) {
  const calls: Array<{ method: string; path: string; form: Record<string, string> }> = [];
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, form: Object.fromEntries(form) });
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') return json(200, { data: [{ id: `price_${form.get('lookup_keys[0]')}` }] });
    if (u.pathname === '/v1/checkout/sessions') return json(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    return json(404, { error: { message: 'not faked' } });
  };
  const team = { id: 'team-1', createdAt: MADE, members: [A], owners: [A] };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (k: string) => `https://b/${k}`, head: async (k: string) => `https://b/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t: string) => (t === 'session-a' ? { id: A } : null),
    teams: async (p: string) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl }),
    now: () => start,
    plans: PLANS,
  });
  let key: string | null = null;
  const owner = async (body: unknown) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method: 'POST', path: '/v1/checkout', headers: { authorization: `Bearer ${key}`, host: HOST }, body: JSON.stringify(body) });
  };
  const made = () => calls.find((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST')!.form;
  return { owner, made };
}

describe('the team checkout', () => {
  it('takes the card now and charges when the team’s free days end', async () => {
    const { owner, made } = setup(MADE + 60_000);
    const out = await owner({ plan: 'team' });
    expect(out.body).toMatchObject({ where: 'checkout' });
    expect(made()['subscription_data[trial_end]']).toBe(String(Math.floor(TRIAL_ENDS / 1000)));
  });
  it('still trials a team a few days in, to the same end', async () => {
    const { owner, made } = setup(MADE + 3 * DAY);
    await owner({ plan: 'team' });
    expect(made()['subscription_data[trial_end]']).toBe(String(Math.floor(TRIAL_ENDS / 1000)));
  });
  it('charges now when fewer than two days are left, which Stripe will not trial', async () => {
    const { owner, made } = setup(TRIAL_ENDS - DAY);
    await owner({ plan: 'team' });
    expect(made()['subscription_data[trial_end]']).toBeUndefined();
  });
  it('charges now once the trial is over', async () => {
    const { owner, made } = setup(TRIAL_ENDS + DAY);
    await owner({ plan: 'team' });
    expect(made()['subscription_data[trial_end]']).toBeUndefined();
  });
});

describe('one person’s own plan', () => {
  it('has no trial, as before', async () => {
    const { owner, made } = setup(MADE + 60_000);
    await owner({ plan: 'pro' });
    expect(made()['subscription_data[trial_end]']).toBeUndefined();
  });
});
