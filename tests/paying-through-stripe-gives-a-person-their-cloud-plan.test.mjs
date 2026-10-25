// PAYING THROUGH STRIPE GIVES A PERSON THEIR CLOUD PLAN, AND STOPPING TAKES IT.
//
// Until now a plan was given only by hand (scripts/cloud-gateway-admin.mjs),
// so no stranger could pay (w-6633e825a7). The server now opens Stripe's own
// checkout page for a plan, and Stripe's webhook sets the plan. A webhook
// says only which subscription changed: the server reads that subscription
// from Stripe as it stands, so events that arrive late or out of order land
// on the truth, and one nobody signed changes nothing.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient, stripeSigned, formOf } from '../cloud/gateway/stripe.mjs';
import { paidPlans, productOf, priceIsCurrent, portalSettings, WEBHOOK_EVENTS } from '../scripts/stripe-setup.mjs';
import { rolePolicy } from '../scripts/cloud-gateway-setup.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const SECRET = 'whsec_test_secret';
const HOST = 'gw.example.on.aws';

function fakeStripe() {
  const calls = [];
  const subs = new Map();
  const prices = { agentbox_cloud_pro_monthly: 'price_pro', agentbox_cloud_plus_monthly: 'price_plus', agentbox_cloud_max_monthly: 'price_max' };
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, form: Object.fromEntries(form), auth: init.headers.authorization, deadline: init.signal instanceof AbortSignal });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') { const id = prices[form.get('lookup_keys[0]')]; return json(200, { data: id ? [{ id }] : [] }); }
    if (u.pathname === '/v1/checkout/sessions') return json(200, { url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    if (u.pathname === '/v1/billing_portal/sessions') return json(200, { url: 'https://billing.stripe.com/p/session/test_1' });
    const m = /^\/v1\/subscriptions\/(.+)$/.exec(u.pathname);
    if (m) return subs.has(m[1]) ? json(200, subs.get(m[1])) : json(404, { error: { message: 'No such subscription' } });
    return json(404, { error: { message: 'not faked' } });
  };
  return { calls, subs, fetchImpl };
}

const sub = (id, status, plan, { person = A, customer = 'cus_1' } = {}) => ({
  id, object: 'subscription', status, customer, metadata: person ? { person } : {},
  items: { data: [{ price: { id: `price_${plan}`, lookup_key: `agentbox_cloud_${plan}_monthly` } }] },
});

function setup({ billing = true } = {}) {
  let clock = Date.UTC(2026, 9, 20, 12, 0, 0);
  const stripe = fakeStripe();
  const gw = createGateway({
    agentcore: { invoke: async () => ({ ok: true }), stop: async () => {} },
    links: { get: async (k) => `https://b/${k}`, put: async (k) => `https://b/${k}`, head: async (k) => `https://b/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => clock,
    plans: PLANS,
    ...(billing ? { stripe: stripeClient({ key: 'sk_test_x', webhookSecret: SECRET, fetchImpl: stripe.fetchImpl }) } : {}),
  });
  let key;
  const call = async (method, path, body) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}`, host: HOST }, body: body ? JSON.stringify(body) : '' });
  };
  const me = async () => (await call('GET', '/v1/me')).body;
  const start = (n) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}` } });
  const signature = (raw, { secret = SECRET, at = clock } = {}) => {
    const t = Math.floor(at / 1000);
    return `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
  };
  const webhook = (type, object, opts = {}) => {
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type, data: { object } });
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': opts.header ?? signature(raw, opts) }, body: raw });
  };
  const paysFor = async (id, status, plan, opts) => {
    stripe.subs.set(id, sub(id, status, plan, opts));
    return webhook('customer.subscription.updated', { id, object: 'subscription', status });
  };
  return { gw, stripe, call, me, start, webhook, paysFor, tick: (ms) => { clock += ms; } };
}

