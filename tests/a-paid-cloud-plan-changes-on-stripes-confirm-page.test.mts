// A PAID CLOUD PLAN CHANGES ON STRIPE'S CONFIRM PAGE, AND A PLAN GIVEN BY HAND SAYS SO.
//
// What broke (2026-10-25): on a Max plan set by hand (scripts/cloud-gateway-admin.mjs),
// "Switch to Plus" opened a fresh $100 checkout, and "Payment and invoices"
// opened nothing. Live Stripe held no subscription at all, so to the server
// the switch was a first purchase and there was no billing page to open; the
// app could not tell, because /v1/me named the plan and not who bills it.
// And a person who does pay was sent to the billing page's front door to find
// the switch themselves. Measured against the server with a faked Stripe.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { portalSettings } from '../scripts/stripe-setup.mjs';

const A = '22222222-2222-4222-8222-222222222222';
const HOST = 'gw.example.on.aws';

function setup() {
  const calls = [];
  const subs = new Map();
  const prices = { agentbox_cloud_pro_monthly: 'price_pro', agentbox_cloud_plus_monthly: 'price_plus', agentbox_cloud_max_monthly: 'price_max' };
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, form: Object.fromEntries(form) });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') { const id = prices[form.get('lookup_keys[0]')]; return json(200, { data: id ? [{ id }] : [] }); }
    if (u.pathname === '/v1/checkout/sessions') return json(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    if (u.pathname === '/v1/billing_portal/sessions') return json(200, { url: 'https://billing.stripe.com/p/session/test_1' });
    const m = /^\/v1\/subscriptions\/(.+)$/.exec(u.pathname);
    if (m) return subs.has(m[1]) ? json(200, subs.get(m[1])) : json(404, { error: { message: 'No such subscription' } });
    return json(404, { error: { message: 'not faked' } });
  };
  const gw = createGateway({
    agentcore: { invoke: async () => ({ ok: true }), stop: async () => {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    plans: PLANS,
    stripe: { ...stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl }), signed: () => true },
  });
  let key;
  const call = async (method, path, body) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}`, host: HOST }, body: body ? JSON.stringify(body) : '' });
  };
  const paysFor = async (plan, status = 'active') => {
    subs.set('sub_1', { id: 'sub_1', status, customer: 'cus_1', metadata: { person: A }, items: { data: [{ id: 'si_1', price: { id: `price_${plan}`, lookup_key: `agentbox_cloud_${plan}_monthly` } }] } });
    await gw.handle({ method: 'POST', path: '/v1/stripe', headers: {}, body: JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } }) });
  };
  const portal = () => calls.filter((c) => c.path === '/v1/billing_portal/sessions').map((c) => c.form);
  const checkouts = () => calls.filter((c) => c.path === '/v1/checkout/sessions');
  return { gw, call, paysFor, portal, checkouts, subs };
}

describe('who bills a plan, as the app is told', () => {
  it('says Stripe for a plan someone pays for', async () => {
    const s = setup();
    await s.paysFor('pro');
    expect((await s.call('GET', '/v1/me')).body).toMatchObject({ plan: 'pro', billing: 'stripe' });
  });

  it('says given for a plan set by hand', async () => {
    const s = setup();
    await s.call('GET', '/v1/me');
    await s.gw.admin({ do: 'plan', person: A, plan: 'max' });
    expect((await s.call('GET', '/v1/me')).body).toMatchObject({ plan: 'max', billing: 'given' });
  });

  it('says nothing for no plan, or a subscription Stripe has stopped', async () => {
    const s = setup();
    expect((await s.call('GET', '/v1/me')).body.billing).toBeNull();
    await s.paysFor('pro', 'canceled');
    expect((await s.call('GET', '/v1/me')).body).toMatchObject({ plan: 'none', billing: null });
  });
});

describe('switching a plan someone pays for', () => {
  it('opens Stripe\'s confirm page for the new plan, not a new checkout', async () => {
    const s = setup();
    await s.paysFor('max');
    const out = await s.call('POST', '/v1/checkout', { plan: 'plus' });
    expect(out.body).toMatchObject({ where: 'billing', url: 'https://billing.stripe.com/p/session/test_1' });
    expect(s.checkouts()).toEqual([]);
    expect(s.portal()).toEqual([expect.objectContaining({
      customer: 'cus_1',
      'flow_data[type]': 'subscription_update_confirm',
      'flow_data[subscription_update_confirm][subscription]': 'sub_1',
      'flow_data[subscription_update_confirm][items][0][id]': 'si_1',
      'flow_data[subscription_update_confirm][items][0][price]': 'price_plus',
      'flow_data[subscription_update_confirm][items][0][quantity]': '1',
    })]);
  });

  it('opens the plain billing page when Stripe cannot open the confirm page', async () => {
    const s = setup();
    await s.paysFor('max');
    s.subs.get('sub_1').items.data[0].id = undefined;
    expect((await s.call('POST', '/v1/checkout', { plan: 'plus' })).body).toEqual({ url: 'https://billing.stripe.com/p/session/test_1', where: 'billing' });
    expect(s.checkouts()).toEqual([]);
  });

  it('opens the plain billing page for the plan they are already on', async () => {
    const s = setup();
    await s.paysFor('max');
    await s.call('POST', '/v1/checkout', { plan: 'max' });
    expect(s.portal()).toHaveLength(1);
    expect(Object.keys(s.portal()[0]).filter((k) => k.startsWith('flow_data'))).toEqual([]);
  });
});

// Live Stripe's billing page had quantity switched on for every plan, so
// "Update subscription" could sell three Pros for one Pro's worth of cloud.
describe('Stripe\'s billing page, as scripts/stripe-setup.mjs sets it', () => {
  it('changes the plan and never the quantity', () => {
    const products = portalSettings([{ product: 'prod_a', price: 'price_a' }, { product: 'prod_b', price: 'price_b' }]).features.subscription_update.products;
    expect(products.map((p) => p.adjustable_quantity)).toEqual([{ enabled: false }, { enabled: false }]);
  });
});

describe('a plan given by hand', () => {
  it('has no billing page to open, and says why', async () => {
    const s = setup();
    await s.call('GET', '/v1/me');
    await s.gw.admin({ do: 'plan', person: A, plan: 'max' });
    expect((await s.call('POST', '/v1/billing')).body).toMatchObject({ error: 'no-billing' });
  });
});
