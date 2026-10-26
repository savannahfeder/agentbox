// A BROWSER TAB OPENS STRIPE TO PAY FOR THE CLOUD, AS THE DESKTOP DOES.
//
// What broke: in the browser copy of the app (`npx agentbox-app`), Choose Pro
// said "The cloud did not answer: Cannot read properties of undefined (reading
// 'openExternal')". The cloud server had made the checkout, but the handler
// asked Electron for `shell`, and outside Electron the `electron` package is
// only the path to its binary. Found by walking a copy of the app through
// sign-in to Choose Pro in a headless browser, against a cloud server of our
// own on the Stripe sandbox (2026-10-25).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { signInToCloud } from '../main/cloud/account.mjs';
import { bootHeadless, nodeHost } from '../main/serve.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = '88888888-8888-4888-8888-888888888888';
const CHECKOUT = 'https://checkout.stripe.com/c/pay/cs_test_tab';
const BILLING = 'https://billing.stripe.com/p/session/test_tab';
let dir; let server; let booted; let opened; let paying; let realHome; let realCloud;

async function cloud() {
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'tab-session' ? { id: P } : null),
    plans: PLANS,
    stripe: {
      async checkout() { return { id: 'cs_test_tab', url: CHECKOUT }; },
      async session(id) { return { id, status: 'open', url: CHECKOUT }; },
      async expire(id) { return { id, status: 'expired' }; },
      async billing() { return BILLING; },
      async subscription() { return paying; },
      signed: () => true,
    },
  });
  server = gatewayServer(gw);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return gw;
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-tab-pays-'));
  opened = [];
  paying = null;
  // The copy reads its cloud settings from its own home, never the real one.
  realHome = process.env.HOME;
  realCloud = process.env.AGENTBOX_CLOUD_CONFIG;
  process.env.HOME = dir;
  process.env.AGENTBOX_CLOUD_CONFIG = path.join(dir, '.agentbox', 'cloud.json');
  fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot: path.join(dir, 'store') }));
});

afterEach(async () => {
  booted?.host.app.quit();
  booted = null;
  process.env.HOME = realHome;
  if (realCloud === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = realCloud;
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); server = null; }
  fs.rmSync(dir, { recursive: true, force: true });
});

const signedInTab = async () => {
  const gw = await cloud();
  await signInToCloud({ config: { gateway: `http://127.0.0.1:${server.address().port}` }, acceptedTerms: TERMS_VERSION, googleSignIn: async () => 'tab-session', env: {}, home: dir });
  booted = await bootHeadless({ dataDir: dir, appDir: repoRoot, userDir: dir, openExternal: (u) => { opened.push(u); } });
  return gw;
};
const ask = (channel, payload) => booted.channels.get(channel)({ sender: null }, payload);

describe('paying for the cloud from a browser tab', () => {
  it('opens Stripe\'s checkout for the plan', async () => {
    await signedInTab();
    expect(await ask('zero:cloud-account-pay', { plan: 'pro' })).toEqual({ ok: true, where: 'checkout' });
    expect(opened).toEqual([CHECKOUT]);
  });

  it('opens the billing page for someone already paying', async () => {
    const gw = await signedInTab();
    paying = { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { person: P }, items: { data: [{ price: { lookup_key: 'agentbox_cloud_pro_monthly' } }] } };
    await gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': 'stub' }, body: JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } }) });
    expect(await ask('zero:cloud-account-billing')).toEqual({ ok: true });
    expect(opened).toEqual([BILLING]);
  });

  it('opens nothing for a plan the cloud does not sell', async () => {
    await signedInTab();
    expect(await ask('zero:cloud-account-pay', { plan: 'gold' })).toMatchObject({ ok: false });
    expect(opened).toEqual([]);
  });
});

describe('the browser copy\'s stand-in for Electron', () => {
  it('can open a page in the browser', () => {
    const seen = [];
    nodeHost({ openExternal: (u) => { seen.push(u); } }).shell.openExternal('https://checkout.stripe.com/c/pay/x');
    expect(seen).toEqual(['https://checkout.stripe.com/c/pay/x']);
  });
});
