// EVERY CLOUD PLAN STARTS WITH 7 DAYS FREE, ONCE, ON HOURS THAT GROW WITH THE PLAN.
//
// The owner, 2026-11-16, on the first round of trial designs: "any of those
// plans should give you 7 days free", with the worry that one trial for every
// plan would "disincentivize people from using the more expensive plans". So
// Pro, Plus and Max each check out with 7 free days, and the trial's hours are
// an eighth of the plan's month: 50, 150 and 375. Measured on a stand-in
// Stripe below: before this change Plus and Max checked out with no trial, and
// a trialing subscription got the plan's whole month of hours.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, PLAN_TRIAL } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { cloudPlanOf } from '../main/cloud/account.mts';
import { planCards, planSummary } from '../renderer/src/cloud-upgrade.ts';

const A = '11111111-1111-4111-8111-111111111111';
const SECRET = 'whsec_test_secret';
const HOST = 'gw.example.on.aws';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 10, 16, 12, 0, 0);

function setup() {
  let clock = START;
  const calls: Array<{ path: string; form: Record<string, string> }> = [];
  const subs = new Map<string, unknown>();
  const prices: Record<string, string> = { agentbox_cloud_pro_monthly: 'price_pro', agentbox_cloud_plus_monthly: 'price_plus', agentbox_cloud_max_monthly: 'price_max' };
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const u = new URL(url);
    const form = init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams;
    calls.push({ path: u.pathname, form: Object.fromEntries(form) });
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === '/v1/prices') { const id = prices[form.get('lookup_keys[0]') ?? '']; return json(200, { data: id ? [{ id }] : [] }); }
    if (u.pathname === '/v1/checkout/sessions') return json(200, { id: `cs_${calls.length}`, url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    if (u.pathname.startsWith('/v1/checkout/sessions/')) return json(200, { status: 'expired' });
    if (u.pathname === '/v1/billing_portal/sessions') return json(200, { url: 'https://billing.stripe.com/p/session/test_1' });
    const m = /^\/v1\/subscriptions\/(.+)$/.exec(u.pathname);
    if (m) return subs.has(m[1]) ? json(200, subs.get(m[1])) : json(404, { error: { message: 'No such subscription' } });
    return json(404, { error: { message: 'not faked' } });
  };
  const sent: string[] = [];
  const gw = createGateway({
    agentcore: { invoke: async (sid) => { sent.push(sid); return { ok: true }; }, stop: async () => {} },
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
    subs.set(id, { id, object: 'subscription', status, customer: 'cus_1', metadata: { person: A }, items: { data: [{ price: { id: `price_${plan}`, lookup_key: `agentbox_cloud_${plan}_monthly` } }] } });
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'customer.subscription.updated', data: { object: { id, object: 'subscription', status } } });
    const t = Math.floor(clock / 1000);
    const sig = `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}`;
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': sig }, body: raw });
  };
  const checkouts = () => calls.filter((c) => c.path === '/v1/checkout/sessions');
  // A day's runs as five-hour runs side by side, under the 8-hour run ceiling.
  const spend = async (hours: number, from: number) => {
    const n = Math.ceil(hours / 5);
    for (let i = 0; i < n; i += 1) await start(from + i);
    clock += 5 * HOUR;
    for (let i = 0; i < n; i += 1) await finish(from + i);
  };
  return { call, me, start, finish, stripeSays, checkouts, spend, sent, tick: (ms: number) => { clock += ms; }, now: () => clock };
}

