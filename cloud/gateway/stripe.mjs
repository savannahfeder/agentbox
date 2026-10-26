// WHAT THE CLOUD SERVER ASKS OF STRIPE: a checkout page for a plan, the
// billing page for someone who pays, a subscription as it stands now, and
// whether a webhook really came from Stripe. Plain HTTPS, no SDK, every call
// with a deadline. Stripe's own page takes the card; nothing here sees one.
import crypto from 'node:crypto';

const API = 'https://api.stripe.com';
const TIMEOUT_MS = 15_000;
// Stripe signs a webhook with the time it sent it; an older one is a replay.
const SIGNATURE_TOLERANCE_S = 5 * 60;

// The price a plan sells at is found by this name, in the sandbox and live alike.
export const lookupKeyOf = (plan) => `agentbox_cloud_${plan}_monthly`;
export const planOfLookupKey = (key) => /^agentbox_cloud_([a-z]+)_monthly$/.exec(key || '')?.[1] ?? null;

// A subscription in these states pays for its plan. past_due is Stripe still
// retrying a card; it ends as canceled or unpaid when the retries run out.
export const PAYING = new Set(['active', 'trialing', 'past_due']);

/** Stripe's form encoding: `a[b][0][c]=d`. */
export function formOf(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formOf(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}

/** Whether `raw` is a body Stripe signed with `secret` in the last five minutes. */
export function stripeSigned(raw, header, secret, nowMs) {
  const parts = String(header || '').split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || !secret) return false;
  if (Math.abs(nowMs / 1000 - t) > SIGNATURE_TOLERANCE_S) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}

// `managedPayments`: Stripe is the seller of record and handles sales tax
// (Settings › Managed Payments in the Dashboard must be on).
export function stripeClient({ key, webhookSecret, managedPayments = false, fetchImpl = fetch }) {
  async function call(method, path, params) {
    const form = params ? formOf(params).toString() : '';
    const url = method === 'GET' && form ? `${API}${path}?${form}` : `${API}${path}`;
    const res = await fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(method === 'POST' ? { body: form } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe said ${res.status}: ${out?.error?.message || 'no reason given'}`);
    return out;
  }

  async function priceOf(plan) {
    const found = await call('GET', '/v1/prices', { lookup_keys: [lookupKeyOf(plan)], active: true });
    const price = found.data?.[0];
    if (!price) throw new Error(`Stripe has no price named ${lookupKeyOf(plan)} (scripts/stripe-setup.mjs makes it)`);
    return price.id;
  }

  return {
    async checkout({ person, plan, customer, successUrl, cancelUrl }) {
      const session = await call('POST', '/v1/checkout/sessions', {
        mode: 'subscription',
        line_items: [{ price: await priceOf(plan), quantity: 1 }],
        client_reference_id: person,
        // The webhook finds the person on the subscription, whatever event it is.
        subscription_data: { metadata: { person } },
        metadata: { person },
        ...(customer ? { customer } : {}),
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        // Adaptive Pricing, on by itself under Managed Payments, otherwise
        // converts the dollars the plan screen offers into a currency read
        // from the browser, and a promotion code is then redeemed against the
        // converted total.
        adaptive_pricing: { enabled: false },
        ...(managedPayments ? { managed_payments: { enabled: true } } : {}),
      });
      return { id: session.id, url: session.url };
    },
    session: (id) => call('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`),
    expire: (id) => call('POST', `/v1/checkout/sessions/${encodeURIComponent(id)}/expire`),
    // `switchTo`: open at Stripe's page confirming that change, with its proration shown.
    async billing({ customer, returnUrl, switchTo = null }) {
      let flow = {};
      if (switchTo) {
        const sub = await call('GET', `/v1/subscriptions/${encodeURIComponent(switchTo.subscription)}`);
        const item = sub.items?.data?.[0]?.id;
        if (!item) throw new Error(`Stripe's subscription ${switchTo.subscription} has no item to change`);
        flow = { flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: { subscription: sub.id, items: [{ id: item, price: await priceOf(switchTo.plan), quantity: 1 }] },
          after_completion: { type: 'redirect', redirect: { return_url: returnUrl } },
        } };
      }
      return (await call('POST', '/v1/billing_portal/sessions', { customer, return_url: returnUrl, ...flow })).url;
    },
    subscription: (id) => call('GET', `/v1/subscriptions/${encodeURIComponent(id)}`),
    signed: (raw, header, nowMs) => stripeSigned(raw, header, webhookSecret, nowMs),
  };
}
