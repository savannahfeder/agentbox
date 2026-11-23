// THE DATABASE HEARS WHETHER A TEAM PAYS, AND NO CARD MEANS NO FREE WEEK
// (w-61142123a4, 2026-11-21).
//
// The invite and share gates are in the database, but a team's bill lived only
// in the cloud server's ledger, so nothing there could tell a paying team from
// a free one. And the server gave every new team a week of cloud hours with no
// card, counted from the day it was made: measured on main at c30873df, a team
// made an hour before with no subscription read `trial: true, hours: 50`.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS, TEAM } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { stripeClient } from '../cloud/gateway/stripe.mjs';
import { supabaseRest } from '../cloud/gateway/phone.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SECRET = 'whsec_test_secret';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const MADE = Date.UTC(2026, 10, 21, 9);

type Written = { team: string; pays: boolean; status: string | null; trialEndsAt: number | null; rev: number };

function setup({ refuse = 0 } = {}) {
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
  const written: Written[] = [];
  let refusals = refuse;
  const db = {
    async writeTeamPlan(team: string, { pays, status, trialEndsAt, rev }: Omit<Written, 'team'>) {
      if (refusals > 0) { refusals -= 1; throw new Error('the database is down'); }
      written.push({ team, pays, status, trialEndsAt, rev });
    },
  };
  const team: { id: string; createdAt: number; freeUntil?: number; members: string[]; owners: string[] } = { id: 'team-1', createdAt: MADE, members: [A, B], owners: [A] };
  const log: string[] = [];
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (k: string) => `https://b/${k}`, head: async (k: string) => `https://b/${k}` },
    removeObject: async () => {},
    objects,
    db,
    whoIs: async (t: string) => ({ 'session-a': { id: A }, 'session-b': { id: B } } as Record<string, { id: string }>)[t] ?? null,
    teams: async (p: string) => (team.members.includes(p) ? team : null),
    stripe: stripeClient({ key: 'sk_test_x', webhookSecret: SECRET, fetchImpl }),
    now: () => clock,
    plans: PLANS,
    log: (l: string) => log.push(l),
  });
  const keys: Record<string, string> = {};
  const me = async (who: string) => {
    const token = who === A ? 'session-a' : 'session-b';
    keys[who] ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    return (await gw.handle({ method: 'GET', path: '/v1/me', headers: { authorization: `Bearer ${keys[who]}` }, body: '' })).body;
  };
  const webhook = (status: string, { trialEnd = null as number | null } = {}) => {
    subs.set('sub_team', {
      id: 'sub_team', object: 'subscription', status, customer: 'cus_team', metadata: { team: 'team-1', person: A },
      ...(trialEnd ? { trial_end: Math.floor(trialEnd / 1000) } : {}),
      items: { data: [{ quantity: 2, price: { id: 'price_team', lookup_key: 'agentbox_cloud_team_monthly' } }] },
    });
    const raw = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: 'customer.subscription.updated', data: { object: { id: 'sub_team', object: 'subscription', status } } });
    const t = Math.floor(clock / 1000);
    const sig = `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex')}`;
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': sig }, body: raw });
  };
  return { me, webhook, written, team, log, objects, tick: (ms: number) => { clock += ms; } };
}

describe('a team without a card', () => {
  it('made an hour ago has no trial and no hours, and is offered its week for when the card goes in', async () => {
    const { me } = setup();
    const body = await me(B);
    expect(body.team).toBeUndefined();
    expect(body.teamFreeDays).toBe(TEAM.trialDays);
  });

  it('has the trial while days given by hand last, and not after', async () => {
    const { me, team, tick } = setup();
    team.freeUntil = MADE + 3 * DAY;
    expect((await me(B)).team).toMatchObject({ trial: true, seats: 0, hours: TEAM.trialHoursPerMember, endsAt: MADE + 3 * DAY });
    tick(3 * DAY);
    expect((await me(B)).team).toBeUndefined();
  });

  it('someone on no team is offered nothing about one', async () => {
    const { me, team } = setup();
    team.members = [A];
    expect('teamFreeDays' in (await me(B))).toBe(false);
  });
});