describe('checkout', () => {
  it('opens Stripe\'s page for the plan, marked with who is paying', async () => {
    const { call, stripe } = setup();
    const r = await call('POST', '/v1/checkout', { plan: 'pro' });
    expect(r.body).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', where: 'checkout' });
    const made = stripe.calls.find((c) => c.path === '/v1/checkout/sessions');
    expect(made.form).toMatchObject({
      mode: 'subscription', 'line_items[0][price]': 'price_pro', 'line_items[0][quantity]': '1',
      client_reference_id: A, 'subscription_data[metadata][person]': A,
      success_url: `https://${HOST}/v1/paid?plan=pro`, cancel_url: `https://${HOST}/v1/paid?cancelled=1`,
    });
    expect(made.form.customer).toBeUndefined();
    expect(stripe.calls.every((c) => c.deadline && c.auth === 'Bearer sk_test_x')).toBe(true);
  });

  it('sells only the paid plans, and asks Stripe nothing for the rest', async () => {
    const { call, stripe } = setup();
    for (const plan of ['none', 'gold', undefined, 'toString']) {
      expect((await call('POST', '/v1/checkout', { plan })).status).toBe(400);
    }
    expect(stripe.calls).toEqual([]);
  });

  it('someone already paying is sent to their billing page, not a second subscription', async () => {
    const { call, paysFor, stripe } = setup();
    await call('GET', '/v1/me');
    await paysFor('sub_1', 'active', 'pro');
    const r = await call('POST', '/v1/checkout', { plan: 'max' });
    expect(r.body).toEqual({ url: 'https://billing.stripe.com/p/session/test_1', where: 'billing' });
    expect(stripe.calls.some((c) => c.path === '/v1/checkout/sessions')).toBe(false);
  });

  it('someone who paid once and stopped checks out again as the same Stripe customer', async () => {
    const { call, paysFor, stripe } = setup();
    await call('GET', '/v1/me');
    await paysFor('sub_1', 'canceled', 'pro');
    await call('POST', '/v1/checkout', { plan: 'plus' });
    expect(stripe.calls.find((c) => c.path === '/v1/checkout/sessions').form.customer).toBe('cus_1');
  });

  it('a server with no Stripe set up says so', async () => {
    const { call } = setup({ billing: false });
    const r = await call('POST', '/v1/checkout', { plan: 'pro' });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('billing');
  });
});

