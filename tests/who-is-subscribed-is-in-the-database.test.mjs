// WHO IS SUBSCRIBED IS IN THE DATABASE, AND A PLAN CAN BE GIVEN THERE.
//
// What was wrong (2026-10-31): giving a QA account Pro meant an AWS console
// sign-in and an account id nothing on the Mac could look up, because the
// plan lived only in the cloud server's own ledger in S3. Nothing in the
// database knew who paid. The ledger still holds what a run start reads, in
// the same compare-and-swap that counts the runs; the database now carries a
// copy of it beside the account, and a `give` there is how a plan is handed
// out. Measured against a fake database that records every call, the real
// client over a fake fetch, and the table itself in PGlite.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { supabaseRest } from '../cloud/gateway/phone.mjs';

const P = '88888888-8888-4888-8888-888888888888';
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The database, remembering what it was told and refusing while asked to. */
function fakeDb() {
  let given = [];
  return {
    refuse: false,
    wrote: [],
    cleared: [],
    ask(rows) { given = rows; },
    async writePlan(person, row) {
      if (this.refuse) throw new Error('the database answered 503: down');
      this.wrote.push({ person, ...row });
    },
    async plansGiven() { return given; },
    async takeGive(person, give) { this.cleared.push({ person, give }); given = given.filter((r) => r.person !== person); },
  };
}

function cloud(db) {
  const said = [];
  const objects = memoryObjects();
  const subscriptions = new Map();
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects,
    whoIs: async () => null,
    db,
    stripe: {
      signed: () => true,
      async subscription(id) { return subscriptions.get(id); },
      async checkout() { return { id: 'cs', url: 'https://stripe.test/c' }; },
      async billing() { return 'https://stripe.test/b'; },
      async session(id) { return { id, status: 'open' }; },
      async expire(id) { return { id, status: 'expired' }; },
    },
    log: (m) => said.push(m),
  });
  const pays = (id, person, plan, status = 'active') => {
    subscriptions.set(id, { id, status, customer: 'cus_1', metadata: { person }, items: { data: [{ price: { lookup_key: `agentbox_cloud_${plan}_monthly` } }] } });
    return gw.handle({ method: 'POST', path: '/v1/stripe', headers: { 'stripe-signature': 'x' }, body: JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id } } }) });
  };
  const ledger = async (person) => JSON.parse((await objects.get(`ledger/people/${person}.json`)).body);
  return { gw, said, pays, ledger };
}

describe('the plan the cloud server holds someone to', () => {
  it('reaches the database when the owner gives it, as a plan given by hand', async () => {
    const db = fakeDb();
    const { gw } = cloud(db);
    await gw.admin({ do: 'plan', person: P, plan: 'pro' });
    expect(db.wrote).toEqual([{ person: P, plan: 'pro', source: 'given', rev: 1, at: expect.any(Number) }]);
  });

  it('reaches it when Stripe says someone is paying, as a plan Stripe bills', async () => {
    const db = fakeDb();
    const { pays } = cloud(db);
    await pays('sub_1', P, 'plus');
    expect(db.wrote).toEqual([{ person: P, plan: 'plus', source: 'stripe', rev: 1, at: expect.any(Number) }]);
  });

  it('says nobody is subscribed once the subscription ends', async () => {
    const db = fakeDb();
    const { pays } = cloud(db);
    await pays('sub_1', P, 'pro');
    await pays('sub_1', P, 'pro', 'canceled');
    expect(db.wrote.map((w) => [w.plan, w.source, w.rev])).toEqual([['pro', 'stripe', 1], ['none', null, 2]]);
  });

  it('is not written again by a ledger write that leaves the plan where it was', async () => {
    const db = fakeDb();
    const { gw } = cloud(db);
    await gw.admin({ do: 'plan', person: P, plan: 'pro' });
    await gw.admin({ do: 'plan', person: P, plan: 'pro' });
    await gw.sweep();
    expect(db.wrote).toHaveLength(1);
  });
});

describe('a database that will not take the plan', () => {
  it('does not stop the plan being given, and does not pass in silence', async () => {
    const db = fakeDb();
    db.refuse = true;
    const { gw, said, ledger } = cloud(db);
    await gw.admin({ do: 'plan', person: P, plan: 'max' });
    expect((await ledger(P)).plan).toBe('max');
    expect(said.join('\n')).toMatch(/database/i);
  });

  it('is told again by the next sweep, and left alone once it has it', async () => {
    const db = fakeDb();
    db.refuse = true;
    const { gw } = cloud(db);
    await gw.admin({ do: 'plan', person: P, plan: 'max' });
    expect(db.wrote).toEqual([]);
    db.refuse = false;
    await gw.sweep();
    expect(db.wrote).toEqual([{ person: P, plan: 'max', source: 'given', rev: 1, at: expect.any(Number) }]);
    await gw.sweep();
    expect(db.wrote).toHaveLength(1);
  });
});

