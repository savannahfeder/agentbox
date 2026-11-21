// STRIPE SENDS PEOPLE BACK TO A PAGE ON THE APP'S OWN ADDRESS.
//
// After paying, Stripe sent people to the cloud server's raw Amazon address
// (…lambda-url.us-east-1.on.aws/v1/paid), and the browser then asked "Open
// Agentbox?" for that address. The owner and a tester both said it felt
// sketchy. Checkout, a cancelled checkout and the billing page now come back
// to /paid on the web app (app.agentbox.ac), with the same words and the same
// way back to the app. The server's own page stays, for checkouts opened
// before this.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { WEB_APP } from '../shared/cloud-address.mts';
import { paidHeadline } from '../cloud/gateway/paid-words.mts';
import { paidPageOf } from '../renderer/src/paid/paid.ts';

const A = '11111111-1111-4111-8111-111111111111';
const HOST = 'gw.example.on.aws';

function fakeStripe() {
  const calls: { path: string; form: Record<string, string> }[] = [];
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ path: u.pathname, form: Object.fromEntries(form) });
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') return json(200, { data: [{ id: 'price_x' }] });
    if (u.pathname === '/v1/checkout/sessions') return json(200, { url: 'https://checkout.stripe.com/c/pay/cs_1' });
    if (u.pathname === '/v1/billing_portal/sessions') return json(200, { url: 'https://billing.stripe.com/p/session/1' });
    return json(404, { error: { message: `no ${u.pathname}` } });
  };
  return { calls, fetchImpl };
}

function setup() {
  const stripe = fakeStripe();
  const gw = createGateway({
    agentcore: { invoke: async () => ({ ok: true }), stop: async () => {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (k: string) => `https://b/${k}`, head: async (k: string) => `https://b/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t: string) => (t === 'session-of-a' ? { id: A } : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl: stripe.fetchImpl }),
  });
  let key: string | undefined;
  const call = async (method: string, path: string, body?: unknown) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}`, host: HOST }, body: body ? JSON.stringify(body) : '' });
  };
  return { gw, call, stripe };
}

describe('where Stripe sends people back to', () => {
  it('a paid checkout and a cancelled one come back to the web app, not the server', async () => {
    const { call, stripe } = setup();
    await call('POST', '/v1/checkout', { plan: 'pro' });
    const made = stripe.calls.find((c) => c.path === '/v1/checkout/sessions');
    expect(made?.form.success_url).toBe(`${WEB_APP}/paid?plan=pro`);
    expect(made?.form.cancel_url).toBe(`${WEB_APP}/paid?cancelled=1`);
    expect(JSON.stringify(stripe.calls)).not.toContain(HOST);
  });

  it('every way back the server hands Stripe is on the web app', () => {
    const src = fs.readFileSync('cloud/gateway/gateway.mjs', 'utf8');
    expect(src).not.toMatch(/(Url|returnUrl): `\$\{(base|hostOf\(headers\))\}\/v1\/paid/);
    expect(src.match(/\$\{WEB_APP\}\/paid/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('the web app is the one on agentbox.ac', () => {
    expect(WEB_APP).toBe('https://app.agentbox.ac');
  });

  it("the server's own page still answers, for a checkout opened before this", async () => {
    const { gw } = setup();
    const r = await gw.handle({ method: 'GET', path: '/v1/paid?plan=team', headers: {} });
    expect(r.status).toBe(200);
    expect(r.body).toContain('You’re on Agentbox Cloud for your team');
  });
});

describe('the page on the web app', () => {
  it('is /paid on the web app, and nowhere else', () => {
    expect(paidPageOf('/paid', '?plan=team', true)).toEqual({ head: 'You’re on Agentbox Cloud for your team' });
    expect(paidPageOf('/paid/', '', true)).not.toBeNull();
    expect(paidPageOf('/paid', '?plan=team', false)).toBeNull();
    expect(paidPageOf('/paidx', '', true)).toBeNull();
    expect(paidPageOf('/t/paid/x', '', true)).toBeNull();
  });

  it("says what the server's page said", () => {
    expect(paidHeadline(new URLSearchParams('plan=pro'))).toBe('You’re on Agentbox Cloud Pro');
    expect(paidHeadline(new URLSearchParams('plan=team'))).toBe('You’re on Agentbox Cloud for your team');
    expect(paidHeadline(new URLSearchParams('cancelled=1'))).toBe('Nothing was charged');
    expect(paidHeadline(new URLSearchParams('billing=1'))).toBe('All done on Stripe');
    expect(paidHeadline(new URLSearchParams('plan=toString'))).toBe('You’re on Agentbox Cloud');
    expect(paidHeadline(new URLSearchParams('plan=none'))).toBe('You’re on Agentbox Cloud');
  });

  it('opens before the web app asks anyone to sign in, and its button goes back to the app', () => {
    const boot = fs.readFileSync('renderer/src/main.tsx', 'utf8');
    expect(boot).toMatch(/paidPageOf\(location\.pathname, location\.search/);
    expect(boot.indexOf('bootPaid(')).toBeGreaterThan(-1);
    expect(boot.indexOf('bootPaid(')).toBeLessThan(boot.indexOf('else if (!theDoorNeedsItsKey()) boot();'));
    const page = fs.readFileSync('renderer/src/paid/PaidPage.tsx', 'utf8');
    expect(page).toMatch(/href=\{`\$\{JOIN_SCHEME\}:\/\/cloud`\}/);
  });
});