describe('the webhook sets the plan from the subscription as Stripe has it now', () => {
  it('a paid checkout gives the plan, and runs start', async () => {
    const { me, start, webhook, stripe } = setup();
    expect((await start(1)).body.error).toBe('plan');
    stripe.subs.set('sub_1', sub('sub_1', 'active', 'pro'));
    const r = await webhook('checkout.session.completed', { id: 'cs_1', object: 'checkout.session', subscription: 'sub_1', client_reference_id: A });
    expect(r).toMatchObject({ status: 200, body: { received: true } });
    expect(await me()).toMatchObject({ plan: 'pro', agents: 10, hoursPerMonth: 400 });
    expect((await start(2)).body.ok).toBe(true);
  });

  it('a change of plan in Stripe changes it here', async () => {
    const { me, paysFor } = setup();
    await paysFor('sub_1', 'active', 'pro');
    await paysFor('sub_1', 'active', 'max');
    expect(await me()).toMatchObject({ plan: 'max', unlimited: true });
  });

  it('a card Stripe is still retrying keeps the plan; one it gave up on ends it', async () => {
    const { me, paysFor } = setup();
    await paysFor('sub_1', 'past_due', 'plus');
    expect((await me()).plan).toBe('plus');
    await paysFor('sub_1', 'unpaid', 'plus');
    expect((await me()).plan).toBe('none');
  });

  it('a cancelled subscription ends the plan and new runs are refused', async () => {
    const { me, start, paysFor, webhook, stripe } = setup();
    await paysFor('sub_1', 'active', 'pro');
    stripe.subs.set('sub_1', sub('sub_1', 'canceled', 'pro'));
    await webhook('customer.subscription.deleted', { id: 'sub_1', object: 'subscription' });
    expect((await me()).plan).toBe('none');
    expect((await start(1)).body.error).toBe('plan');
  });

  it('a checkout never paid for gives nothing', async () => {
    const { me, paysFor } = setup();
    await paysFor('sub_1', 'incomplete', 'max');
    expect((await me()).plan).toBe('none');
  });

  it('an event that arrives late is read against Stripe, not believed', async () => {
    const { me, paysFor, webhook, stripe } = setup();
    await paysFor('sub_1', 'active', 'pro');
    stripe.subs.set('sub_1', sub('sub_1', 'canceled', 'pro'));
    // The old "active" event, delivered after the cancellation.
    await webhook('customer.subscription.updated', { id: 'sub_1', object: 'subscription', status: 'active' });
    expect((await me()).plan).toBe('none');
  });

  it('an old subscription ending leaves a newer one that pays alone', async () => {
    const { me, paysFor } = setup();
    await paysFor('sub_new', 'active', 'plus');
    await paysFor('sub_old', 'canceled', 'pro');
    expect((await me()).plan).toBe('plus');
  });

  it('nothing changes for a webhook nobody signed, signed with another secret, or five minutes stale', async () => {
    const { me, webhook, stripe, gw } = setup();
    await me();
    stripe.subs.set('sub_1', sub('sub_1', 'active', 'max'));
    const object = { id: 'sub_1', object: 'subscription' };
    const asked = stripe.calls.length;
    for (const opts of [{ header: '' }, { header: 't=1,v1=00' }, { secret: 'whsec_other' }, { at: Date.UTC(2026, 9, 20, 11, 54, 59) }]) {
      const r = await webhook('customer.subscription.updated', object, opts);
      expect(r.status).toBe(400);
    }
    expect(stripe.calls.length).toBe(asked);
    expect((await me()).plan).toBe('none');
    // Just inside the five minutes still lands.
    expect((await webhook('customer.subscription.updated', object, { at: Date.UTC(2026, 9, 20, 11, 55, 1) })).status).toBe(200);
    expect((await me()).plan).toBe('max');
    expect(gw).toBeTruthy();
  });

  it('a subscription with no person on it, or an event about something else, is taken and ignored', async () => {
    const { me, paysFor, webhook, stripe } = setup();
    await me();
    expect((await paysFor('sub_x', 'active', 'max', { person: null })).status).toBe(200);
    expect((await webhook('invoice.paid', { id: 'in_1', object: 'invoice' })).status).toBe(200);
    expect(stripe.calls.filter((c) => c.path.startsWith('/v1/subscriptions/')).length).toBe(1);
    expect((await me()).plan).toBe('none');
  });
});

describe('billing', () => {
  it('someone who pays gets their own billing page', async () => {
    const { call, paysFor, stripe } = setup();
    await paysFor('sub_1', 'active', 'pro', { customer: 'cus_9' });
    const r = await call('POST', '/v1/billing');
    expect(r.body).toEqual({ url: 'https://billing.stripe.com/p/session/test_1' });
    expect(stripe.calls.find((c) => c.path === '/v1/billing_portal/sessions').form).toMatchObject({ customer: 'cus_9', return_url: `https://${HOST}/v1/paid?billing=1` });
  });

  it('someone who never paid has none', async () => {
    const { call } = setup();
    const r = await call('POST', '/v1/billing');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('no-billing');
  });

  it('the page Stripe sends people back to needs no key', async () => {
    const { gw } = setup();
    for (const path of ['/v1/paid', '/v1/paid?plan=pro', '/v1/paid?cancelled=1']) {
      const r = await gw.handle({ method: 'GET', path, headers: {} });
      expect(r.status).toBe(200);
      expect(r.type).toBe('html');
    }
  });
});

