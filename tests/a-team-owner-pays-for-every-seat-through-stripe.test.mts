// A TEAM'S OWNER PAYS FOR EVERY SEAT THROUGH STRIPE.
//
// The team plan (the owner, 2026-11-06) is $40 a member a month. Before this
// only a person could pay, for themselves. Now the team's owner opens Stripe's
// checkout for the team, one seat per member, and Stripe's webhook puts the
// whole team on it. Anyone else on the team is told to ask the owner.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'whsec_test_secret';
const HOST = 'gw.example.on.aws';
const DAY = 24 * 60 * 60_000;
const MADE = Date.UTC(2026, 10, 17, 9);

function setup({ start = MADE + 60_000 } = {}) {
  let clock = start;
  const calls = [];
  const subs = new Map();
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, form: Object.fromEntries(form) });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') return json(200, { data: form.get('lookup_keys[0]') === 'agentbox_cloud_team_monthly' ? [{ id: 'price_team' }] : [{ id: 'price_other' }] });
    if (u.pathname === '/v1/checkout/sessions') return json(200, { id: 'cs_team_1', url: 'https://checkout.stripe.com/c/pay/cs_team_1' });
    if (u.pathname.startsWith('/v1/checkout/sessions/')) return json(200, { id: 'cs_team_1', status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_team_1' });
    if (u.pathname === '/v1/billing_portal/sessions') return json(200, { url: 'https://billing.stripe.com/p/session/team_1' });
    if (u.pathname === '/v1/customers/cus_team') return json(200, { id: 'cus_team', email: 'billing@example.com', invoice_settings: { default_payment_method: null } });
    if (u.pathname === '/v1/invoices') return json(200, { data: [{ created: 1794900000, status: 'paid', amount_paid: 12000, amount_due: 12000 }, { created: 1792300000, status: 'open', amount_paid: 0, amount_due: 12000, attempted: true }] });
    const m = /^\/v1\/subscriptions\/(.+)$/.exec(u.pathname);
    if (m) return subs.has(m[1]) ? json(200, subs.get(m[1])) : json(404, { error: { message: 'No such subscription' } });
    return json(404, { error: { message: 'not faked' } });
  };
  const team = { id: 'team-1', createdAt: MADE, members: [A, B], owners: [A] };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => `https://b/${k}`, put: async (k) => `https://b/${k}`, head: async (k) => `https://b/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => ({ 'session-a': { id: A }, 'session-b': { id: B } })[t] ?? null,
    teams: async (p) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: SECRET, fetchImpl }),
    now: () => clock,
    plans: PLANS,
  });
  const keys = {};
  const as = (who) => async (method, path, body) => {
    const token = who === A ? 'session-a' : 'session-b';
    keys[who] ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${keys[who]}`, host: HOST }, body: body ? JSON.stringify(body) : '' });
  };
  const webhook = (id, status, quantity) => {
    subs.set(id, {
      id, object: 'subscription', status, customer: 'cus_team', metadata: { team: 'team-1', person: A },
      default_payment_method: { card: { brand: 'visa', last4: '4242' } },
      items: { data: [{ quantity, current_period_start: 1794900000, current_period_end: 1797500000, price: { id: 'price_team', lookup_key: 'agentbox_cloud_team_monthly' } }] },
    });
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'customer.subscription.updated', data: { object: { id, object: 'subscription', status } } });
    const t = Math.floor(clock / 1000);
    const sig = `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}`;
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': sig }, body: raw });
  };
  return { gw, calls, team, owner: as(A), member: as(B), webhook, tick: (ms) => { clock += ms; } };
}

