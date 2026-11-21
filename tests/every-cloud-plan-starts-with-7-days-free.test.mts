// EVERY CLOUD PLAN STARTS WITH 7 DAYS FREE AND 50 HOURS, AND ONE PRESS STARTS IT FOR REAL.
//
// The owner, 2026-11-16: "any of those plans should give you 7 days free".
// Hours that grew with the plan were turned down: "I'm going to simply get the
// most expensive plan because it's going to give me more trial hours ... We
// can't afford to give more hours. I think when somebody runs out of hours, we
// perhaps prompt them to pay to get access to the full plan." So every plan's
// trial is the same 50 hours, and "Start Pro now" ends the trial on Stripe,
// which charges at once and opens the plan's month. Also: "we got rid of the
// agent slot limitation", so no single plan limits how many run at once.
// Measured on a stand-in Stripe below: before this change Plus and Max checked
// out with no trial, a trialing subscription got the whole month's hours, and
// Pro refused its eleventh agent.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, PLAN_TRIAL } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { cloudPlanOf } from '../main/cloud/account.mts';
import { cloudOffer, planCards, planSummary } from '../renderer/src/cloud-upgrade.ts';

const A = '11111111-1111-4111-8111-111111111111';
const SECRET = 'whsec_test_secret';
const HOST = 'gw.example.on.aws';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 10, 16, 12, 0, 0);

type Sub = { id: string; status: string; customer: string; metadata: { person: string }; items: { data: Array<{ price: { id: string; lookup_key: string } }> } };