describe('setting Stripe up (scripts/stripe-setup.mjs)', () => {
  it('sells each paid plan at its price, and the plan with none is not sold', () => {
    expect(paidPlans().map(([plan, p]) => [plan, p.dollarsPerMonth])).toEqual([['pro', 40], ['plus', 100], ['max', 200]]);
    expect(productOf('max', PLANS.max)).toMatchObject({ name: 'Agentbox Cloud Max', description: 'Unlimited agents at once in the cloud, 3,000 hours a month', metadata: { agentbox_plan: 'max' } });
    expect(productOf('pro', PLANS.pro).description).toBe('10 agents at once in the cloud, 400 hours a month');
  });

  it('keeps a price that still matches the plan, and replaces one that does not', () => {
    const price = { active: true, currency: 'usd', unit_amount: 4000, recurring: { interval: 'month' } };
    expect(priceIsCurrent(price, PLANS.pro)).toBe(true);
    expect(priceIsCurrent({ ...price, unit_amount: 3000 }, PLANS.pro)).toBe(false);
    expect(priceIsCurrent({ ...price, recurring: { interval: 'year' } }, PLANS.pro)).toBe(false);
    expect(priceIsCurrent({ ...price, active: false }, PLANS.pro)).toBe(false);
    expect(priceIsCurrent(undefined, PLANS.pro)).toBe(false);
  });

  it('the billing page switches between exactly the plans sold, and cancels at the period\'s end', () => {
    const sold = [{ product: 'prod_a', price: 'price_a' }, { product: 'prod_b', price: 'price_b' }];
    const s = portalSettings(sold).features;
    expect(s.subscription_update.products).toEqual([{ product: 'prod_a', prices: ['price_a'] }, { product: 'prod_b', prices: ['price_b'] }]);
    expect(s.subscription_cancel).toEqual({ enabled: true, mode: 'at_period_end' });
  });

  it('the webhook is sent every event the server reads', () => {
    expect(WEBHOOK_EVENTS).toEqual(['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']);
  });

  it('the server may read Stripe\'s secret once it is stored, and only the secrets it names', () => {
    const base = { bucket: 'b', runtimeArn: 'arn:r', region: 'us-east-1', account: '000000000000', signerSecretArn: 'arn:signer' };
    const read = (p) => p.Statement.find((s) => s.Action.includes('secretsmanager:GetSecretValue')).Resource;
    expect(read(rolePolicy(base))).toBe('arn:signer');
    expect(read(rolePolicy({ ...base, stripeSecretArn: 'arn:stripe' }))).toEqual(['arn:signer', 'arn:stripe']);
  });
});

describe('the Stripe parts on their own', () => {
  // Managed Payments makes Stripe the seller of record; each checkout has to
  // ask for it, and one that does not is an ordinary sale (2026-10-21).
  it('asks for Managed Payments on a checkout only when it is switched on', async () => {
    for (const managedPayments of [true, false]) {
      const s = fakeStripe();
      const client = stripeClient({ key: 'sk_live_x', webhookSecret: SECRET, managedPayments, fetchImpl: s.fetchImpl });
      await client.checkout({ person: A, plan: 'pro', successUrl: 'https://x/v1/paid', cancelUrl: 'https://x/v1/paid?cancelled=1' });
      const form = s.calls.find((c) => c.path === '/v1/checkout/sessions').form;
      expect(form['managed_payments[enabled]']).toBe(managedPayments ? 'true' : undefined);
    }
  });

  it('encodes nested fields the way Stripe reads them', () => {
    expect(formOf({ a: 1, b: { c: 'd' }, e: [{ f: 'g' }], skip: undefined }).toString()).toBe('a=1&b%5Bc%5D=d&e%5B0%5D%5Bf%5D=g');
  });

  it('takes a signature among several, and refuses a wrong one', () => {
    const t = 1_800_000_000;
    const good = crypto.createHmac('sha256', SECRET).update(`${t}.{}`).digest('hex');
    expect(stripeSigned('{}', `t=${t},v1=${'0'.repeat(64)},v1=${good}`, SECRET, t * 1000)).toBe(true);
    expect(stripeSigned('{ }', `t=${t},v1=${good}`, SECRET, t * 1000)).toBe(false);
    expect(stripeSigned('{}', `t=${t},v1=${good}`, '', t * 1000)).toBe(false);
  });
});
