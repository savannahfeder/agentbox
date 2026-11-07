// EVERY NEW CLOUD ACCOUNT GETS FIVE FREE HOURS, ONCE.
//
// Until 2026-11-06 an account with no plan ran nothing in the cloud (the
// owner's call of 2026-10-20). For the cloud launch on 2026-11-12 the owner
// asked for 5 free hours on every new account, so someone can see a cloud run
// before paying. Two agents at once, so the hours last more than half an hour.
// Measured on the stand-in gateway below: before this change the first start
// with no plan was refused with error 'plan'.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { FREE, PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudPlanOf } from '../main/cloud/account.mts';
import { setupStep } from '../renderer/src/cloud-setup-step.ts';
import { cloudBilling, cloudOffer, planCards, planSummary } from '../renderer/src/cloud-upgrade.ts';

const A = '11111111-1111-4111-8111-111111111111';
const HOUR = 60 * 60_000;
const SET = { ...PLANS, pro: { agents: 10, hoursPerMonth: 100, dollarsPerMonth: 40 } };

function setup() {
  let clock = Date.UTC(2026, 10, 12, 12, 0, 0);
  const sent = [];
  const objects = memoryObjects();
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) { sent.push({ sessionId, payload }); return { ok: true }; },
      async stop(sessionId) { sent.push({ sessionId, stop: true }); },
    },
    links: { get: async (k) => `https://b/${k}`, put: async (k) => `https://b/${k}`, head: async (k) => `https://b/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => clock,
    plans: SET,
  });
  let key;
  const call = async (method, path, body) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}` }, body: body ? JSON.stringify(body) : '' });
  };
  const start = (n) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}` } });
  const poll = (n) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'events', runId: `r${n}`, since: 0 } });
  const finish = (n) => gw.objectCreated(`runs/u-${A}/r${n}/done.json`);
  const me = async () => (await call('GET', '/v1/me')).body;
  const stopped = () => sent.filter((s) => s.stop).map((s) => s.sessionId);
  return { gw, call, start, poll, finish, me, stopped, tick: (ms) => { clock += ms; } };
}

describe('the free hours', () => {
  it('are five, two agents at once', () => {
    expect(FREE).toEqual({ agents: 2, hours: 5 });
  });

  it('let a new account with no plan start a run', async () => {
    const { start, me } = setup();
    expect((await start(1)).body.ok).toBe(true);
    expect(await me()).toMatchObject({ plan: 'none', free: { agents: 2, hours: 5, usedSeconds: 0 }, running: 1 });
  });

  it('run two at once and refuse the third, saying why', async () => {
    const { start } = setup();
    expect((await start(1)).body.ok).toBe(true);
    expect((await start(2)).body.ok).toBe(true);
    const third = await start(3);
    expect(third.body).toMatchObject({ ok: false, error: 'agents' });
    expect(third.body.message).toMatch(/free/);
  });

  it('are spent once, not each month', async () => {
    const { start, finish, tick, me } = setup();
    await start(1);
    tick(HOUR);
    await finish(1);
    const after = await me();
    expect(after.free.usedSeconds).toBe(3600);
    expect(after.usedSeconds).toBe(0);
    tick(20 * 24 * HOUR);
    expect((await me()).month).toBe('2026-12');
    expect((await me()).free.usedSeconds).toBe(3600);
  });

  it('just under five hours, a run still starts; at five, it is refused and asks for a plan', async () => {
    const { start, finish, tick, me } = setup();
    await start(1);
    tick(5 * HOUR - 60_000);
    await finish(1);
    expect((await start(2)).body.ok).toBe(true);
    tick(60_000);
    await finish(2);
    const refused = await start(3);
    expect(refused.body).toMatchObject({ ok: false, error: 'plan' });
    expect(refused.body.message).toMatch(/5 free cloud hours are used/);
    const now = await me();
    expect(now.plan).toBe('none');
    expect(now.free.usedSeconds).toBe(5 * 3600);
  });

  it('that run out while runs are going end those runs at the next call', async () => {
    const { start, poll, tick, stopped, me } = setup();
    await start(1); await start(2);
    tick(2.5 * HOUR + 60_000);
    await poll(1);
    expect(stopped()).toEqual(expect.arrayContaining([`u-${A}-run-1`, `u-${A}-run-2`]));
    expect((await me()).running).toBe(0);
  });

  it('are not touched on a paid plan, whose time counts against its month', async () => {
    const { gw, start, finish, tick, me } = setup();
    await me();
    await gw.admin({ do: 'plan', person: A, plan: 'pro' });
    await start(1);
    tick(HOUR);
    await finish(1);
    const after = await me();
    expect(after.plan).toBe('pro');
    expect(after.usedSeconds).toBe(3600);
    expect(after.free).toBeUndefined();
  });

  it('come back as no plan, not a gift, so nothing is billed or offered as a switch', async () => {
    const { me } = setup();
    expect((await me()).billing).toBeNull();
  });
});

describe('what the app makes of them', () => {
  const server = (over = {}) => ({ plan: 'none', unlimited: false, agents: 0, hoursPerMonth: 0, running: 0, usedSeconds: 0, ...over });

  it('free hours left read as the free plan, with its agents and hours', () => {
    expect(cloudPlanOf(server({ free: { agents: 2, hours: 5, usedSeconds: 3600 } }))).toMatchObject({ plan: 'free', agents: 2, hoursPerMonth: 5, usedSeconds: 3600 });
  });

  it('free hours spent read as no plan', () => {
    expect(cloudPlanOf(server({ free: { agents: 2, hours: 5, usedSeconds: 5 * 3600 } })).plan).toBe('none');
  });

  it('a paid plan, or a server with no free hours, is left as it said', () => {
    expect(cloudPlanOf(server({ plan: 'pro', agents: 10, hoursPerMonth: 400 })).plan).toBe('pro');
    expect(cloudPlanOf(server()).plan).toBe('none');
  });
});

describe('the screens, on the free hours', () => {
  const free = { signedIn: true, plan: 'free', unlimited: false, agents: 2, hoursPerMonth: 5, running: 1, usedSeconds: 5400, billing: null };

  it('the cloud setup goes straight to the Claude or Codex account, with nothing to pay first', () => {
    expect(setupStep({ managed: true, plan: free })).toBe('accounts');
    expect(setupStep({ managed: true, plan: { ...free, plan: 'none' } })).toBe('pay');
  });

  // The owner's note on the first picture: no separate free-hours section,
  // say the hours left, and the plan is Free, not Agentbox Cloud.
  it('Settings shows the Free plan like any plan, with the hours left out of five', () => {
    expect(planSummary(free)).toMatchObject({
      name: 'Free', price: '$0', who: '5 cloud hours to try it', manage: false,
      period: 'Usage', change: 'Change plan',
      agents: { line: '1 of 2 running', percent: 50 },
      hours: { label: 'Hours left', line: '3.5 of 5', percent: 70 },
    });
  });

  it('every free hour used leaves none, never a negative', () => {
    expect(planSummary({ ...free, usedSeconds: 5 * 3600 }).hours).toMatchObject({ line: '0 of 5', percent: 0 });
    expect(planSummary({ ...free, usedSeconds: 6 * 3600 }).hours).toMatchObject({ line: '0 of 5', percent: 0 });
  });

  it('every paid plan is a plan to choose, none marked as yours, with no billing row', () => {
    expect(planCards(free).map((c) => [c.button, c.current])).toEqual([['Choose Pro', false], ['Choose Plus', false], ['Choose Max', false]]);
    expect(cloudBilling(free)).toEqual({ row: false, says: null });
  });

  it('both free agents busy offers Pro', () => {
    const offer = cloudOffer({ cloud: { setUp: true, offered: true, managed: true, mode: 'cloud', noRoom: { error: 'agents' } }, plan: free, waiting: 2, macFull: true });
    expect(offer).toMatchObject({ say: 'Both free cloud agents are running.', go: { act: 'pay', plan: 'pro' } });
  });

  it('a paid plan reads as it did', () => {
    expect(planSummary({ ...free, plan: 'pro', agents: 10, hoursPerMonth: 400, billing: 'stripe' })).toMatchObject({ name: 'Agentbox Cloud Pro', period: 'This month', change: 'Change plan' });
  });
});