function setup({ cardDeclines = false } = {}) {
  let clock = START;
  const calls: Array<{ method: string; path: string; form: Record<string, string> }> = [];
  const subs = new Map<string, Sub>();
  const prices: Record<string, string> = { agentbox_cloud_pro_monthly: 'price_pro', agentbox_cloud_plus_monthly: 'price_plus', agentbox_cloud_max_monthly: 'price_max' };
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ method: init.method, path: u.pathname, form: Object.fromEntries(form) });
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') { const id = prices[form.get('lookup_keys[0]') ?? '']; return json(200, { data: id ? [{ id }] : [] }); }
    if (u.pathname === '/v1/checkout/sessions') return json(200, { id: `cs_${calls.length}`, url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    if (u.pathname.startsWith('/v1/checkout/sessions/')) return json(200, { status: 'expired' });
    if (u.pathname === '/v1/billing_portal/sessions') return json(200, { url: 'https://billing.stripe.com/p/session/test_1' });
    const m = /^\/v1\/subscriptions\/(.+)$/.exec(u.pathname);
    if (m && init.method === 'POST' && form.get('trial_end') === 'now') {
      const s = subs.get(m[1])!;
      subs.set(s.id, { ...s, status: cardDeclines ? 'past_due' : 'active' });
      return json(200, subs.get(s.id));
    }
    if (m) return subs.has(m[1]) ? json(200, subs.get(m[1])) : json(404, { error: { message: 'No such subscription' } });
    return json(404, { error: { message: 'not faked' } });
  };
  const gw = createGateway({
    agentcore: { invoke: async () => ({ ok: true }), stop: async () => {} },
    links: { get: async (k) => `https://b/${k}`, put: async (k) => `https://b/${k}`, head: async (k) => `https://b/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => clock,
    plans: PLANS,
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: SECRET, fetchImpl }),
  });
  let key: string | undefined;
  const call = async (method: string, path: string, body?: unknown) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}`, host: HOST }, body: body ? JSON.stringify(body) : '' });
  };
  const me = async () => (await call('GET', '/v1/me')).body;
  const start = (n: number) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}` } });
  const finish = (n: number) => gw.objectCreated(`runs/u-${A}/r${n}/done.json`);
  const stripeSays = async (id: string, status: string, plan: string) => {
    subs.set(id, { id, status, customer: 'cus_1', metadata: { person: A }, items: { data: [{ price: { id: `price_${plan}`, lookup_key: `agentbox_cloud_${plan}_monthly` } }] } });
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'customer.subscription.updated', data: { object: { id, object: 'subscription', status } } });
    const t = Math.floor(clock / 1000);
    const sig = `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}`;
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': sig }, body: raw });
  };
  const checkouts = () => calls.filter((c) => c.path === '/v1/checkout/sessions');
  const trialEnded = () => calls.filter((c) => c.method === 'POST' && c.path.startsWith('/v1/subscriptions/') && c.form.trial_end === 'now');
  // Many hours as five-hour runs side by side, under the 8-hour run ceiling.
  const spend = async (hours: number, from: number) => {
    const n = Math.ceil(hours / 5);
    for (let i = 0; i < n; i += 1) await start(from + i);
    clock += 5 * HOUR;
    for (let i = 0; i < n; i += 1) await finish(from + i);
  };
  return { call, me, start, finish, stripeSays, checkouts, trialEnded, spend, now: () => clock };
}

describe('the trial', () => {
  it('is 7 days and 50 hours, the same on every plan', () => {
    expect(PLAN_TRIAL).toEqual({ days: 7, hours: 50 });
  });

  for (const plan of ['pro', 'plus', 'max']) {
    it(`checks out ${plan} with 7 free days for someone who never had a subscription`, async () => {
      const { call, checkouts, now } = setup();
      await call('POST', '/v1/checkout', { plan });
      expect(checkouts()[0].form['subscription_data[trial_end]']).toBe(String(Math.floor((now() + 7 * DAY) / 1000)));
    });
  }

  it('is offered on /v1/me before any subscription, and not after one', async () => {
    const { me, stripeSays } = setup();
    expect((await me()).trialOffer).toEqual({ days: 7, hours: 50 });
    await stripeSays('sub_1', 'trialing', 'plus');
    expect((await me()).trialOffer).toBeUndefined();
  });

  it('is given once: someone whose subscription ended checks out with no free days', async () => {
    const { call, me, stripeSays, checkouts } = setup();
    await me();
    await stripeSays('sub_1', 'canceled', 'pro');
    await call('POST', '/v1/checkout', { plan: 'max' });
    expect(checkouts()[0].form['subscription_data[trial_end]']).toBeUndefined();
    expect((await me()).trialOffer).toBeUndefined();
  });

  it('runs as the plan, on 50 hours whichever plan it is', async () => {
    const { me, stripeSays, start } = setup();
    await me();
    await stripeSays('sub_1', 'trialing', 'max');
    expect((await start(1)).body.ok).toBe(true);
    expect(await me()).toMatchObject({ plan: 'max', trial: { hours: 50, usedSeconds: 0 } });
  });

  it('just under 50 hours a run starts; at 50 it is refused, saying how to start the plan', async () => {
    const { me, stripeSays, spend, start } = setup();
    await me();
    await stripeSays('sub_1', 'trialing', 'plus');
    await spend(45, 100);
    expect((await start(1)).body.ok).toBe(true);
    await spend(5, 200);
    const refused = await start(2);
    expect(refused.body).toMatchObject({ ok: false, error: 'hours' });
    expect(refused.body.message).toBe('Your 50 trial hours are used. Start Plus now for its 1,200 hours a month.');
  });

  // Stripe turns a trial whose first charge fails past_due, and past_due counts as paying.
  it('whose first charge fails stays on the trial\'s hours, while a renewal\'s retry keeps the month', async () => {
    const { me, stripeSays, spend, start } = setup();
    await me();
    await stripeSays('sub_1', 'trialing', 'max');
    await spend(50, 100);
    await stripeSays('sub_1', 'past_due', 'max');
    expect((await start(1)).body).toMatchObject({ ok: false, error: 'hours' });
    expect((await me()).trial).toEqual({ hours: 50, usedSeconds: 50 * 3600 });
    await stripeSays('sub_1', 'active', 'max');
    await stripeSays('sub_1', 'past_due', 'max');
    expect((await start(2)).body.ok).toBe(true);
    expect((await me()).trial).toBeUndefined();
  });
});

describe('starting the plan now', () => {
  it('ends the trial on Stripe, which charges at once, and the month\'s hours open with no page to visit', async () => {
    const { call, me, stripeSays, spend, start, trialEnded, checkouts } = setup();
    await me();
    await stripeSays('sub_1', 'trialing', 'pro');
    await spend(50, 100);
    expect((await call('POST', '/v1/checkout', { plan: 'pro' })).body).toEqual({ where: 'started' });
    expect(trialEnded()).toHaveLength(1);
    expect(checkouts()).toEqual([]);
    expect((await start(1)).body.ok).toBe(true);
    expect((await me()).trial).toBeUndefined();
  });

  it('with a card that declines, opens the billing page and stays on the trial\'s hours', async () => {
    const { call, me, stripeSays, spend, start } = setup({ cardDeclines: true });
    await me();
    await stripeSays('sub_1', 'trialing', 'pro');
    await spend(50, 100);
    expect((await call('POST', '/v1/checkout', { plan: 'pro' })).body).toEqual({ url: 'https://billing.stripe.com/p/session/test_1', where: 'billing' });
    expect((await start(1)).body).toMatchObject({ ok: false, error: 'hours' });
  });

  it('is only for a plan in its trial: a paying plan still goes to the billing page', async () => {
    const { call, me, stripeSays, trialEnded } = setup();
    await me();
    await stripeSays('sub_1', 'active', 'pro');
    expect((await call('POST', '/v1/checkout', { plan: 'pro' })).body.where).toBe('billing');
    expect(trialEnded()).toEqual([]);
  });
});

describe('no plan limits how many run at once', () => {
  it('every plan is unlimited at once, its hours the only limit', async () => {
    for (const p of ['pro', 'plus', 'max'] as const) expect(PLANS[p].unlimited).toBe(true);
    const { me, stripeSays, start } = setup();
    await me();
    await stripeSays('sub_1', 'active', 'pro');
    for (let i = 1; i <= 11; i += 1) expect((await start(i)).body.ok).toBe(true);
    expect(await me()).toMatchObject({ unlimited: true, agents: null, running: 11 });
  });
});

describe('the app', () => {
  const none = { signedIn: true, plan: 'none' as const, trialOffer: { days: 7, hours: 50 } };

  // The cards had seven lines each; the owner found them "very, very cluttered".
  it('each card is its price, its hours and one button to try it', () => {
    expect(planCards(none).map((c) => [c.id, c.price, c.hours, c.button])).toEqual([
      ['pro', '$40', '400 hours a month', 'Try Pro free'],
      ['plus', '$100', '1,200 hours a month', 'Try Plus free'],
      ['max', '$200', '3,000 hours a month', 'Try Max free'],
    ]);
  });

  it('offers no free week when the server offers none, or to someone already paying', () => {
    expect(planCards({ signedIn: true, plan: 'none' }).map((c) => c.button)).toEqual(['Choose Pro', 'Choose Plus', 'Choose Max']);
    expect(planCards({ ...none, plan: 'pro', billing: 'stripe' }).map((c) => c.button)).toEqual([null, 'Switch to Plus', 'Switch to Max']);
  });

  const inTrial = (usedHours: number) => ({ signedIn: true, ...cloudPlanOf({ plan: 'plus', unlimited: true, agents: null, hoursPerMonth: 1200, running: 1, usedSeconds: 0, billing: 'stripe', trial: { hours: 50, usedSeconds: usedHours * 3600 } }) });

  it('a plan in its trial says so once, with its hours left and a way to start now', () => {
    expect(planSummary(inTrial(30))).toMatchObject({ name: 'Agentbox Cloud Plus', price: 'Free trial', who: 'then $100 a month', period: 'Your trial', start: 'Start Plus now', hours: { label: 'Trial hours left', line: '20 of 50' } });
    expect(planSummary({ signedIn: true, plan: 'plus', unlimited: true, agents: null, hoursPerMonth: 1200, running: 1, usedSeconds: 0, billing: 'stripe' })?.start).toBeNull();
  });

  it('with every trial hour used, says so beside the button that starts the plan', () => {
    expect(planSummary(inTrial(50))).toMatchObject({ price: 'Free trial', who: 'Your 50 trial hours are used', start: 'Start Plus now', hours: { line: '0 of 50' } });
  });

  it('once the trial\'s hours are used and threads wait, the list offers to start the plan now', () => {
    const cloud = { setUp: true, offered: true, managed: true, mode: 'full', noRoom: { error: 'hours', message: null } } as never;
    expect(cloudOffer({ cloud, plan: inTrial(50), waiting: 2, macFull: false })).toEqual({
      say: 'Your 50 trial hours are used.', waiting: '2 threads are waiting.', go: { label: 'Start Plus now · 1,200 hours a month', act: 'pay', plan: 'plus' },
    });
  });
});
