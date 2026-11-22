// A TEAM ON A DISCOUNT CODE SEES THE PRICE IT PAYS.
//
// A team that runs its agents on its own computers was given a 50% off code
// (2026-11-21), so Stripe charges it $20 a seat. Its Plan and Billing page
// still said $40 a seat, and its owner's next bill $80 for two, because both
// were worked out from plans.mjs and never read from Stripe. Measured on the
// cloud server against a fake Stripe that sends a subscription the way the
// live account's API version (2026-09-30.endive) does: its discounts as ids
// until expanded, and each discount's coupon under `source`.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { TeamBilling } from '../renderer/src/team/TeamBilling.tsx';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'whsec_test_secret';
const MADE = Date.UTC(2026, 10, 21, 9);
const DAY = 24 * 60 * 60_000;

function setup({ coupons = {}, couponsDown = false } = {}) {
  const calls = [];
  const subs = new Map();
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, query: u.search });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/customers/cus_team') return json(200, { id: 'cus_team', email: 'billing@example.com', invoice_settings: { default_payment_method: null } });
    if (u.pathname === '/v1/invoices') return json(200, { data: [] });
    const c = /^\/v1\/coupons\/(.+)$/.exec(u.pathname);
    if (c) return couponsDown ? json(500, { error: { message: 'Stripe is down' } }) : coupons[c[1]] ? json(200, coupons[c[1]]) : json(404, { error: { message: 'No such coupon' } });
    const m = /^\/v1\/subscriptions\/(.+)$/.exec(u.pathname);
    if (!m || !subs.has(m[1])) return json(404, { error: { message: 'not faked' } });
    const sub = subs.get(m[1]);
    const expanded = u.searchParams.get('expand[0]') === 'discounts';
    return json(200, { ...sub, discounts: sub.discounts.map((id) => (expanded ? { id, object: 'discount', source: { type: 'coupon', coupon: sub.couponOf[id] } } : id)) });
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
    now: () => MADE + 60_000,
    plans: PLANS,
  });
  const keys = {};
  const as = (who) => async (method, path) => {
    const token = who === A ? 'session-a' : 'session-b';
    keys[who] ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return (await gw.handle({ method, path, headers: { authorization: `Bearer ${keys[who]}`, host: 'gw.example.on.aws' }, body: '' })).body;
  };
  // `couponOf`: each discount's coupon as the expanded discount names it, an id or the coupon itself.
  const webhook = (status, quantity, couponOf = {}) => {
    subs.set('sub_team', {
      id: 'sub_team', object: 'subscription', status, customer: 'cus_team', metadata: { team: 'team-1', person: A },
      discounts: Object.keys(couponOf), couponOf,
      ...(status === 'trialing' ? { trial_end: Math.floor((MADE + 7 * DAY) / 1000) } : {}),
      items: { data: [{ quantity, current_period_start: 1795000000, current_period_end: 1797600000, price: { id: 'price_team', lookup_key: 'agentbox_cloud_team_monthly', unit_amount: 4000 } }] },
    });
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'customer.subscription.updated', data: { object: { id: 'sub_team', object: 'subscription', status } } });
    const t = Math.floor((MADE + 60_000) / 1000);
    const sig = `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}`;
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': sig }, body: raw });
  };
  return { calls, owner: as(A), member: as(B), webhook };
}

const HALF = { co_half: { id: 'co_half', object: 'coupon', percent_off: 50, amount_off: null, duration: 'forever' } };

