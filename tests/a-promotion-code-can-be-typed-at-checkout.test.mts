// "Can you give me a coupon code that gives people a month free of the cloud
// service" (2026-10-25). Stripe's checkout page shows a box for a code only
// when the session asks for one, and ours never did: the form sent for a
// checkout had no allow_promotion_codes, so a code made in Stripe could not be
// typed anywhere. Measured on the form a checkout sends to a fake Stripe.
import { describe, it, expect } from 'vitest';
import { stripeClient } from '../cloud/gateway/stripe.mjs';

function fakeStripe() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ path: u.pathname, form: Object.fromEntries(form) });
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (u.pathname === '/v1/prices') return json({ data: [{ id: 'price_pro' }] });
    if (u.pathname === '/v1/checkout/sessions') return json({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    return json({});
  };
  return { calls, fetchImpl };
}

const sessionForm = async (opts = {}) => {
  const s = fakeStripe();
  const client = stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl: s.fetchImpl, ...opts });
  await client.checkout({ person: '11111111-1111-4111-8111-111111111111', plan: 'pro', successUrl: 'https://x/v1/paid', cancelUrl: 'https://x/v1/paid?cancelled=1' });
  return s.calls.find((c) => c.path === '/v1/checkout/sessions').form;
};

describe('a checkout takes a promotion code', () => {
  it('asks Stripe to show the code box', async () => {
    expect((await sessionForm()).allow_promotion_codes).toBe('true');
  });

  it('with Managed Payments on as well', async () => {
    const form = await sessionForm({ managedPayments: true });
    expect(form.allow_promotion_codes).toBe('true');
    expect(form['managed_payments[enabled]']).toBe('true');
  });

  it('applies no discount by itself, so nobody gets one without a code', async () => {
    const form = await sessionForm();
    expect(Object.keys(form).filter((k) => k.startsWith('discounts'))).toEqual([]);
  });
});
