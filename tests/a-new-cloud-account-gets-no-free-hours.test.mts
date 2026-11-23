// A NEW CLOUD ACCOUNT GETS NO FREE HOURS.
//
// From 2026-11-06 every account had 5 free cloud hours, two agents at once.
// On 2026-11-16 the owner asked to "get rid of 5 free hours per free account,
// instead we encourage ppl to try the paid trial"
// (tests/every-cloud-plan-starts-with-7-days-free). Measured on the stand-in gateway below: before this change a new
// account with no plan started a run and /v1/me carried `free`, and the app
// drew a Free plan with 5 hours on Settings › Plan and Billing.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import * as planFile from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudPlanOf } from '../main/cloud/account.mts';
import { setupStep } from '../renderer/src/cloud-setup-step.ts';
import { cloudOffer, planSummary } from '../renderer/src/cloud-upgrade.ts';
import { PRO_PITCH } from '../renderer/src/setup-split.ts';

const A = '11111111-1111-4111-8111-111111111111';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const SET = { ...planFile.PLANS, pro: { agents: 10, hoursPerMonth: 100, dollarsPerMonth: 40 } };

function setup({ team = null as null | { createdAt: number } } = {}) {
  let clock = Date.UTC(2026, 10, 16, 12, 0, 0);
  const sent: Array<{ sessionId: string; payload?: unknown; stop?: boolean }> = [];
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
    teams: async (person) => (team && person === A ? { id: 'team-1', createdAt: team.createdAt, members: [A], owners: [A] } : null),
    now: () => clock,
    plans: SET,
  });
  let key: string | undefined;
  const call = async (method: string, path: string, body?: unknown) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}` }, body: body ? JSON.stringify(body) : '' });
  };
  const start = (n: number) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}` } });
  const me = async () => (await call('GET', '/v1/me')).body;
  return { gw, objects, call, start, me, sent, now: () => clock, tick: (ms: number) => { clock += ms; } };
}

describe('the cloud server, for an account with no plan and no team', () => {
  it('has no free hours to give', () => {
    expect('FREE' in planFile).toBe(false);
  });

  it('refuses the first run and starts nothing', async () => {
    const { start, sent } = setup();
    const r = await start(1);
    expect(r.body).toMatchObject({ ok: false, error: 'plan', message: 'Choose a cloud plan to run agents there.' });
    expect(sent.filter((s) => !s.stop)).toEqual([]);
  });

  it('says no plan and no free hours on /v1/me', async () => {
    const { me } = setup();
    const body = await me();
    expect(body).toMatchObject({ plan: 'none', agents: 0, hoursPerMonth: 0, running: 0 });
    expect(body.free).toBeUndefined();
  });

  it('gives no upload link for a run, and no room to the phone', async () => {
    const { gw, call } = setup();
    expect((await call('POST', '/v1/link', { op: 'put', key: 'runs/r9/in.bundle', seconds: 600 })).body).toMatchObject({ error: 'plan' });
    expect(await gw.room(A)).toMatchObject({ ok: false, error: 'plan' });
  });

  it('still lets Claude or Codex sign in, so the cloud is ready once the trial starts', async () => {
    const { call, sent } = setup();
    const r = await call('POST', '/v1/invoke', { sessionId: 'agentbox-signin-claude-s1', payload: { action: 'signin', runId: 's1', engine: 'claude', saveUrl: 'agentbox-login:logins/claude/s1.json' } });
    expect(r.body.ok).toBe(true);
    expect(sent.map((s) => (s.payload as { action?: string })?.action)).toEqual(['signin']);
  });

  // A run the free hours started before this shipped must not carry on for nothing.
  it('ends a run the free hours started before, at the next call', async () => {
    const { objects, call, me, sent, now } = setup();
    await me();
    const at = `ledger/people/${A}.json`;
    const rec = JSON.parse((await objects.get(at))!.body);
    rec.live = { 'run-1': { kind: 'run', runId: 'r1', at: now() - HOUR, nonce: 'n1', free: true } };
    await objects.put(at, JSON.stringify(rec));
    await call('POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'events', runId: 'r1', since: 0 } });
    expect(sent.filter((s) => s.stop).map((s) => s.sessionId)).toEqual([`u-${A}-run-1`]);
    expect((await me()).running).toBe(0);
  });
});

describe('the trial a team starts', () => {
  // Until 2026-11-21 it ran from the day the team was made, with no card.
  it('runs nothing without a card, and offers its free week for when the card goes in', async () => {
    const { start, me } = setup({ team: { createdAt: Date.UTC(2026, 10, 16, 11, 0, 0) } });
    expect((await start(1)).body).toMatchObject({ ok: false, error: 'plan' });
    expect((await me()).team).toBeUndefined();
    expect((await me()).teamFreeDays).toBe(planFile.TEAM.trialDays);
  });

  it('ends after its 7 days with nothing free to fall back to', async () => {
    const { start, tick } = setup({ team: { createdAt: Date.UTC(2026, 10, 16, 11, 0, 0) } });
    tick(7 * DAY);
    expect((await start(1)).body).toMatchObject({ ok: false, error: 'plan' });
  });
});

describe('the app', () => {
  const server = (over = {}) => ({ plan: 'none', unlimited: false, agents: 0, hoursPerMonth: 0, running: 0, usedSeconds: 0, ...over });

  it('reads free hours from a server before this change as no plan', () => {
    expect(cloudPlanOf(server({ free: { agents: 2, hours: 5, usedSeconds: 0 } })).plan).toBe('none');
    expect(cloudPlanOf(server()).plan).toBe('none');
  });

  it('a team still reads as the team, and a paid plan as itself', () => {
    expect(cloudPlanOf(server({ team: { hours: 50, usedSeconds: 0, running: 0 } })).plan).toBe('team');
    expect(cloudPlanOf(server({ plan: 'pro', agents: 10, hoursPerMonth: 400 })).plan).toBe('pro');
  });

  it('the cloud setup asks for a plan before any Claude or Codex account', () => {
    expect(setupStep({ managed: true, plan: { signedIn: true, plan: 'none' } })).toBe('pay');
  });

  it('Plan and Billing has no Free plan to summarise, so it shows the plans', () => {
    expect(planSummary({ signedIn: true, ...server() } as never)).toBeNull();
  });

  // Each plan's own free week is tests/every-cloud-plan-starts-with-7-days-free.
  it('the setup\'s Pro page still offers its free week', () => {
    expect(PRO_PITCH.cta).toBe('Try Pro free for 7 days');
    expect(PRO_PITCH.trial).toEqual({ label: 'First 7 days', price: 'Free', line: '50 cloud hours to try' });
  });

  it('no longer offers a move from free agents, which no longer exist', () => {
    const offer = cloudOffer({ cloud: { setUp: true, offered: true, managed: true, mode: 'cloud', noRoom: { error: 'agents', message: null } } as never, plan: { signedIn: true, plan: 'none' }, waiting: 2, macFull: false });
    expect(offer).toBeNull();
  });
});
