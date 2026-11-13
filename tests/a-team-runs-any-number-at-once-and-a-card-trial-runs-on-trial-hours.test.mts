// A TEAM RUNS ANY NUMBER OF CLOUD AGENTS AT ONCE, AND A CARD TRIAL RUNS ON
// TRIAL HOURS UNTIL ITS FIRST CHARGE CLEARS (2026-11-13).
//
// The founder: "There should never be a limit on how many cloud agents a team
// can use at once because that almost completely defeats the point of cloud",
// and for the trial, "just say that during the trial the maximum your team can
// use is n hours". The server held a trial member to 2 at once and a seat to
// 10. And a team that added its card in the trial was `trialing`, which counted
// as paying, so it got a seat's 400 hours a member for 7 days without being
// charged, then could cancel: measured on stand-ins, `trialing` gave
// `seats: 2, hours: 400`. Now the hours are the only limit, and a trialing
// team keeps the trial's hours until Stripe says it is active.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM, FREE } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { cloudPlanOf } from '../main/cloud/account.mts';
import { planKey } from '../renderer/src/cloud-upgrade.ts';
import { TeamBilling } from '../renderer/src/team/TeamBilling.tsx';
import { SETUP_PLANS, PRO_PITCH } from '../renderer/src/setup-split.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'whsec_test_secret';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const MADE = Date.UTC(2026, 10, 17, 9);
const TRIAL_ENDS = MADE + TEAM.trialDays * DAY;
const MANY = 30;

function setup({ onTeam = true } = {}) {
  let clock = MADE + HOUR;
  const objects = memoryObjects();
  const subs = new Map<string, unknown>();
  const fetchImpl = async (url: string) => {
    const u = new URL(url);
    const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    const m = /^\/v1\/subscriptions\/(.+)$/.exec(u.pathname);
    if (m) return subs.has(m[1]) ? json(200, subs.get(m[1])) : json(404, { error: { message: 'No such subscription' } });
    return json(404, { error: { message: 'not faked' } });
  };
  const team = { id: 'team-1', createdAt: MADE, members: onTeam ? [A, B] : [], owners: [A] };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (k: string) => `https://b/${k}`, head: async (k: string) => `https://b/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t: string) => ({ 'session-a': { id: A }, 'session-b': { id: B } } as Record<string, { id: string }>)[t] ?? null,
    teams: async (p: string) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: SECRET, fetchImpl }),
    now: () => clock,
    plans: PLANS,
  });
  const keys: Record<string, string> = {};
  const as = (who: string) => {
    const token = who === A ? 'session-a' : 'session-b';
    const call = async (method: string, path: string, body?: unknown) => {
      keys[who] ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
      return gw.handle({ method, path, headers: { authorization: `Bearer ${keys[who]}` }, body: body ? JSON.stringify(body) : '' });
    };
    return {
      start: (n: number) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}` } }),
      finish: (n: number) => gw.objectCreated(`runs/u-${who}/r${n}/done.json`),
      me: async () => (await call('GET', '/v1/me')).body,
    };
  };
  const webhook = (status: string) => {
    const id = 'sub_team';
    subs.set(id, {
      id, object: 'subscription', status, customer: 'cus_team', metadata: { team: 'team-1', person: A },
      items: { data: [{ quantity: 2, price: { id: 'price_team', lookup_key: 'agentbox_cloud_team_monthly' } }] },
    });
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'customer.subscription.updated', data: { object: { id, object: 'subscription', status } } });
    const t = Math.floor(clock / 1000);
    const sig = `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}`;
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': sig }, body: raw });
  };
  const startMany = async (who: string) => {
    const p = as(who);
    const out = [];
    for (let i = 1; i <= MANY; i += 1) out.push((await p.start(i)).body);
    return out;
  };
  return { as, webhook, startMany, tick: (ms: number) => { clock += ms; } };
}

describe('a team runs any number of cloud agents at once', () => {
  it('in its trial', async () => {
    const { startMany } = setup();
    expect((await startMany(A)).every((b) => b.ok)).toBe(true);
  });

  it('on paid seats', async () => {
    const { startMany, webhook, tick } = setup();
    await webhook('trialing');
    tick(TRIAL_ENDS - MADE);
    await webhook('active');
    expect((await startMany(B)).every((b) => b.ok)).toBe(true);
  });

  it('and says it has no limit at once, so no screen draws one', async () => {
    const { as } = setup();
    const me = await as(A).me();
    expect(me.team.agents).toBeNull();
    expect(cloudPlanOf(me)).toMatchObject({ plan: 'team', unlimited: true, agents: null });
  });

  it('someone with no team still runs two free agents at once', async () => {
    const { startMany } = setup({ onTeam: false });
    const out = await startMany(A);
    expect(out.filter((b) => b.ok)).toHaveLength(FREE.agents);
    expect(out[FREE.agents]).toMatchObject({ ok: false, error: 'agents' });
  });
});

