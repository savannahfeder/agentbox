// EACH TEAM MEMBER HAS CLOUD HOURS OF THEIR OWN: a 14-day trial, then $40 a seat.
//
// The owner's plan for the multiplayer launch: every team gets 14 days free,
// each member with 10 cloud hours and 2 agents at once of their own; then $40
// a member a month, each seat the same as the $40 cloud plan, 400 hours and 10
// agents at once (2026-11-08, replacing one pool for the whole team: three
// power testers ran a shared pool dry and could not tell who had). A person's
// own paid plan comes first, then the team's, which replace their 5 free hours.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { supabaseRest, teamsFrom } from '../cloud/gateway/phone.mjs';
import { cloudPlanOf } from '../main/cloud/account.mts';
import { planKey, planSummary } from '../renderer/src/cloud-upgrade.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const MADE = Date.UTC(2026, 10, 17, 9, 0, 0);
const SET = { ...PLANS, pro: { agents: 10, hoursPerMonth: 100, dollarsPerMonth: 40 } };

function setup({ members = [A, B], owners = [A], madeAt = MADE, start = MADE + HOUR } = {}) {
  let clock = start;
  const sent = [];
  const objects = memoryObjects();
  const team = { id: 'team-1', createdAt: madeAt, members, owners };
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) { sent.push({ sessionId, payload }); return { ok: true }; },
      async stop(sessionId) { sent.push({ sessionId, stop: true }); },
    },
    links: { get: async (k) => `https://b/${k}`, put: async (k) => `https://b/${k}`, head: async (k) => `https://b/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t) => ({ 'session-a': { id: A }, 'session-b': { id: B }, 'session-c': { id: C } })[t] ?? null,
    teams: async (person) => (team.members.includes(person) ? team : null),
    now: () => clock,
    plans: SET,
  });
  const keys = {};
  const as = (who) => {
    const token = { [A]: 'session-a', [B]: 'session-b', [C]: 'session-c' }[who];
    const call = async (method, path, body) => {
      keys[who] ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
      return gw.handle({ method, path, headers: { authorization: `Bearer ${keys[who]}` }, body: body ? JSON.stringify(body) : '' });
    };
    return {
      call,
      start: (n) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}` } }),
      poll: (n) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'events', runId: `r${n}`, since: 0 } }),
      finish: (n) => gw.objectCreated(`runs/u-${who}/r${n}/done.json`),
      me: async () => (await call('GET', '/v1/me')).body,
    };
  };
  const stopped = () => sent.filter((s) => s.stop).map((s) => s.sessionId);
  return { gw, objects, team, as, stopped, tick: (ms) => { clock += ms; } };
}