describe('a plan asked for in the database', () => {
  it('is taken up by the sweep, written back, and the ask cleared', async () => {
    const db = fakeDb();
    const { gw, said, ledger } = cloud(db);
    db.ask([{ person: P, give: 'pro' }]);
    await gw.sweep();
    expect((await ledger(P)).plan).toBe('pro');
    expect(db.wrote).toEqual([{ person: P, plan: 'pro', source: 'given', rev: 1, at: expect.any(Number) }]);
    expect(db.cleared).toEqual([{ person: P, give: 'pro' }]);
    expect(said.join('\n')).toContain(P);
  });

  it('that is no plan at all changes nobody, is said, and is cleared so it is not read for ever', async () => {
    const db = fakeDb();
    const { gw, said } = cloud(db);
    db.ask([{ person: P, give: 'Pro' }]);
    await gw.sweep();
    expect(db.wrote).toEqual([]);
    expect(db.cleared).toEqual([{ person: P, give: 'Pro' }]);
    expect(said.join('\n')).toMatch(/no plan/i);
  });
});

describe('the database write itself', () => {
  it('refuses to put back a plan older than the row already there', async () => {
    const calls = [];
    const db = supabaseRest({
      url: 'https://db.test',
      serviceKey: 'service',
      fetchImpl: async (url, opts) => {
        calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
        // The row is on a newer revision, so the change matches nothing.
        return { ok: true, status: 200, text: async () => '[]' };
      },
    });
    await db.writePlan(P, { plan: 'pro', source: 'given', rev: 3, at: 0 });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain('rev=lt.3');
    // Nothing changed, so either there is no row yet or the row is newer: an
    // insert that gives way to the row already there settles both.
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toContain('on_conflict=person');
  });
});

// The table itself, against every migration in PGlite, with a stand-in for
// Supabase's auth schema (as tests/your-phones-alert-address-is-yours-alone
// does). A plan nobody but the server may write is the whole guard: a sign-in
// that could write this row could give itself the cloud.
describe('the table', () => {
  const dir = path.join(repoRoot, 'cloud/supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const migrations = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const STAND_IN = `
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated; create role anon; create role service_role bypassrls;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated;
`;
  const ME = '11111111-1111-1111-1111-111111111111';
  const MATE = '22222222-2222-2222-2222-222222222222';
  let db;

  const as = async (person, sql, role = 'authenticated') => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
    try { return await db.query(sql); } finally { await db.exec('reset role;'); }
  };
  const server = (sql) => as(null, sql, 'service_role');
  const plans = () => server(`select person, plan, source, give, rev from public.cloud_plans order by person`);

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(STAND_IN);
    await db.exec(migrations);
    await db.exec(`
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users (id, email, email_confirmed_at) values ('${ME}', 'me@example.com', now()), ('${MATE}', 'mate@example.com', now());
    `);
    await server(`insert into public.cloud_plans (person, plan, source, rev) values ('${ME}', 'pro', 'given', 1), ('${MATE}', 'max', 'stripe', 4)`);
  });
  afterEach(() => db.close());

  it('is its own migration', () => {
    expect(files).toContain('20261031000000_who_is_subscribed.sql');
  });

  it('shows you your own plan and nobody else theirs', async () => {
    const mine = await as(ME, 'select person, plan from public.cloud_plans');
    expect(mine.rows).toEqual([{ person: ME, plan: 'pro' }]);
    expect((await as(null, 'select person from public.cloud_plans')).rows).toEqual([]);
  });

  it('takes no plan from anyone signed in, their own least of all', async () => {
    await expect(as(ME, `insert into public.cloud_plans (person, plan) values ('${ME}', 'max')`)).rejects.toThrow();
    await expect(as(ME, `update public.cloud_plans set plan = 'max' where person = '${ME}'`)).rejects.toThrow();
    await expect(as(ME, `update public.cloud_plans set give = 'max' where person = '${ME}'`)).rejects.toThrow();
    await expect(as(ME, `delete from public.cloud_plans where person = '${ME}'`)).rejects.toThrow();
    expect((await plans()).rows.map((r) => r.plan)).toEqual(['pro', 'max']);
  });

  it('is where the owner asks for a plan, by address', async () => {
    await server(`insert into public.cloud_plans (person, give)
      select id, 'plus' from public.people where email = 'me@example.com'
      on conflict (person) do update set give = 'plus'`);
    expect((await server(`select give from public.cloud_plans where person = '${ME}'`)).rows).toEqual([{ give: 'plus' }]);
  });

  it('says who is subscribed, beside the address', async () => {
    const who = await server(`select p.email, c.plan from public.cloud_plans c join public.people p on p.id = c.person order by p.email`);
    expect(who.rows).toEqual([{ email: 'mate@example.com', plan: 'max' }, { email: 'me@example.com', plan: 'pro' }]);
  });

  it('goes when the account goes', async () => {
    await db.exec(`delete from auth.users where id = '${ME}'`);
    expect((await plans()).rows.map((r) => r.person)).toEqual([MATE]);
  });

  it('can be run twice, keeping the plans it holds', async () => {
    await db.exec(fs.readFileSync(path.join(dir, '20261031000000_who_is_subscribed.sql'), 'utf8'));
    expect((await plans()).rows).toHaveLength(2);
  });
});
