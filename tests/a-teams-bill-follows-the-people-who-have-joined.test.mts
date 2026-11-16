// A TEAM'S BILL FOLLOWS THE PEOPLE WHO HAVE JOINED (w-1e52420829, 2026-11-13).
//
// The owner of a four-person team opened the checkout and read "Qty 4,
// $160.00": "why would it default bill for 4? it should bill for one then when
// you add team members (only when they accept invites) should it increase the
// bill. just like vercel". The checkout did count the people on the team, so a
// new team was one seat. What was missing is the other half: nothing ever told
// Stripe when somebody joined afterwards, so a team that paid for one seat and
// grew to four went on paying for one.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'whsec_test_secret';
const MADE = Date.UTC(2026, 10, 17, 9);

function setup() {
  let clock = MADE + 60 * 60_000;
  const sub = { id: 'sub_team', object: 'subscription', status: 'active', customer: 'cus_team', metadata: { team: 'team-1', person: A }, items: { data: [{ id: 'si_1', quantity: 1, price: { id: 'price_team', lookup_key: 'agentbox_cloud_team_monthly' } }] } };
  const asked: Array<{ path: string; body: string }> = [];
  let fail = false;
  const fetchImpl = async (url: string, init: { method?: string; body?: string } = {}) => {
    const u = new URL(url);
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (init.method === 'POST') asked.push({ path: u.pathname, body: String(init.body ?? '') });
    if (u.pathname === '/v1/subscriptions/sub_team') return json(200, sub);
    if (u.pathname === '/v1/subscription_items/si_1' && init.method === 'POST') {
      if (fail) return json(500, { error: { message: 'down' } });
      sub.items.data[0].quantity = Number(new URLSearchParams(String(init.body)).get('quantity'));
      return json(200, sub.items.data[0]);
    }
    if (u.pathname === '/v1/prices') return json(200, { data: [{ id: 'price_team' }] });
    if (u.pathname === '/v1/checkout/sessions' && init.method === 'POST') return json(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    return json(404, { error: { message: 'not faked' } });
  };
  const team = { id: 'team-1', createdAt: MADE, members: [A], owners: [A] };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (k: string) => `https://b/${k}`, head: async (k: string) => `https://b/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t: string) => ({ 'session-a': { id: A }, 'session-b': { id: B } } as Record<string, { id: string }>)[t] ?? null,
    teams: async (p: string) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: SECRET, fetchImpl }),
    now: () => clock,
    plans: PLANS,
  });
  let key: string | undefined;
  const call = async (method: string, path: string, body?: unknown) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}`, host: 'cloud.test' }, body: body ? JSON.stringify(body) : '' });
  };
  const webhook = () => {
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'customer.subscription.updated', data: { object: { id: sub.id, object: 'subscription', status: sub.status } } });
    const t = Math.floor(clock / 1000);
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}` }, body: raw });
  };
  const seatChanges = () => asked.filter((a) => a.path === '/v1/subscription_items/si_1').map((a) => Number(new URLSearchParams(a.body).get('quantity')));
  return { team, sub, asked, call, webhook, seatChanges, me: async () => (await call('GET', '/v1/me')).body, tick: (ms: number) => { clock += ms; }, failing: (on: boolean) => { fail = on; } };
}

describe('a new team', () => {
  it('is charged for one seat at the checkout, whoever has been invited', async () => {
    const s = setup();
    const out = await s.call('POST', '/v1/checkout', { plan: 'team' });
    expect(out.status).toBe(200);
    const made = s.asked.find((a) => a.path === '/v1/checkout/sessions')!;
    expect(new URLSearchParams(made.body).get('line_items[0][quantity]')).toBe('1');
  });
});

describe('a team that pays', () => {
  it('pays for one more seat once somebody has joined', async () => {
    const s = setup();
    await s.webhook();
    expect((await s.me()).team.seats).toBe(1);
    expect(s.seatChanges()).toEqual([]);
    s.team.members.push(B);
    await s.me();
    expect(s.seatChanges()).toEqual([2]);
    await s.webhook();
    expect((await s.me()).team.seats).toBe(2);
  });
  it('is not asked again once Stripe has the count', async () => {
    const s = setup();
    await s.webhook();
    s.team.members.push(B);
    await s.me();
    await s.webhook();
    await s.me();
    await s.me();
    expect(s.seatChanges()).toEqual([2]);
  });
  it('pays for one fewer once somebody has left, and never for none', async () => {
    const s = setup();
    s.sub.items.data[0].quantity = 2;
    s.team.members.push(B);
    await s.webhook();
    s.team.members.pop();
    await s.me();
    expect(s.seatChanges()).toEqual([1]);
  });
  it('still answers when Stripe is down, and tries again later, not on every call', async () => {
    const s = setup();
    await s.webhook();
    s.team.members.push(B);
    s.failing(true);
    expect((await s.me()).team.seats).toBe(1);
    await s.me();
    expect(s.seatChanges()).toEqual([2]);
    s.failing(false);
    s.tick(11 * 60_000);
    await s.me();
    expect(s.seatChanges()).toEqual([2, 2]);
  });
  it('charges the new seat for the rest of the month it joined in', async () => {
    const s = setup();
    await s.webhook();
    s.team.members.push(B);
    await s.me();
    expect(new URLSearchParams(s.asked.find((a) => a.path === '/v1/subscription_items/si_1')!.body).get('proration_behavior')).toBe('create_prorations');
  });
});

describe('a team on its free days with no card', () => {
  it('has no subscription to change', async () => {
    const s = setup();
    s.team.members.push(B);
    await s.me();
    expect(s.seatChanges()).toEqual([]);
    expect(TEAM.trialDays).toBeGreaterThan(0);
  });
});