describe('a team that adds its card in the trial', () => {
  it("runs on the trial's hours, not a seat's, until it is charged", async () => {
    const { as, webhook } = setup();
    await webhook('trialing');
    expect((await as(B).me()).team).toMatchObject({ trial: true, seats: 2, hours: TEAM.trialHoursPerMember });
  });

  it('is held to them, and told the seats come when the trial ends', async () => {
    const { as, webhook, tick } = setup();
    await webhook('trialing');
    const b = as(B);
    // Five-hour runs side by side, each under the 8-hour run ceiling.
    const runs = Array.from({ length: TEAM.trialHoursPerMember / 5 }, (_, i) => i + 1);
    for (const n of runs) await b.start(n);
    tick(5 * HOUR + 60_000);
    for (const n of runs) await b.finish(n);
    const next = (await b.start(100)).body;
    expect(next).toMatchObject({ ok: false, error: 'hours' });
    expect(next.message).toBe(`Your ${TEAM.trialHoursPerMember} trial hours are used. Your team's ${TEAM.hoursPerSeat} hours each start when the trial ends.`);
  });

  it("gets a seat's hours once its first charge clears", async () => {
    const { as, webhook, tick } = setup();
    await webhook('trialing');
    tick(TRIAL_ENDS - MADE);
    await webhook('active');
    expect((await as(B).me()).team).toMatchObject({ trial: false, seats: 2, hours: TEAM.hoursPerSeat });
  });

  it("keeps the trial's hours if Stripe is late to charge after the free days", async () => {
    const { as, webhook, tick } = setup();
    await webhook('trialing');
    tick(TRIAL_ENDS - MADE + HOUR);
    expect((await as(B).me()).team).toMatchObject({ trial: true, seats: 2, hours: TEAM.trialHoursPerMember });
  });
});

describe('what the screens say', () => {
  const NOW = MADE + 5 * DAY;
  const people = [{ id: A, usedSeconds: 4.2 * 3600, running: 1 }, { id: B, usedSeconds: 0, running: 0 }];
  const names = [
    { id: A, name: 'Sam Rivera', email: 's@example.com', avatarUrl: null, role: 'owner' },
    { id: B, name: 'Priya Natarajan', email: 'p@example.com', avatarUrl: null, role: 'member' },
  ];
  const trial = { trial: true, endsAt: TRIAL_ENDS, seats: 0, members: 2, owner: true, agents: null, running: 1, hours: TEAM.trialHoursPerMember, usedSeconds: 4.2 * 3600, people };
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
  const page = (team: typeof trial | (typeof trial & { seats: number })) => text(renderToStaticMarkup(React.createElement(TeamBilling, { team, people: names, meId: A, billing: null, now: NOW } as never)));

  it('Plan and Billing names no limit at once, in the trial or after it', () => {
    const t = page(trial);
    expect(t).not.toMatch(/\d+ agents at once/);
    expect(t).toContain('Any number at once');
    expect(page({ ...trial, trial: false, endsAt: null, seats: 2, hours: TEAM.hoursPerSeat })).not.toMatch(/\d+ agents at once/);
  });

  it('a trial with its card in offers Manage billing, not paying again', () => {
    const t = page({ ...trial, seats: 2 });
    expect(t).toContain("days left in your team's trial");
    expect(t).toContain('Manage billing');
    expect(t).not.toContain('Pay for');
  });

  it('adding the card in the trial counts as a change, so the page stops waiting once it lands', () => {
    const seen = (team: object) => ({ signedIn: true, ...cloudPlanOf({ plan: 'none', agents: 0, hoursPerMonth: 0, running: 0, usedSeconds: 0, team }) });
    expect(planKey(seen(trial))).not.toBe(planKey(seen({ ...trial, seats: 2 })));
  });

  // The founder, on the purchase page: it "doesn't tell me how many cloud hours I
  // get", "these actually don't say how much Pro normally costs", "anything on the
  // right side gets ignored". The free week and the paid month now sit side by side
  // on the left, and the trial is 50 hours, not 10 ("10 cloud hours for pro is very
  // bad given free is 5. should be more like 50").
  it('the purchase page shows the free week beside the paid month, on the left', () => {
    const pro = SETUP_PLANS.find((p) => p.id === 'pro')!;
    expect(pro.sub).not.toMatch(/\d+ cloud agents at once/);
    expect(TEAM.trialHoursPerMember).toBe(50);
    expect(PRO_PITCH.trial).toEqual({ label: 'First 7 days', price: 'Free', line: '50 cloud hours to try' });
    expect(PRO_PITCH.paid).toEqual({ label: 'Then', price: '$40', per: 'a month', line: '400 cloud hours a month' });
    expect(PRO_PITCH.terms).toBe('Cancel any time.');
    const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
    expect(split).toMatch(/PRO_PITCH\.trial/);
    expect(split).toMatch(/PRO_PITCH\.paid/);
  });
});