describe('the database hears whether a team pays', () => {
  it('as paying once its card is in, with the trial end Stripe set, which the plan page shows', async () => {
    const { webhook, written, me } = setup();
    const ends = MADE + HOUR + TEAM.trialDays * DAY;
    await webhook('trialing', { trialEnd: ends });
    expect(written).toEqual([{ team: 'team-1', pays: true, status: 'trialing', trialEndsAt: ends, rev: 1 }]);
    expect((await me(B)).team).toMatchObject({ trial: true, seats: 2, endsAt: ends });
  });

  it('as not paying once it is cancelled, or its first charge fails', async () => {
    const { webhook, written } = setup();
    await webhook('trialing');
    await webhook('past_due');
    await webhook('canceled');
    expect(written.map((w) => [w.pays, w.status, w.rev])).toEqual([[true, 'trialing', 1], [false, 'past_due', 2], [false, 'canceled', 3]]);
  });

  it('as paying while a paid team’s renewal is retried', async () => {
    const { webhook, written } = setup();
    await webhook('active');
    await webhook('past_due');
    expect(written.at(-1)).toMatchObject({ pays: true, status: 'past_due' });
  });

  it('again on a later read when it refused the write, at most once in ten minutes, and says so', async () => {
    const { webhook, written, me, log, tick } = setup({ refuse: 1 });
    await webhook('trialing');
    expect(written).toEqual([]);
    expect(log.join('\n')).toMatch(/has not taken whether team team-1 pays/);
    await me(B);
    await me(B);
    expect(written).toEqual([]);
    tick(10 * 60_000);
    await me(B);
    expect(written).toMatchObject([{ pays: true, rev: 1 }]);
    tick(10 * 60_000);
    await me(B);
    expect(written).toHaveLength(1);
  });

  it('for a team that paid before this shipped, on its first read', async () => {
    const { objects, written, me } = setup();
    await objects.put('ledger/teams/team-1.json', JSON.stringify({ plan: 'team', seats: 2, stripe: { customer: 'cus_team', subscription: 'sub_team', status: 'active', paid: true } }));
    await me(B);
    expect(written).toEqual([{ team: 'team-1', pays: true, status: 'active', trialEndsAt: null, rev: 0 }]);
    await me(B);
    expect(written).toHaveLength(1);
  });

  it('nothing for a team that never had a bill', async () => {
    const { written, me } = setup();
    await me(B);
    expect(written).toEqual([]);
  });
});

describe('the database write', () => {
  const fake = (patched: unknown[]) => {
    const asked: Array<{ method: string; url: string; body: unknown }> = [];
    const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
      asked.push({ method: init.method, url, body: init.body ? JSON.parse(init.body) : null });
      return { ok: true, status: 200, text: async () => JSON.stringify(init.method === 'PATCH' ? patched : []) };
    };
    return { db: supabaseRest({ url: 'https://db.test', serviceKey: 'k', fetchImpl }), asked };
  };
  const row = { pays: true, status: 'trialing', trialEndsAt: Date.UTC(2026, 10, 28), rev: 3, at: MADE };

  it('moves only forwards, and leaves the free days given by hand alone', async () => {
    const { db, asked } = fake([{ team_id: 'team-1' }]);
    await db.writeTeamPlan('team-1', row);
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toContain('team_plans?team_id=eq.team-1&rev=lt.3');
    expect(asked[0].body).toEqual({ pays: true, status: 'trialing', trial_ends_at: '2026-11-28T00:00:00.000Z', rev: 3, at: new Date(MADE).toISOString() });
  });

  it('makes the row when there is none, giving way to one that is there', async () => {
    const { db, asked } = fake([]);
    await db.writeTeamPlan('team-1', row);
    expect(asked.map((a) => a.method)).toEqual(['PATCH', 'POST']);
    expect(asked[1].url).toContain('team_plans?on_conflict=team_id');
    expect(asked[1].body).toMatchObject({ team_id: 'team-1', pays: true });
    expect(asked[1].body).not.toHaveProperty('free_until');
  });
});