describe('the owner pays for the team', () => {
  it('opens Stripe\'s checkout at $40 a seat, one seat a member, for the team', async () => {
    const { owner, calls } = setup();
    const out = await owner('POST', '/v1/checkout', { plan: 'team' });
    expect(out.body).toMatchObject({ url: 'https://checkout.stripe.com/c/pay/cs_team_1', where: 'checkout' });
    const made = calls.find((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST');
    expect(made.form).toMatchObject({ 'line_items[0][price]': 'price_team', 'line_items[0][quantity]': '2', 'subscription_data[metadata][team]': 'team-1', 'metadata[team]': 'team-1' });
  });

  it('anyone else on the team is told to ask the owner, and nothing is opened', async () => {
    const { member, calls } = setup();
    const out = await member('POST', '/v1/checkout', { plan: 'team' });
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ error: 'owner' });
    expect(out.body.message).toMatch(/owner/);
    expect(calls.filter((c) => c.path === '/v1/checkout/sessions')).toEqual([]);
  });

  it('someone on no team cannot buy a team', async () => {
    const { owner, team } = setup();
    team.members = [];
    expect((await owner('POST', '/v1/checkout', { plan: 'team' })).body).toMatchObject({ error: 'no-team' });
  });
});

describe('Stripe\'s webhook', () => {
  it('puts the whole team on its seats, the trial over', async () => {
    const { owner, member, webhook } = setup();
    await webhook('sub_team', 'active', 3);
    // Each member's seat is the $40 cloud plan's: 400 hours and 10 agents at once of their own.
    expect((await member('GET', '/v1/me')).body.team).toMatchObject({ trial: false, seats: 3, hours: 400, agents: 10 });
    expect((await owner('GET', '/v1/me')).body.team.owner).toBe(true);
  });

  it('a cancelled team goes back to its trial while the 14 days last, then to nothing', async () => {
    const { member, webhook, tick } = setup();
    await webhook('sub_team', 'active', 2);
    await webhook('sub_team', 'canceled', 2);
    expect((await member('GET', '/v1/me')).body.team).toMatchObject({ trial: true });
    tick(14 * DAY);
    expect((await member('GET', '/v1/me')).body.team).toBeUndefined();
  });

  it('a person\'s own subscription is not taken for a team\'s', async () => {
    const { owner, webhook } = setup();
    await webhook('sub_team', 'active', 2);
    expect((await owner('GET', '/v1/me')).body.plan).toBe('none');
  });
});

describe('what the owner sees of Stripe', () => {
  it('the period, the next bill, the card, where invoices go and the last invoices', async () => {
    const { owner, webhook } = setup();
    await webhook('sub_team', 'active', 3);
    expect((await owner('GET', '/v1/team-billing')).body).toEqual({
      owner: true, periodStart: 1794900000 * 1000, periodEnd: 1797500000 * 1000,
      nextAt: 1797500000 * 1000, nextAmount: 120,
      card: { brand: 'Visa', last4: '4242' }, email: 'billing@example.com',
      invoices: [{ at: 1794900000 * 1000, amount: 120, status: 'paid' }, { at: 1792300000 * 1000, amount: 120, status: 'failed' }],
    });
  });

  it('before paying, nothing of Stripe, and no call to it', async () => {
    const { owner, calls } = setup();
    expect((await owner('GET', '/v1/team-billing')).body).toMatchObject({ owner: true, card: null, invoices: [], nextAt: null });
    expect(calls).toEqual([]);
  });

  it('anyone else on the team is told only that the owner pays', async () => {
    const { member, webhook } = setup();
    await webhook('sub_team', 'active', 3);
    expect((await member('GET', '/v1/team-billing')).body).toEqual({ owner: false });
  });
});

describe('once the team pays', () => {
  it('the owner\'s checkout and billing open the team\'s billing page', async () => {
    const { owner, webhook } = setup();
    await webhook('sub_team', 'active', 2);
    expect((await owner('POST', '/v1/checkout', { plan: 'team' })).body).toMatchObject({ url: 'https://billing.stripe.com/p/session/team_1', where: 'billing' });
    expect((await owner('POST', '/v1/billing', {})).body).toMatchObject({ url: 'https://billing.stripe.com/p/session/team_1' });
  });
});