describe('the trial', () => {
  it('is 14 days, 10 hours and 2 agents at once a member; a seat is 400 hours and 10 agents', () => {
    expect(TEAM).toMatchObject({ trialDays: 14, trialHoursPerMember: 10, trialAgentsPerMember: 2, hoursPerSeat: 400, agentsPerSeat: 10, dollarsPerSeat: 40 });
  });

  it('runs a member with no plan on their own trial hours, not on their free hours', async () => {
    const { as, tick } = setup();
    const a = as(A);
    expect((await a.start(1)).body.ok).toBe(true);
    tick(HOUR);
    await a.finish(1);
    const me = await a.me();
    expect(me.team).toMatchObject({ trial: true, hours: 10, agents: 2, usedSeconds: 3600, endsAt: MADE + 14 * DAY, owner: true });
    expect(me.free.usedSeconds).toBe(0);
  });

  it("one member spending all their hours leaves the other member's untouched", async () => {
    const { as, tick } = setup();
    const a = as(A); const b = as(B);
    await a.start(1); await a.start(6);
    tick(5 * HOUR);
    await a.finish(1); await a.finish(6);
    expect((await a.start(7)).body).toMatchObject({ ok: false, error: 'hours' });
    expect((await b.me()).team.usedSeconds).toBe(0);
    expect((await b.start(2)).body.ok).toBe(true);
  });

  it("every member's own use is on the page, theirs included", async () => {
    const { as, tick } = setup();
    const a = as(A); const b = as(B);
    await a.start(1); tick(2 * HOUR); await a.finish(1);
    await b.start(2); tick(HOUR); await b.finish(2);
    expect((await b.me()).team.people).toEqual([{ id: A, usedSeconds: 2 * 3600, running: 0 }, { id: B, usedSeconds: 3600, running: 0 }]);
  });

  // The trial replaces each member's 5 free hours (the owner's plan, 2026-11-06).
  // A power tester whose team ran out was moved to "Free, 5 of 5" without a word.
  it('spent, refuses the next run and says whose hours are used and who can pay, never falling to the free hours', async () => {
    const { as, tick } = setup();
    const a = as(A); const b = as(B);
    await a.start(1); await a.start(4); tick(5 * HOUR); await a.finish(1); await a.finish(4);
    const owner = await a.start(3);
    expect(owner.body).toMatchObject({ ok: false, error: 'hours' });
    expect(owner.body.message).toBe('Your 10 trial hours are used. Pay for the team on Plan and Billing to keep running agents there.');
    await b.start(5); await b.start(8); tick(5 * HOUR); await b.finish(5); await b.finish(8);
    expect((await b.start(9)).body.message).toMatch(/owner can pay/);
    expect((await a.me()).free.usedSeconds).toBe(0);
  });

  it('spent, gives no upload link for a run, and no room to the phone', async () => {
    const { gw, as, tick } = setup();
    const a = as(A);
    await a.start(1); await a.start(4); tick(5 * HOUR); await a.finish(1); await a.finish(4);
    expect((await a.call('POST', '/v1/link', { op: 'put', key: 'runs/r9/in.bundle', seconds: 600 })).status).toBe(403);
    expect(await gw.room(A)).toMatchObject({ ok: false, error: 'hours' });
  });

  it("ends after 14 days: back to each member's own free hours", async () => {
    const { as, tick } = setup();
    const a = as(A);
    tick(14 * DAY);
    expect((await a.start(1)).body.ok).toBe(true);
    tick(HOUR);
    await a.finish(1);
    const me = await a.me();
    expect(me.team).toBeUndefined();
    expect(me.free.usedSeconds).toBe(3600);
  });

  it('a day before the end, it still runs', async () => {
    const { as, tick } = setup();
    tick(13 * DAY);
    expect((await as(A).me()).team).toMatchObject({ trial: true });
  });

  it('runs two agents at once for each member, whatever the others run', async () => {
    const { as } = setup();
    const a = as(A); const b = as(B);
    expect((await a.start(1)).body.ok).toBe(true);
    expect((await a.start(2)).body.ok).toBe(true);
    const third = await a.start(3);
    expect(third.body).toMatchObject({ ok: false, error: 'agents' });
    expect(third.body.message).toBe('All 2 of your cloud agents are running.');
    expect((await b.start(4)).body.ok).toBe(true);
    expect((await b.start(5)).body.ok).toBe(true);
  });

  it("runs that outlast a member's hours end at the next call", async () => {
    const { as, tick, stopped } = setup();
    const a = as(A);
    await a.start(1); await a.start(2);
    tick(5 * HOUR + 60_000);
    await a.poll(1);
    expect(stopped()).toEqual(expect.arrayContaining([`u-${A}-run-1`, `u-${A}-run-2`]));
  });

  it('runs going when the trial ends are ended by the sweep', async () => {
    const { gw, as, tick, stopped } = setup({ start: MADE + 14 * DAY - 60_000 });
    const a = as(A);
    await a.start(1);
    tick(2 * 60_000);
    await gw.sweep();
    expect(stopped()).toContain(`u-${A}-run-1`);
  });
});

