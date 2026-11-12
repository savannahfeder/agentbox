// EACH TEAM MEMBER HAS CLOUD HOURS OF THEIR OWN: a 7-day trial, then $40 a seat.
//
// The owner's plan for the multiplayer launch: every team gets 7 days free
// (14 until 2026-11-10, when she cut Pro's trial to 7),
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
import { planKey } from '../renderer/src/cloud-upgrade.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamBilling, teamBillingView } from '../renderer/src/team/TeamBilling.tsx';

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
  it('is 7 days, 10 hours and 2 agents at once a member; a seat is 400 hours and 10 agents', () => {
    expect(TEAM).toMatchObject({ trialDays: 7, trialHoursPerMember: 10, trialAgentsPerMember: 2, hoursPerSeat: 400, agentsPerSeat: 10, dollarsPerSeat: 40 });
  });

  it('runs a member with no plan on their own trial hours, not on their free hours', async () => {
    const { as, tick } = setup();
    const a = as(A);
    expect((await a.start(1)).body.ok).toBe(true);
    tick(HOUR);
    await a.finish(1);
    const me = await a.me();
    expect(me.team).toMatchObject({ trial: true, hours: 10, agents: 2, usedSeconds: 3600, endsAt: MADE + 7 * DAY, owner: true });
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

  it("ends after 7 days: back to each member's own free hours", async () => {
    const { as, tick } = setup();
    const a = as(A);
    tick(7 * DAY);
    expect((await a.start(1)).body.ok).toBe(true);
    tick(HOUR);
    await a.finish(1);
    const me = await a.me();
    expect(me.team).toBeUndefined();
    expect(me.free.usedSeconds).toBe(3600);
  });

  it('a day before the end, it still runs', async () => {
    const { as, tick } = setup();
    tick(6 * DAY);
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
    const { gw, as, tick, stopped } = setup({ start: MADE + 7 * DAY - 60_000 });
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
  const people = [{ id: A, usedSeconds: 4.2 * 3600, running: 1 }, { id: B, usedSeconds: 3.1 * 3600, running: 0 }, { id: C, usedSeconds: 0, running: 0 }];
  const trial = { trial: true, endsAt: MADE + 7 * DAY, seats: 0, members: 3, owner: true, agents: 2, running: 1, hours: 10, usedSeconds: 4.2 * 3600, people };
  const server = (team, over = {}) => ({ plan: 'none', agents: 0, hoursPerMonth: 0, running: 1, usedSeconds: 0, free: { agents: 2, hours: 5, usedSeconds: 0 }, team, ...over });
  const names = [
    { id: A, name: 'Sam Rivera', email: 's@example.com', avatarUrl: null, role: 'owner' },
    { id: B, name: 'Priya Natarajan', email: 'p@example.com', avatarUrl: null, role: 'member' },
    { id: C, name: 'Leo Okafor', email: 'l@example.com', avatarUrl: null, role: 'member' },
  ];
  const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
  const page = (team, me = A, billing = null) => text(renderToStaticMarkup(React.createElement(TeamBilling, { team, people: names, meId: me, billing, now: NOW })));

  it('a team reads as the team plan, with your own agents and hours', () => {
    expect(cloudPlanOf(server(trial))).toMatchObject({ plan: 'team', agents: 2, hoursPerMonth: 10, usedSeconds: 4.2 * 3600 });
  });

  it('your hours spent still read as the team, never as the free hours', () => {
    expect(cloudPlanOf(server({ ...trial, usedSeconds: 10 * 3600 })).plan).toBe('team');
  });

  it('a plan of one\'s own reads as that plan, team or no team', () => {
    expect(cloudPlanOf(server(trial, { plan: 'pro', agents: 10, hoursPerMonth: 400 })).plan).toBe('pro');
  });

  it('the trial says its days, your hours now beside a seat after it, and the owner can pay for every seat', () => {
    const t = page(trial);
    expect(t).toContain('2 days left in your team\'s trial');
    expect(t).toContain('Started Nov 17');
    expect(t).toContain('Ends Nov 24');
    expect(t).toContain('Pay for 3 seats now · $120 a month');
    expect(t).toMatch(/Now, each person 5\.8 of 10 of your trial hours left 2 agents at once/);
    expect(t).toMatch(/From Nov 24, each person \$40 a month 400 cloud hours a month 10 agents at once · you pay \$120 a month for 3/);
  });

  it("each member's own hours left, you first, by the names the team knows", () => {
    const rows = teamBillingView(trial, names, B, NOW).rows;
    expect(rows.map((r) => [r.name, r.owner, Math.round(r.left / 360) / 10])).toEqual([['You', false, 6.9], ['Sam Rivera', true, 5.8], ['Leo Okafor', false, 10]]);
  });

  it('someone the team does not name yet is a teammate, not an id', () => {
    expect(teamBillingView(trial, [], A, NOW).rows.map((r) => r.name)).toEqual(['You', 'A teammate', 'A teammate']);
  });

  it('anyone but the owner is not offered to pay, and is told who pays', () => {
    const t = page({ ...trial, owner: false }, B);
    expect(t).not.toContain('Pay for');
    expect(t).toContain('paid by your team\'s owner');
  });

  // A power tester saw a member's bar a third full beside "0 of 0.1 h": the number was rounded down.
  it('a member with a little left never reads as none', () => {
    const t = page({ ...trial, people: [{ id: A, usedSeconds: 10 * 3600 - 120, running: 0 }] });
    expect(t).toContain('0.1 of 10 h');
  });

  it('on its last day it says 1 day, never 0', () => {
    expect(teamBillingView(trial, names, A, MADE + 7 * DAY - 60_000).days).toBe(1);
  });

  it('a paying team shows its price, next bill, card and last invoice to its owner', () => {
    const paid = { ...trial, trial: false, endsAt: null, seats: 3, agents: 10, hours: 400, usedSeconds: 96 * 3600, people: people.map((m) => ({ ...m, usedSeconds: m.usedSeconds * 20 })) };
    const billing = { periodStart: NOW - 12 * DAY, periodEnd: NOW + 18 * DAY, nextAt: NOW + 18 * DAY, nextAmount: 120, card: { brand: 'Visa', last4: '4242' }, email: 'billing@example.com', invoices: [{ at: NOW - 12 * DAY, amount: 120, status: 'paid' }] };
    const t = page(paid, A, billing);
    expect(t).toContain('Team · $120 a month');
    expect(t).toContain('3 seats · next bill $120 on Dec 10');
    expect(t).toContain('Manage billing');
    expect(t).toMatch(/This month, you 304 of 400 cloud hours left 10 agents at once/);
    expect(t).toMatch(/Billing Visa 4242 Invoices go to billing@example.com Last Nov 10, \$120 · Paid/);
    const member = page({ ...paid, owner: false }, B);
    expect(member).toContain('Paid by your team\'s owner');
    expect(member).not.toContain('Manage billing');
    expect(member).not.toContain('Visa');
  });

  it('a trial becoming paid seats counts as a change, so the page reads again until it lands', () => {
    const seen = (team) => ({ signedIn: true, ...cloudPlanOf(server(team)) });
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
