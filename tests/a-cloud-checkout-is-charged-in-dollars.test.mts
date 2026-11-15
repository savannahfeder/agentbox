// A tester in the United States picked Pro, which the plan screen offers at
// $40 a month, and Stripe asked for "€37.08 per month" with a EUR/USD toggle
// that stayed on EUR; the promotion code typed on that same page came back
// "Something went wrong, please try again" (F-64 and F-65, Oct 25 2026). The
// price Stripe sells is in dollars, so nothing was mispriced: Adaptive
// Pricing, which Managed Payments turns on by itself, was converting the
// total, and a promotion code is redeemed against the converted total.
// Measured on the form a checkout sends to a fake Stripe.
import { describe, it, expect } from 'vitest';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { priceIsCurrent } from '../scripts/stripe-setup.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';

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

const sessionForm = async (opts = {}, plan = 'pro') => {
  const s = fakeStripe();
  const client = stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl: s.fetchImpl, ...opts });
  await client.checkout({ person: '11111111-1111-4111-8111-111111111111', plan, successUrl: 'https://x/v1/paid', cancelUrl: 'https://x/v1/paid?cancelled=1' });
  return s.calls.find((c) => c.path === '/v1/checkout/sessions').form;
};

describe('a cloud checkout is charged in the dollars the plan screen offers', () => {
  it('asks Stripe not to convert the price', async () => {
    expect((await sessionForm())['adaptive_pricing[enabled]']).toBe('false');
  });

  it('asks again with Managed Payments on, which converts by itself', async () => {
    const form = await sessionForm({ managedPayments: true });
    expect(form['managed_payments[enabled]']).toBe('true');
    expect(form['adaptive_pricing[enabled]']).toBe('false');
  });

  it('on every plan, not only the one that was tested', async () => {
    for (const plan of ['pro', 'plus', 'max']) expect((await sessionForm({}, plan))['adaptive_pricing[enabled]']).toBe('false');
  });

  it('still shows the box a promotion code is typed into', async () => {
    const form = await sessionForm();
    expect(form.allow_promotion_codes).toBe('true');
    expect(form['adaptive_pricing[enabled]']).toBe('false');
  });

  it('and the price it sells is in dollars, so a euro one is not ours', () => {
    const usd = { active: true, currency: 'usd', unit_amount: PLANS.pro.dollarsPerMonth * 100, recurring: { interval: 'month' } };
    expect(priceIsCurrent(usd, PLANS.pro)).toBe(true);
    expect(priceIsCurrent({ ...usd, currency: 'eur' }, PLANS.pro)).toBe(false);
  });
});