describe('the trial on every plan', () => {
  it('is 7 days, and its hours are an eighth of each plan\'s month', () => {
    expect(PLAN_TRIAL.days).toBe(7);
    expect(PLAN_TRIAL.hours).toEqual({ pro: 50, plus: 150, max: 375 });
    for (const p of ['pro', 'plus', 'max'] as const) expect(PLAN_TRIAL.hours[p]).toBe(PLANS[p].hoursPerMonth / 8);
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
    expect((await me()).trialOffer).toEqual({ days: 7, hours: { pro: 50, plus: 150, max: 375 } });
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
});

describe('a plan in its trial', () => {
  it('runs as the plan, with the trial\'s hours rather than the month\'s', async () => {
    const { me, stripeSays, start } = setup();
    await me();
    await stripeSays('sub_1', 'trialing', 'plus');
    expect((await start(1)).body.ok).toBe(true);
    expect(await me()).toMatchObject({ plan: 'plus', agents: 25, trial: { hours: 150, usedSeconds: 0 } });
  });

  it('just under its hours a run starts; at them it is refused, saying the month\'s hours come after', async () => {
    const { me, stripeSays, spend, start } = setup();
    await me();
    await stripeSays('sub_1', 'trialing', 'pro');
    await spend(45, 100);
    expect((await start(1)).body.ok).toBe(true);
    await spend(5, 200);
    const refused = await start(2);
    expect(refused.body).toMatchObject({ ok: false, error: 'hours' });
    expect(refused.body.message).toBe("Your 50 trial hours are used. Pro's 400 hours a month start when the trial ends.");
  });

  // Stripe turns a trial whose first charge fails past_due, and past_due counts as
  // paying: without this, a card that never paid would get Max's 3,000 hours.
  it('whose first charge fails stays on the trial\'s hours, while a renewal\'s retry keeps the month', async () => {
    const { me, stripeSays, spend, start } = setup();
    await me();
    await stripeSays('sub_1', 'trialing', 'max');
    await spend(375, 100);
    await stripeSays('sub_1', 'past_due', 'max');
    expect((await start(1)).body).toMatchObject({ ok: false, error: 'hours' });
    expect((await me()).trial).toEqual({ hours: 375, usedSeconds: 375 * 3600 });
    await stripeSays('sub_1', 'active', 'max');
    await stripeSays('sub_1', 'past_due', 'max');
    expect((await start(2)).body.ok).toBe(true);
    expect((await me()).trial).toBeUndefined();
  });

  it('once paid, has the whole month, and the trial no longer shows', async () => {
    const { me, stripeSays, spend, start } = setup();
    await me();
    await stripeSays('sub_1', 'trialing', 'pro');
    await spend(50, 100);
    await stripeSays('sub_1', 'active', 'pro');
    expect((await start(1)).body.ok).toBe(true);
    expect((await me()).trial).toBeUndefined();
  });
});

describe('the app', () => {
  const none = { signedIn: true, plan: 'none' as const, trialOffer: { days: 7, hours: { pro: 50, plus: 150, max: 375 } } };

  // The cards had seven lines each; the owner found them "very, very cluttered".
  it('each card is its price, agents and hours, with the free week\'s hours on its button', () => {
    expect(planCards(none).map((c) => [c.id, c.agents, c.hours, c.button])).toEqual([
      ['pro', '10 agents', '400 hours a month', 'Try free · 50 hours'],
      ['plus', '25 agents', '1,200 hours a month', 'Try free · 150 hours'],
      ['max', 'Unlimited agents', '3,000 hours a month', 'Try free · 375 hours'],
    ]);
  });

  it('offers no free week when the server offers none, or to someone already paying', () => {
    expect(planCards({ signedIn: true, plan: 'none' }).map((c) => c.button)).toEqual(['Choose Pro', 'Choose Plus', 'Choose Max']);
    expect(planCards({ ...none, plan: 'pro', billing: 'stripe' }).map((c) => c.button)).toEqual([null, 'Switch to Plus', 'Switch to Max']);
  });

  it('a plan in its trial says so once, with the trial\'s hours left', () => {
    const plan = { signedIn: true, ...cloudPlanOf({ plan: 'plus', agents: 25, hoursPerMonth: 1200, running: 1, usedSeconds: 0, billing: 'stripe', trial: { hours: 150, usedSeconds: 30 * 3600 } }) };
    expect(planSummary(plan)).toMatchObject({ name: 'Agentbox Cloud Plus', price: 'Free trial', who: 'then $100 a month', period: 'Your trial', hours: { label: 'Trial hours left', line: '120 of 150' } });
  });
});