describe('what the cloud server says a discounted team pays', () => {
  it('a team on a 50% code pays $20 a seat, and its owner\'s next bill for two is $40', async () => {
    const { owner, member, webhook } = setup({ coupons: HALF });
    await webhook('active', 2, { di_1: 'co_half' });
    expect((await owner('GET', '/v1/me')).team).toMatchObject({ seats: 2, dollarsPerSeat: 20 });
    expect((await member('GET', '/v1/me')).team).toMatchObject({ dollarsPerSeat: 20 });
    expect(await owner('GET', '/v1/team-billing')).toMatchObject({ nextAmount: 40 });
  });

  it('the code counts in the free week too, so the page promises what the card will be charged', async () => {
    const { owner, webhook } = setup({ coupons: HALF });
    await webhook('trialing', 2, { di_1: 'co_half' });
    expect((await owner('GET', '/v1/me')).team).toMatchObject({ trial: true, seats: 2, dollarsPerSeat: 20 });
  });

  it('a coupon the expanded discount carries whole needs no second call', async () => {
    const { owner, webhook, calls } = setup();
    await webhook('active', 2, { di_1: HALF.co_half });
    expect((await owner('GET', '/v1/me')).team).toMatchObject({ dollarsPerSeat: 20 });
    expect(calls.filter((c) => c.path.startsWith('/v1/coupons/'))).toEqual([]);
  });

  it('a code taking dollars off takes them off the whole bill, so each seat bears its share', async () => {
    const { owner, webhook } = setup({ coupons: { co_ten: { id: 'co_ten', object: 'coupon', percent_off: null, amount_off: 1000, duration: 'forever' } } });
    await webhook('active', 2, { di_1: 'co_ten' });
    expect((await owner('GET', '/v1/me')).team).toMatchObject({ dollarsPerSeat: 35 });
    expect(await owner('GET', '/v1/team-billing')).toMatchObject({ nextAmount: 70 });
  });

  it('a team with no code is still $40 a seat, and Stripe is asked nothing more', async () => {
    const { owner, webhook, calls } = setup();
    await webhook('active', 2);
    expect((await owner('GET', '/v1/me')).team).toMatchObject({ dollarsPerSeat: 40 });
    expect(await owner('GET', '/v1/team-billing')).toMatchObject({ nextAmount: 80 });
    expect(calls.filter((c) => c.path.startsWith('/v1/coupons/') || c.query.includes('expand%5B0%5D=discounts'))).toEqual([]);
  });

  it('a Stripe that will not say what the coupon is still puts the team on its seats', async () => {
    const { owner, webhook } = setup({ couponsDown: true });
    expect((await webhook('active', 2, { di_1: 'co_half' })).status).toBe(200);
    expect((await owner('GET', '/v1/me')).team).toMatchObject({ seats: 2, dollarsPerSeat: 40 });
  });
});

describe('the Plan and Billing page of a discounted team', () => {
  const NOW = MADE + 2 * DAY;
  const people = [{ id: A, usedSeconds: 0, running: 0 }, { id: B, usedSeconds: 0, running: 0 }];
  const names = [{ id: A, name: 'Sam Rivera', role: 'owner' }, { id: B, name: 'Leo Okafor', role: 'member' }];
  const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const page = (team, me = A, billing = null) => text(renderToStaticMarkup(React.createElement(TeamBilling, { team, people: names, meId: me, billing, now: NOW })));
  const trial = { trial: true, endsAt: MADE + 7 * DAY, seats: 2, members: 2, owner: true, agents: null, running: 0, hours: 50, usedSeconds: 0, people, dollarsPerSeat: 20 };
  const paid = { ...trial, trial: false, endsAt: null, hours: 400 };

  it('in the free week each person is $20 a month, and the owner pays $40 for two', () => {
    expect(page(trial)).toMatch(/From Nov 28, each person \$20 a month 400 cloud hours a month You pay \$40 a month for 2/);
  });

  it('once paying, the price is $40 a month for two, and a member\'s seat is $20', () => {
    expect(page(paid, A, { periodStart: NOW, periodEnd: NOW + 30 * DAY, nextAt: NOW + 30 * DAY, nextAmount: 40, endsAt: null, card: null, email: null, invoices: [] })).toContain('Team · $40 a month');
    expect(page({ ...paid, owner: false }, B)).toMatch(/Your seat \$20 a month 400 cloud hours a month Paid by your team/);
  });

  it('a team the server names no price for is still $40 a seat', () => {
    const { dollarsPerSeat, ...older } = trial;
    expect(dollarsPerSeat).toBe(20);
    expect(page(older)).toMatch(/each person \$40 a month .* You pay \$80 a month for 2/);
  });
});
