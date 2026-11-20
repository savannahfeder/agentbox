// After the team paid, Back from the next step went to the plan page, which
// still drew the offer. And the team checkout, asked again after Stripe had
// taken the card but before its webhook landed, found its checkout "complete",
// not "open", and opened a second one, which would bill the team twice.
// Measured with stepBefore on the setup's steps, and with the gateway's team
// checkout against a fake Stripe that counts the checkouts made.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { dashGoesBack, stepBefore, type SetupStep } from '../renderer/src/setup-split.ts';

const steps: SetupStep[] = ['chats', 'account', 'plan', 'look'];

describe('Back in the setup, once Pro is paid for', () => {
  it('passes over the plan page, and the account made before it', () => {
    expect(stepBefore(steps, 3, true, true)).toBe(0);
  });
  it('passes over only the plan page while the account step still applies', () => {
    expect(stepBefore(steps, 3, false, true)).toBe(1);
  });
  it('passes over it with no account step', () => {
    expect(stepBefore(['folder', 'plan', 'look'], 2, true, true)).toBe(0);
  });
  it('still goes to the plan page before paying', () => {
    expect(stepBefore(steps, 3, true, false)).toBe(2);
    expect(stepBefore(steps, 3, true)).toBe(2);
  });
  it('leaves the plan page’s dash no way back to it, until then', () => {
    expect(dashGoesBack(steps, 2, 3, true, true)).toBe(false);
    expect(dashGoesBack(steps, 2, 3, true, false)).toBe(true);
    expect(dashGoesBack(steps, 0, 3, true, true)).toBe(true);
  });
  it('is what the setup does, paid by its own wait or by what the cloud says', () => {
    const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
    expect(split).toMatch(/const paid = plan === 'pro' \|\| teamPaid\(seen\);/);
    expect(split).toContain('const backTo = stepBefore(steps, at, signedIn, paid);');
    expect(split).toMatch(/dashGoesBack\(steps, i, at, signedIn, paid\)/);
    expect(split).toMatch(/if \(paid\) \{ next\(\); return; \}/);
    expect(split).toMatch(/go\(paid \? 'Continue'/);
  });
});

const A = '11111111-1111-4111-8111-111111111111';
const MADE = Date.UTC(2026, 10, 17, 9);

function teamGateway({ session = 'open', live = null as string | null } = {}) {
  let made = 0;
  const fetchImpl = async (url: string, init: { method: string }) => {
    const u = new URL(url);
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') return json(200, { data: [{ id: 'price_team' }] });
    if (u.pathname === '/v1/checkout/sessions' && init.method === 'POST') { made += 1; return json(200, { id: `cs_${made}`, url: `https://checkout.stripe.com/c/pay/cs_${made}` }); }
    if (u.pathname.startsWith('/v1/checkout/sessions/')) return json(200, { id: 'cs_1', status: session, customer: session === 'complete' ? 'cus_team' : null, url: 'https://checkout.stripe.com/c/pay/cs_1' });
    if (u.pathname === '/v1/billing_portal/sessions') return json(200, { url: 'https://billing.stripe.com/p/session/team_1' });
    return json(404, { error: { message: 'not faked' } });
  };
  const objects = memoryObjects();
  const team = { id: 'team-1', createdAt: MADE, members: [A], owners: [A] };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => k, put: async (k: string) => k, head: async (k: string) => k },
    removeObject: async () => {},
    objects,
    whoIs: async (t: string) => (t === 'session-a' ? { id: A } : null),
    teams: async (p: string) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: 'whsec_x', fetchImpl }),
    now: () => MADE + 60_000,
    plans: PLANS,
  });
  let key: string | null = null;
  const pay = async () => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return (await gw.handle({ method: 'POST', path: '/v1/checkout', headers: { authorization: `Bearer ${key}`, host: 'gw.example.on.aws' }, body: JSON.stringify({ plan: 'team' }) })).body;
  };
  const seed = async () => {
    if (live) await objects.put('ledger/teams/team-1.json', JSON.stringify({ plan: 'team', seats: 1, stripe: { customer: 'cus_team', subscription: 'sub_team', status: live, paid: live === 'active' } }));
  };
  return { pay, seed, made: () => made };
}

describe('the team checkout, asked again', () => {
  it('reopens the same checkout while it is still open', async () => {
    const g = teamGateway({ session: 'open' });
    expect(await g.pay()).toMatchObject({ where: 'checkout', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    expect(await g.pay()).toMatchObject({ where: 'checkout', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    expect(g.made()).toBe(1);
  });
  it('sends a team whose checkout is paid, before Stripe has said so, to billing', async () => {
    const paid = teamGateway({ session: 'complete' });
    await paid.pay();
    expect(await paid.pay()).toMatchObject({ where: 'billing', url: 'https://billing.stripe.com/p/session/team_1' });
    expect(paid.made()).toBe(1);
  });
  for (const status of ['trialing', 'active']) {
    it(`sends a team with a ${status} subscription to billing, never a checkout`, async () => {
      const g = teamGateway({ live: status });
      await g.seed();
      expect(await g.pay()).toMatchObject({ where: 'billing' });
      expect(g.made()).toBe(0);
    });
  }
  it('opens a new checkout once the last one expired unpaid', async () => {
    const g = teamGateway({ session: 'expired' });
    await g.pay();
    expect(await g.pay()).toMatchObject({ where: 'checkout', url: 'https://checkout.stripe.com/c/pay/cs_2' });
    expect(g.made()).toBe(2);
  });
});