describe('the paid team', () => {
  const pay = (objects, seats) => objects.put('ledger/teams/team-1.json', JSON.stringify({ plan: 'team', seats, stripe: { status: 'active' } }));

  it("gives each member a seat's 400 hours a month and 10 agents at once, the $40 cloud plan's", async () => {
    const { as, objects, tick } = setup();
    await pay(objects, 2);
    tick(30 * DAY);
    const a = as(A);
    await a.start(1);
    tick(HOUR);
    await a.finish(1);
    expect((await a.me()).team).toMatchObject({ trial: false, seats: 2, hours: 400, agents: 10, usedSeconds: 3600 });
    expect(TEAM.hoursPerSeat).toBe(PLANS.pro.hoursPerMonth);
    expect(TEAM.agentsPerSeat).toBe(PLANS.pro.agents);
    expect(TEAM.dollarsPerSeat).toBe(PLANS.pro.dollarsPerMonth);
  });

  it('starts again from nothing each month', async () => {
    const { as, objects, tick } = setup({ start: Date.UTC(2026, 10, 30, 10) });
    await pay(objects, 1);
    const a = as(A);
    await a.start(1); tick(HOUR); await a.finish(1);
    tick(2 * DAY);
    expect((await a.me()).team.usedSeconds).toBe(0);
  });

  it('spent for the month, says so', async () => {
    const { as, objects, tick } = setup();
    await pay(objects, 2);
    const a = as(A);
    // 400 hours is fifty 8-hour runs, two at a time.
    for (let i = 0; i < 25; i += 1) { await a.start(100 + 2 * i); await a.start(101 + 2 * i); tick(8 * HOUR); await a.finish(100 + 2 * i); await a.finish(101 + 2 * i); }
    expect((await a.start(1)).body).toMatchObject({ ok: false, error: 'hours', message: 'This month\'s 400 cloud hours are used.' });
  });

  it("a member's own paid plan comes first and spends nothing of the team's", async () => {
    const { gw, as, objects, tick } = setup();
    await pay(objects, 2);
    const a = as(A);
    await a.me();
    await gw.admin({ do: 'plan', person: A, plan: 'pro' });
    await a.start(1); tick(HOUR); await a.finish(1);
    const me = await a.me();
    expect(me.usedSeconds).toBe(3600);
    expect(me.team.usedSeconds).toBe(0);
  });
});

describe('who is on a team, as the database says', () => {
  const fakeDb = (rows) => {
    const asked = [];
    const fetchImpl = async (url) => {
      asked.push(url);
      const body = url.includes('person_id=eq.') ? rows.mine : rows.all;
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    };
    return { db: supabaseRest({ url: 'https://db.test', serviceKey: 'k', fetchImpl }), asked };
  };

  it('reads the team, when it was made, its members and its owners', async () => {
    const { db } = fakeDb({ mine: [{ team_id: 'team-1', teams: { created_at: '2026-11-17T09:00:00Z' } }], all: [{ person_id: A, role: 'owner' }, { person_id: B, role: 'member' }] });
    expect(await db.teamOf(A)).toEqual({ id: 'team-1', createdAt: MADE, members: [A, B], owners: [A] });
  });

  it('someone on no team is on none', async () => {
    const { db } = fakeDb({ mine: [], all: [] });
    expect(await db.teamOf(C)).toBeNull();
  });

  it('is asked once a minute a person, not on every start', async () => {
    const { db, asked } = fakeDb({ mine: [{ team_id: 'team-1', teams: { created_at: '2026-11-17T09:00:00Z' } }], all: [{ person_id: A, role: 'owner' }] });
    let t = 0;
    const teams = teamsFrom(db, { now: () => t });
    await teams(A); await teams(A);
    expect(asked).toHaveLength(2);
    t = 61_000;
    await teams(A);
    expect(asked).toHaveLength(4);
  });
});

