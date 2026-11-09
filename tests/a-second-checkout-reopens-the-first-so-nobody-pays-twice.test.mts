// Found in the launch audit (2026-10-25): the server only sent someone to
// their billing page once Stripe's webhook had said they pay. Until then every
// press of a plan card opened a new Stripe checkout, and the other cards stay
// pressable while one is open, so paying in two tabs made two subscriptions
// (on a first purchase, two Stripe customers), and the ledger kept only the
// last: the other charged every month with no way to it from the app.
// Measured with the gateway on a fake Stripe that keeps its checkout sessions:
// two presses made two sessions. Now the open checkout is remembered and
// reopened, a different plan closes it first, and one already paid goes to
// the billing page.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const HOST = 'gw.example.on.aws';

function fakeStripe({ payOnExpire = null } = {}) {
  const calls = [];
  const sessions = new Map();
  let n = 0;
  const prices = { agentbox_cloud_pro_monthly: 'price_pro', agentbox_cloud_plus_monthly: 'price_plus', agentbox_cloud_max_monthly: 'price_max' };
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, form: Object.fromEntries(form) });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') return json(200, { data: [{ id: prices[form.get('lookup_keys[0]')] }] });
    if (u.pathname === '/v1/checkout/sessions' && init.method === 'POST') {
      n += 1;
      const s = { id: `cs_${n}`, object: 'checkout.session', status: 'open', url: `https://checkout.stripe.com/c/pay/cs_${n}`, customer: null, price: form.get('line_items[0][price]') };
      sessions.set(s.id, s);
      return json(200, s);
    }
    const expire = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(u.pathname);
    if (expire) {
      const s = sessions.get(expire[1]);
      if (expire[1] === payOnExpire) { s.status = 'complete'; s.url = null; s.customer = 'cus_paid'; }
      if (!s || s.status !== 'open') return json(400, { error: { message: 'Only open sessions can be expired' } });
      s.status = 'expired'; s.url = null;
      return json(200, s);
    }
    const one = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(u.pathname);
    if (one) return sessions.has(one[1]) ? json(200, sessions.get(one[1])) : json(404, { error: { message: 'No such session' } });
    if (u.pathname === '/v1/billing_portal/sessions') return json(200, { url: `https://billing.stripe.com/p/session/for_${form.get('customer')}` });
    return json(404, { error: { message: 'not faked' } });
  };
  const made = () => calls.filter((c) => c.method === 'POST' && c.path === '/v1/checkout/sessions');
  return { calls, sessions, made, fetchImpl, pay: (id) => { const s = sessions.get(id); s.status = 'complete'; s.url = null; s.customer = 'cus_paid'; } };
}

function setup(opts) {
  const stripe = fakeStripe(opts);
  const gw = createGateway({
    agentcore: { invoke: async () => ({ ok: true }), stop: async () => {} },
    links: { get: async (k) => `https://b/${k}`, put: async (k) => `https://b/${k}`, head: async (k) => `https://b/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => Date.UTC(2026, 9, 25, 12, 0, 0),
    plans: PLANS,
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl: stripe.fetchImpl }),
  });
  let key;
  const call = async (method, path, body) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}`, host: HOST }, body: body ? JSON.stringify(body) : '' });
  };
  const checkout = async (plan) => (await call('POST', '/v1/checkout', { plan })).body;
  return { stripe, checkout };
}

describe('a second press while a checkout is open', () => {
  it('for the same plan reopens the same checkout', async () => {
    const { stripe, checkout } = setup();
    const first = await checkout('pro');
    const second = await checkout('pro');
    expect(second).toEqual(first);
    expect(first.where).toBe('checkout');
    expect(stripe.made()).toHaveLength(1);
  });

  it('for another plan closes the first, so only one can be paid', async () => {
    const { stripe, checkout } = setup();
    await checkout('pro');
    const plus = await checkout('plus');
    expect(stripe.sessions.get('cs_1').status).toBe('expired');
    expect(plus).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_2', where: 'checkout' });
    expect(stripe.sessions.get('cs_2').price).toBe('price_plus');
  });

  it('after the first was paid, before Stripe has said so, goes to the billing page', async () => {
    const { stripe, checkout } = setup();
    await checkout('pro');
    stripe.pay('cs_1');
    expect(await checkout('max')).toEqual({ url: 'https://billing.stripe.com/p/session/for_cus_paid', where: 'billing' });
    expect(stripe.made()).toHaveLength(1);
  });

  it('paid in the moment between reading it and closing it still goes to the billing page', async () => {
    const { stripe, checkout } = setup({ payOnExpire: 'cs_1' });
    await checkout('pro');
    expect(await checkout('plus')).toEqual({ url: 'https://billing.stripe.com/p/session/for_cus_paid', where: 'billing' });
    expect(stripe.made()).toHaveLength(1);
  });

  it('once the first has run out, opens a new one', async () => {
    const { stripe, checkout } = setup();
    await checkout('pro');
    stripe.sessions.get('cs_1').status = 'expired';
    const again = await checkout('pro');
    expect(again.url).toBe('https://checkout.stripe.com/c/pay/cs_2');
  });

  it('two presses at the same instant still leave one checkout open', async () => {
    const { stripe, checkout } = setup();
    const [a, b] = await Promise.all([checkout('pro'), checkout('pro')]);
    expect(a.url).toBe(b.url);
    const open = [...stripe.sessions.values()].filter((s) => s.status === 'open');
    expect(open).toHaveLength(1);
  });
});
