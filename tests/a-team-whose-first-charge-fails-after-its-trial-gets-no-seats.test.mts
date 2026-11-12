// A TEAM WHOSE FIRST CHARGE FAILS AFTER ITS TRIAL GETS NO SEATS (2026-11-12).
//
// Since the team checkout started trialing to the team's own free days, a
// subscription can reach `past_due` without ever having been paid: the card
// passes Stripe's setup check, the first charge at the trial's end fails, and
// Stripe retries it for weeks. `past_due` counted as paying, so the team kept
// 400 hours and 10 agents a member through every retry and was never charged.
// Measured on stand-ins against the real gateway: trialing then past_due gave
// `seats: 2, hours: 400` a day after the trial ended. `past_due` now pays only
// for a subscription that was once `active`, which is what a renewal's retry is.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'whsec_test_secret';
const DAY = 24 * 60 * 60_000;
const MADE = Date.UTC(2026, 10, 17, 9);
const TRIAL_ENDS = MADE + TEAM.trialDays * DAY;

function setup({ ledger = null }: { ledger?: unknown } = {}) {
  let clock = MADE + 60_000;
  const objects = memoryObjects();
  if (ledger) void objects.put('ledger/teams/team-1.json', JSON.stringify(ledger));
  const subs = new Map<string, unknown>();
  const fetchImpl = async (url: string) => {
    const u = new URL(url);
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    const m = /^\/v1\/subscriptions\/(.+)$/.exec(u.pathname);
    if (m) return subs.has(m[1]) ? json(200, subs.get(m[1])) : json(404, { error: { message: 'No such subscription' } });
    return json(404, { error: { message: 'not faked' } });
  };
  const team = { id: 'team-1', createdAt: MADE, members: [A, B], owners: [A] };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (k: string) => `https://b/${k}`, head: async (k: string) => `https://b/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t: string) => (t === 'session-b' ? { id: B } : null),
    teams: async (p: string) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: SECRET, fetchImpl }),
    now: () => clock,
    plans: PLANS,
  });
  let key: string | null = null;
  const teamOfMember = async () => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-b' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return (await gw.handle({ method: 'GET', path: '/v1/me', headers: { authorization: `Bearer ${key}` }, body: '' })).body.team;
  };
  const webhook = (id: string, status: string) => {
    subs.set(id, {
      id, object: 'subscription', status, customer: 'cus_team', metadata: { team: 'team-1', person: A },
      items: { data: [{ quantity: 2, price: { id: 'price_team', lookup_key: 'agentbox_cloud_team_monthly' } }] },
    });
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'customer.subscription.updated', data: { object: { id, object: 'subscription', status } } });
    const t = Math.floor(clock / 1000);
    const sig = `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}`;
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': sig }, body: raw });
  };
  return { teamOfMember, webhook, tick: (ms: number) => { clock += ms; } };
}

describe('a team subscription that was never paid', () => {
  it('has no seats once its first charge fails after the trial', async () => {
    const { teamOfMember, webhook, tick } = setup();
    await webhook('sub_team', 'trialing');
    tick(TRIAL_ENDS - MADE + DAY);
    await webhook('sub_team', 'past_due');
    expect(await teamOfMember()).toBeUndefined();
  });

  it('is still the trial while the free days last', async () => {
    const { teamOfMember, webhook } = setup();
    await webhook('sub_team', 'past_due');
    expect(await teamOfMember()).toMatchObject({ trial: true, seats: 0, hours: TEAM.trialHoursPerMember });
  });
});

describe('a team subscription that was paid', () => {
  it('keeps its seats while Stripe retries a renewal', async () => {
    const { teamOfMember, webhook, tick } = setup();
    await webhook('sub_team', 'active');
    tick(30 * DAY);
    await webhook('sub_team', 'past_due');
    expect(await teamOfMember()).toMatchObject({ trial: false, seats: 2, hours: TEAM.hoursPerSeat });
  });

  it('keeps them through a second retry after the first', async () => {
    const { teamOfMember, webhook, tick } = setup();
    await webhook('sub_team', 'trialing');
    tick(TRIAL_ENDS - MADE + DAY);
    await webhook('sub_team', 'active');
    tick(30 * DAY);
    await webhook('sub_team', 'past_due');
    await webhook('sub_team', 'past_due');
    expect(await teamOfMember()).toMatchObject({ trial: false, seats: 2 });
  });

  it('keeps them when the retry began before payments were recorded', async () => {
    const before = { plan: 'team', seats: 2, stripe: { customer: 'cus_team', subscription: 'sub_team', status: 'past_due', at: MADE } };
    const { teamOfMember, webhook, tick } = setup({ ledger: before });
    tick(TRIAL_ENDS - MADE + DAY);
    expect(await teamOfMember()).toMatchObject({ trial: false, seats: 2 });
    await webhook('sub_team', 'past_due');
    expect(await teamOfMember()).toMatchObject({ trial: false, seats: 2 });
  });

  it('a new subscription that was never paid does not inherit the old one’s payment', async () => {
    const { teamOfMember, webhook, tick } = setup();
    await webhook('sub_old', 'active');
    await webhook('sub_old', 'canceled');
    tick(TRIAL_ENDS - MADE + DAY);
    await webhook('sub_new', 'past_due');
    expect(await teamOfMember()).toBeUndefined();
  });
});

describe('a trialing team', () => {
  it('is on its seats, as the setup’s "Try Pro free" offers', async () => {
    const { teamOfMember, webhook } = setup();
    await webhook('sub_team', 'trialing');
    expect(await teamOfMember()).toMatchObject({ trial: false, seats: 2, hours: TEAM.hoursPerSeat });
  });
});