describe('what the app makes of it', () => {
  const NOW = MADE + 5 * DAY;
  const trial = { trial: true, endsAt: MADE + 14 * DAY, seats: 0, members: 3, owner: true, agents: 6, running: 2, hours: 30, usedSeconds: 8.5 * 3600 };
  const server = (team, over = {}) => ({ plan: 'none', agents: 0, hoursPerMonth: 0, running: 2, usedSeconds: 0, free: { agents: 2, hours: 5, usedSeconds: 0 }, team, ...over });
  const seen = (team, over) => ({ signedIn: true, ...cloudPlanOf(server(team, over)) });

  it('a team with hours left reads as the team plan, with its agents and hours', () => {
    expect(cloudPlanOf(server(trial))).toMatchObject({ plan: 'team', agents: 6, hoursPerMonth: 30, usedSeconds: 8.5 * 3600 });
  });

  it('a team whose hours are spent still reads as the team, with none left, never as the free hours', () => {
    const spent = seen({ ...trial, usedSeconds: 30 * 3600 });
    expect(spent.plan).toBe('team');
    expect(planSummary(spent, NOW)).toMatchObject({ name: 'Team trial', hours: { line: '0 of 30', percent: 0 }, teamPay: 'Pay for 3 seats · $120 a month' });
  });

  it('a plan of one\'s own reads as that plan, team or no team', () => {
    expect(cloudPlanOf(server(trial, { plan: 'pro', agents: 10, hoursPerMonth: 400 })).plan).toBe('pro');
  });

  it('the trial says the days left and the hours left, and the owner can pay for every seat', () => {
    expect(planSummary(seen(trial), NOW)).toMatchObject({
      name: 'Team trial', price: '9 days left', who: '30 cloud hours shared by your team', manage: false, change: null,
      teamPay: 'Pay for 3 seats · $120 a month',
      agents: { line: '2 of 6 running' }, hours: { label: 'Hours left', line: '21.5 of 30' },
    });
  });

  // A power tester on a 0.36-hour team saw "0.4 of 0.36": rounding up passed the whole.
  it('hours left never read as more than the whole', () => {
    expect(planSummary(seen({ ...trial, hours: 0.36, usedSeconds: 0 }), NOW).hours.line).toBe('0.36 of 0.36');
  });

  it('on its last day it says 1 day, never 0', () => {
    expect(planSummary(seen(trial), MADE + 14 * DAY - 60_000).price).toBe('1 day left');
  });

  // Two power testers on the team could not tell who pays, or what, after the trial.
  it('anyone but the owner is not offered to pay, and is told the price and who pays it', () => {
    const member = planSummary(seen({ ...trial, owner: false }), NOW);
    expect(member.teamPay).toBeUndefined();
    expect(member.who).toBe('Then $40 a person a month, paid by your team\'s owner');
  });

  it('a paid team says its seats and price, and only its owner manages billing', () => {
    const paid = { ...trial, trial: false, endsAt: null, seats: 3, agents: 30, hours: 1200, usedSeconds: 212 * 3600 };
    expect(planSummary(seen(paid), NOW)).toMatchObject({ name: 'Team', price: '$120 a month', who: '3 seats, billed monthly by Stripe', manage: true, change: null, hours: { line: '988 of 1,200' } });
    expect(planSummary(seen({ ...paid, owner: false }), NOW)).toMatchObject({ manage: false });
    expect(planSummary(seen(paid), NOW).teamPay).toBeUndefined();
  });

  it('a trial becoming paid seats counts as a change, so the page reads again until it lands', () => {
    expect(planKey(seen(trial))).not.toBe(planKey(seen({ ...trial, trial: false, seats: 3 })));
  });
});

describe('someone not on a team', () => {
  it('runs on their own free hours as before, and hears nothing of a team', async () => {
    const { as, tick } = setup();
    const c = as(C);
    await c.start(1); tick(HOUR); await c.finish(1);
    const me = await c.me();
    expect(me.team).toBeUndefined();
    expect(me.free.usedSeconds).toBe(3600);
  });
});
