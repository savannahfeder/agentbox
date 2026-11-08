// A TEAM SHARES ITS CLOUD HOURS: a 14-day trial, then $40 a seat.
//
// The owner's plan for the multiplayer launch (2026-11-06): every team gets
// 14 days free with 10 cloud hours per member, shared by the whole team; then
// $40 a member a month, each seat Pro's 10 agents at once and 400 hours, the
// hours one pool. A person's own paid plan comes first, then the team's, then
// their own 5 free hours. Before this a team was nothing to the cloud server:
// each member ran on their own plan or their free hours alone.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { supabaseRest, teamsFrom } from '../cloud/gateway/phone.mjs';

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
  it('is 14 days and 10 hours a member, shared', () => {
    expect(TEAM).toMatchObject({ trialDays: 14, trialHoursPerMember: 10, hoursPerSeat: 400, agentsPerSeat: 10, dollarsPerSeat: 40 });
  });

  it('runs a member with no plan on the team, not on their free hours', async () => {
    const { as, tick } = setup();
    const a = as(A);
    expect((await a.start(1)).body.ok).toBe(true);
    tick(HOUR);
    await a.finish(1);
    const me = await a.me();
    expect(me.team).toMatchObject({ trial: true, hours: 20, usedSeconds: 3600, endsAt: MADE + 14 * DAY, owner: true });
    expect(me.free.usedSeconds).toBe(0);
  });

  it('shares the hours: what one member spends, the other has not got', async () => {
    const { as, tick } = setup();
    const a = as(A); const b = as(B);
    // A run is held to 8 hours, so 15 hours is two of them.
    await a.start(1); await a.start(6);
    tick(7.5 * HOUR);
    await a.finish(1); await a.finish(6);
    expect((await b.me()).team.usedSeconds).toBe(15 * 3600);
    await b.start(2);
    tick(5 * HOUR);
    await b.finish(2);
    // 20 spent: B's next run falls to B's own free hours, which are untouched.
    expect((await b.start(3)).body.ok).toBe(true);
    tick(HOUR);
    await b.finish(3);
    expect((await b.me()).free.usedSeconds).toBe(3600);
  });

  it('spent, with the free hours spent too, asks for a plan and says it was the team\'s', async () => {
    const { as, tick } = setup({ members: [A] });
    const a = as(A);
    await a.start(1); await a.start(4); tick(5 * HOUR); await a.finish(1); await a.finish(4);
    await a.start(2); tick(5 * HOUR); await a.finish(2);
    const refused = await a.start(3);
    expect(refused.body).toMatchObject({ ok: false, error: 'plan' });
  });

  it('ends after 14 days: back to each member\'s own free hours', async () => {
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

  it('runs two agents at once a member, counted across the team', async () => {
    const { as } = setup();
    const a = as(A); const b = as(B);
    for (let i = 1; i <= 3; i += 1) expect((await a.start(i)).body.ok).toBe(true);
    expect((await b.start(4)).body.ok).toBe(true);
    const fifth = await b.start(5);
    expect(fifth.body).toMatchObject({ ok: false, error: 'agents' });
    expect(fifth.body.message).toMatch(/team/);
  });

  it('runs that outlast the team\'s hours end at the next sweep', async () => {
    const { gw, as, tick, stopped } = setup({ members: [A] });
    const a = as(A);
    await a.start(1); await a.start(2);
    tick(5 * HOUR + 60_000);
    await gw.sweep();
    expect(stopped()).toEqual(expect.arrayContaining([`u-${A}-run-1`, `u-${A}-run-2`]));
  });
});

describe('the paid team', () => {
  const pay = (objects, seats) => objects.put('ledger/teams/team-1.json', JSON.stringify({ plan: 'team', seats, stripe: { status: 'active' } }));

  it('pools 400 hours a seat a month and 10 agents a seat', async () => {
    const { as, objects, tick } = setup();
    await pay(objects, 2);
    tick(30 * DAY);
    const a = as(A);
    await a.start(1);
    tick(HOUR);
    await a.finish(1);
    expect((await a.me()).team).toMatchObject({ trial: false, seats: 2, hours: 800, agents: 20, usedSeconds: 3600 });
  });

  it('starts again from nothing each month', async () => {
    const { as, objects, tick } = setup({ start: Date.UTC(2026, 10, 30, 10) });
    await pay(objects, 1);
    const a = as(A);
    await a.start(1); tick(HOUR); await a.finish(1);
    tick(2 * DAY);
    expect((await a.me()).team.usedSeconds).toBe(0);
  });

  it('a member\'s own paid plan comes first and spends nothing of the team\'s', async () => {
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
