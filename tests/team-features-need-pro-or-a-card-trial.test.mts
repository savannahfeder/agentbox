// TEAM FEATURES NEED PRO OR A CARD TRIAL (w-61142123a4, 2026-11-21).
//
// On Free anyone let into multiplayer could make a team, invite people and
// share threads: inviting checked only the invite-only list, and nothing
// looked at the plan. The founder: "That's supposed to be a paid feature",
// and free trials need a card. Measured on main at c30873df: an owner whose
// team had never paid sent an invite and the row went in. These run every
// real migration in PGlite with Supabase's auth stood in.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'cloud/supabase/migrations');
const GATE = '20261121130000_team_features_need_pro.sql';
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const read = (list: string[]) => list.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

const SUPABASE_STAND_IN = `
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role authenticated;
create role anon;
create role service_role;
create publication supabase_realtime;
`;
const GRANTS = `
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`;

const EARLY = '11111111-1111-1111-1111-111111111111';
const OUTSIDER = '22222222-2222-2222-2222-222222222222';
const FREE = '33333333-3333-3333-3333-333333333333';
const PAID = '44444444-4444-4444-4444-444444444444';
const MATE = '55555555-5555-5555-5555-555555555555';
const GIVEN = '66666666-6666-6666-6666-666666666666';

let db: PGlite;

async function as(person: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const refusal = async (person: string, sql: string, params: unknown[] = []) => {
  try { await as(person, sql, params); return null; } catch (e) { return String((e as Error).message); }
};
const invite = (person: string, team: string, email: string) =>
  refusal(person, `insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)`, [team, email, person]);
const pays = async (person: string) => ((await as(person, `select public.my_team_pays() as on`)).rows[0] as { on: boolean }).on;
const sends = async (person: string) => ((await db.query(`select count(*)::int as n from public.team_invite_sends where invited_by = $1`, [person])).rows[0] as { n: number }).n;
const planOf = async (team: string) => (await db.query(`select pays, free_until, features_until from public.team_plans where team_id = $1`, [team])).rows[0] as { pays: boolean; free_until: Date | null; features_until: Date | null } | undefined;
async function setPlan(team: string, cols: string) {
  await db.query(`insert into public.team_plans (team_id) values ($1) on conflict do nothing`, [team]);
  await db.query(`update public.team_plans set ${cols} where team_id = $1`, [team]);
}

async function signUp(id: string, email: string) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, email]);
}
async function teamOf(owner: string, name: string) {
  const { rows } = await as(owner, `insert into public.teams (name, created_by) values ($1, $2) returning id`, [name, owner]);
  const team = (rows[0] as { id: string }).id;
  await as(owner, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team, owner]);
  return team;
}
const card = (person: string, team: string, thread: string) => as(person,
  `insert into public.thread_cards (person_id, team_id, thread_id, visible, title, problem, state) values ($1, $2, $3, true, 'Fix the refund flow', 'Refunds fail', 'running')
   on conflict (person_id, thread_id) do update set visible = true, title = excluded.title, problem = excluded.problem`, [person, team, thread]);
const cardOf = async (person: string, thread: string) => (await db.query(`select visible, title, problem from public.thread_cards where person_id = $1 and thread_id = $2`, [person, thread])).rows[0];

let earlyTeam = '';
let outsiderTeam = '';

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(read(files.filter((f) => f < GATE)));
  await db.exec(GRANTS);
  await signUp(EARLY, 'early@let-in.test');
  await signUp(OUTSIDER, 'outsider@nowhere.test');
  await db.query(`insert into public.multiplayer_people (email) values ('early@let-in.test')`);
  earlyTeam = await teamOf(EARLY, 'Let in before Pro was needed');
  outsiderTeam = await teamOf(OUTSIDER, 'Never let in');
  await db.exec(read(files.filter((f) => f >= GATE)));
  await db.exec(GRANTS);
  for (const [id, email] of [[FREE, 'free@team.test'], [PAID, 'paid@team.test'], [MATE, 'mate@team.test'], [GIVEN, 'given@team.test']]) await signUp(id, email);
  // Multiplayer open to all, so only the plan is in the way.
  await db.query(`insert into public.multiplayer_people (email) values ('*')`);
}, 60_000);
afterAll(() => db.close());

