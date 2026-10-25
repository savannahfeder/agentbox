// A MAC OPENS STRIPE TO PAY FOR A CLOUD PLAN, AND READS WHICH PLAN IT IS ON.
//
// The cloud server sells plans through Stripe since 2026-10-20 (w-6633e825a7),
// but nothing in the app could reach it: a person had no way to pay. This is
// the app's half. Paying opens Stripe's own checkout in the browser; someone
// already paying is sent to their billing page instead. Only Stripe's two
// pages are ever opened, so a server that answered with anything else opens
// nothing on this Mac.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { signInToCloud, cloudPlan, payForCloud, openCloudBilling } from '../main/cloud/account.mjs';

const P = '77777777-7777-4777-8777-777777777777';
let home; let server; let gateway; let opened; let stripe; const env = {};

function stubStripe() {
  const s = {
    paying: null,
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
    billingUrl: 'https://billing.stripe.com/p/session/test_1',
    asked: [],
    returns: {},
    async checkout(a) { s.asked.push(['checkout', a.plan]); s.returns = { success: a.successUrl, cancel: a.cancelUrl }; return { id: 'cs_test_1', url: s.checkoutUrl }; },
    async session(id) { return { id, status: 'open', url: s.checkoutUrl }; },
    async expire(id) { return { id, status: 'expired' }; },
    async billing(a) { s.asked.push(['billing', a.customer]); return s.billingUrl; },
    async subscription() { return s.paying; },
    signed: () => true,
  };
  return s;
}

async function start({ billing = true } = {}) {
  stripe = billing ? stubStripe() : null;
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'google-session' ? { id: P } : null),
    plans: PLANS,
    ...(stripe ? { stripe } : {}),
  });
  server = gatewayServer(gw);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  gateway = `http://127.0.0.1:${server.address().port}`;
  return gw;
}
const signIn = () => signInToCloud({ config: { gateway }, acceptedTerms: TERMS_VERSION, googleSignIn: async () => 'google-session', env, home });
const open = (u) => { opened.push(u); };
// Stripe says this person pays for `plan`, through the webhook.
const pays = async (gw, plan) => {
  stripe.paying = { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { person: P }, items: { data: [{ price: { lookup_key: `agentbox_cloud_${plan}_monthly` } }] } };
  await gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': 'stub' }, body: JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } }) });
};

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudpay-'));
  opened = [];
});

afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); server = null; }
  fs.rmSync(home, { recursive: true, force: true });
});

describe('paying', () => {
  it('opens Stripe\'s checkout for the plan in the browser', async () => {
    await start();
    await signIn();
    expect(await payForCloud({ plan: 'plus', openExternal: open, env, home })).toEqual({ ok: true, where: 'checkout' });
    expect(opened).toEqual(['https://checkout.stripe.com/c/pay/cs_test_1']);
    expect(stripe.asked).toEqual([['checkout', 'plus']]);
  });

  // Stripe's last page names the plan (tests/stripe-opens-in-the-browser-like-other-desktop-apps).
  it('sends Stripe back to a page that knows the plan, and to one that knows it was cancelled', async () => {
    await start();
    await signIn();
    await payForCloud({ plan: 'plus', openExternal: open, env, home });
    expect(stripe.returns.success).toMatch(/^https:\/\/[^/]+\/v1\/paid\?plan=plus$/);
    expect(stripe.returns.cancel).toMatch(/^https:\/\/[^/]+\/v1\/paid\?cancelled=1$/);
  });

  it('someone already paying is sent to their billing page', async () => {
    const gw = await start();
    await signIn();
    await pays(gw, 'pro');
    expect(await payForCloud({ plan: 'max', openExternal: open, env, home })).toEqual({ ok: true, where: 'billing' });
    expect(opened).toEqual(['https://billing.stripe.com/p/session/test_1']);
  });

  it('a plan the server does not sell opens nothing and says why', async () => {
    await start();
    await signIn();
    const out = await payForCloud({ plan: 'gold', openExternal: open, env, home });
    expect(out).toMatchObject({ ok: false, error: 'bad-request' });
    expect(opened).toEqual([]);
  });

  it('a page that is not Stripe\'s is never opened', async () => {
    await start();
    await signIn();
    for (const url of ['https://checkout.stripe.com.evil.example/x', 'http://checkout.stripe.com/c/pay/x', 'file:///etc/passwd', 'https://example.com/']) {
      stripe.checkoutUrl = url;
      const out = await payForCloud({ plan: 'pro', openExternal: open, env, home });
      expect(out).toMatchObject({ ok: false });
    }
    expect(opened).toEqual([]);
  });

  it('signed out, nothing is asked and nothing opens', async () => {
    await start();
    expect(await payForCloud({ plan: 'pro', openExternal: open, env, home })).toMatchObject({ ok: false, error: 'signed-out' });
    expect(opened).toEqual([]);
    expect(stripe.asked).toEqual([]);
  });

  it('a server with paying not set up says so', async () => {
    await start({ billing: false });
    await signIn();
    const out = await payForCloud({ plan: 'pro', openExternal: open, env, home });
    expect(out).toMatchObject({ ok: false, error: 'billing' });
    expect(out.message).toMatch(/not set up/);
  });
});

describe('billing', () => {
  it('someone who pays gets their billing page', async () => {
    const gw = await start();
    await signIn();
    await pays(gw, 'plus');
    expect(await openCloudBilling({ openExternal: open, env, home })).toEqual({ ok: true });
    expect(opened).toEqual(['https://billing.stripe.com/p/session/test_1']);
  });

  it('someone who never paid is told so', async () => {
    await start();
    await signIn();
    expect(await openCloudBilling({ openExternal: open, env, home })).toMatchObject({ ok: false, error: 'no-billing' });
    expect(opened).toEqual([]);
  });
});

describe('which plan this Mac is on', () => {
  it('no plan until paid, then the plan Stripe says', async () => {
    const gw = await start();
    await signIn();
    expect(await cloudPlan({ env, home })).toMatchObject({ signedIn: true, plan: 'none', agents: 0 });
    await pays(gw, 'max');
    expect(await cloudPlan({ env, home })).toMatchObject({ signedIn: true, plan: 'max', unlimited: true, hoursPerMonth: 3000 });
  });

  it('signed out is not signed in, and asks nobody', async () => {
    expect(await cloudPlan({ env, home })).toEqual({ signedIn: false });
  });
});