describe('a team on Free', () => {
  it('can still be made, so Pro has a team to buy seats for', async () => {
    expect(await teamOf(FREE, 'On Free')).toMatch(/-/);
    expect(await pays(FREE)).toBe(false);
  });

  it('cannot invite anyone, says why, and spends no daily invitation on it', async () => {
    const team = ((await db.query(`select id from public.teams where name = 'On Free'`)).rows[0] as { id: string }).id;
    expect(await invite(FREE, team, 'friend@team.test')).toMatch(/Inviting teammates needs Pro/);
    expect((await db.query(`select * from public.team_invites where team_id = $1`, [team])).rows).toEqual([]);
    expect(await sends(FREE)).toBe(0);
  });

  it('shares no thread: its card goes up private, with no words, and its work is refused', async () => {
    const team = ((await db.query(`select id from public.teams where name = 'On Free'`)).rows[0] as { id: string }).id;
    await card(FREE, team, 'w-1');
    expect(await cardOf(FREE, 'w-1')).toEqual({ visible: false, title: null, problem: null });
    expect(await refusal(FREE, `insert into public.thread_work (person_id, thread_id, team_id, hash, work) values ($1, 'w-1', $2, 'h', '{}'::jsonb)`, [FREE, team])).toMatch(/Sharing threads needs Pro/);
  });

  it('cannot mark itself as paying or give itself free days', async () => {
    expect(await refusal(FREE, `insert into public.team_plans (team_id, pays) select id, true from public.teams where created_by = $1`, [FREE])).toMatch(/permission denied/);
    expect(await refusal(FREE, `select * from public.team_plans`)).toMatch(/permission denied/);
  });
});

describe('a team that pays, or is in its free week with a card', () => {
  let team = '';
  it('invites, and its teammate joins', async () => {
    team = await teamOf(PAID, 'Paying');
    await setPlan(team, `pays = true, status = 'trialing'`);
    expect(await pays(PAID)).toBe(true);
    expect(await invite(PAID, team, 'mate@team.test')).toBeNull();
    await as(MATE, `select public.accept_invite($1)`, [team]);
    expect(await pays(MATE)).toBe(true);
  });

  it('shares a thread with its words', async () => {
    await card(MATE, team, 'w-2');
    expect(await cardOf(MATE, 'w-2')).toEqual({ visible: true, title: 'Fix the refund flow', problem: 'Refunds fail' });
    expect(await refusal(MATE, `insert into public.thread_work (person_id, thread_id, team_id, hash, work) values ($1, 'w-2', $2, 'h', '{}'::jsonb)`, [MATE, team])).toBeNull();
  });

  it('once it stops paying, takes nobody new on an invite sent while it paid, and keeps the invite', async () => {
    expect(await invite(PAID, team, 'given@team.test')).toBeNull();
    await setPlan(team, `pays = false, status = 'canceled'`);
    expect(await refusal(GIVEN, `select public.accept_invite($1)`, [team])).toMatch(/needs Pro to take anyone new/);
    expect((await db.query(`select email from public.team_invites where team_id = $1`, [team])).rows).toEqual([{ email: 'given@team.test' }]);
    expect(await pays(MATE)).toBe(false);
  });

  it('once it stops paying, the next write of a shared card takes its words down', async () => {
    await card(MATE, team, 'w-2');
    expect(await cardOf(MATE, 'w-2')).toEqual({ visible: false, title: null, problem: null });
  });
});

describe('free days given by hand', () => {
  // Only when the owner asks an agent for them (2026-11-21: "I can just query you when I need it").
  it('let a team invite until they end, and not a moment after', async () => {
    const team = await teamOf(GIVEN, 'Given days');
    await setPlan(team, `free_until = now() + interval '14 days'`);
    expect(await invite(GIVEN, team, 'a@team.test')).toBeNull();
    await setPlan(team, `free_until = now() - interval '1 second'`);
    expect(await invite(GIVEN, team, 'b@team.test')).toMatch(/needs Pro/);
    await setPlan(team, `free_until = now() + interval '1 minute'`);
    expect(await invite(GIVEN, team, 'b@team.test')).toBeNull();
  });

  it('come from no function anyone can call', async () => {
    expect((await db.query(`select 1 from pg_proc where proname like '%give_team%'`)).rows).toEqual([]);
  });
});

// Every trial needs a card (2026-11-21), so their two weeks are inviting and sharing, never free cloud hours (free_until).
describe('teams let into multiplayer before this', () => {
  it('keep inviting and sharing until 2026-12-05, with no free Pro, and a team never let in gets nothing', async () => {
    expect(await planOf(earlyTeam)).toMatchObject({ pays: false, free_until: null, features_until: new Date('2026-12-05T00:00:00.000Z') });
    expect(await invite(EARLY, earlyTeam, 'later@let-in.test')).toBeNull();
    expect(await planOf(outsiderTeam)).toBeUndefined();
  });

  it('stop inviting once their two weeks end', async () => {
    await setPlan(earlyTeam, `features_until = now() - interval '1 second'`);
    expect(await invite(EARLY, earlyTeam, 'after@let-in.test')).toMatch(/needs Pro/);
  });

  it('keep the later of two ends when the migration runs again', async () => {
    await setPlan(earlyTeam, `features_until = timestamptz '2027-01-01 00:00:00+00'`);
    await db.exec(read([GATE]));
    expect((await planOf(earlyTeam))?.features_until?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
