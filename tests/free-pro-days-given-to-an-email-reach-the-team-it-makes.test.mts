// FREE PRO DAYS GIVEN TO AN EMAIL REACH THE TEAM IT MAKES (w-848f4440f9, 2026-11-26).
//
// The owner asked for six people let into multiplayer to get 7 days of Pro
// so they could invite their teams. Free days are set on a team
// (team_plans.free_until), and none of the six had a team yet, so there was
// nothing to set them on. Measured on main at 6f49dfbc9: no table held days
// waiting for a person, and a team its owner made started with no plan row.
// These run every real migration in PGlite with Supabase's auth stood in.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'cloud/supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const read = (list: string[]) => list.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');
const THIS = files.find((f) => f.includes('free_pro_days_wait_for_a_persons_team'));

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

const GIVEN = '11111111-1111-1111-1111-111111111111';
const MIXED_CASE = '22222222-2222-2222-2222-222222222222';
const UNCONFIRMED = '33333333-3333-3333-3333-333333333333';
const NOBODY = '44444444-4444-4444-4444-444444444444';
const JOINER = '55555555-5555-5555-5555-555555555555';
const HOST = '66666666-6666-6666-6666-666666666666';
const LONGER = '77777777-7777-7777-7777-777777777777';

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
async function signUp(id: string, email: string, confirmed = true) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, ${confirmed ? 'now()' : 'null'})`, [id, email]);
}
async function teamOf(owner: string, name: string) {
  const { rows } = await as(owner, `insert into public.teams (name, created_by) values ($1, $2) returning id`, [name, owner]);
  const team = (rows[0] as { id: string }).id;
  await as(owner, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team, owner]);
  return team;
}
const give = (email: string, days: number) => db.query(`insert into public.free_pro_people (email, days) values ($1, $2)`, [email, days]);
const daysLeft = async (team: string) => {
  const r = (await db.query(`select extract(epoch from free_until - now()) / 86400 as d from public.team_plans where team_id = $1`, [team])).rows[0] as { d: number } | undefined;
  return r ? Number(r.d) : null;
};

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(read(files));
  await db.exec(GRANTS);
  await db.query(`insert into public.multiplayer_people (email) values ('*')`);
}, 60_000);
afterAll(() => db.close());

describe('days given to an email before its person has a team', () => {
  it('this migration exists', () => expect(THIS).toBeTruthy());

  it('become free Pro on the first team that person makes, from the day they make it', async () => {
    await give('given@team.test', 7);
    await signUp(GIVEN, 'given@team.test');
    const team = await teamOf(GIVEN, 'Given a week');
    const d = await daysLeft(team);
    expect(d).toBeGreaterThan(6.99);
    expect(d).toBeLessThanOrEqual(7);
    expect(await invite(GIVEN, team, 'mate@team.test')).toBeNull();
  });

  it('are spent once: a second team the same person makes gets none', async () => {
    const second = await teamOf(GIVEN, 'A second team');
    expect(await daysLeft(second)).toBeNull();
    expect(await invite(GIVEN, second, 'other@team.test')).toMatch(/needs Pro/);
  });

  it('match an account whose email was typed with capitals', async () => {
    await give('mixed@team.test', 7);
    await signUp(MIXED_CASE, 'Mixed@Team.test');
    expect(await daysLeft(await teamOf(MIXED_CASE, 'Capitals'))).toBeGreaterThan(6.99);
  });

  it('wait while the email is unconfirmed', async () => {
    await give('unconfirmed@team.test', 7);
    await signUp(UNCONFIRMED, 'unconfirmed@team.test', false);
    expect(await daysLeft(await teamOf(UNCONFIRMED, 'Not confirmed'))).toBeNull();
    expect((await db.query(`select used_at from public.free_pro_people where email = 'unconfirmed@team.test'`)).rows).toEqual([{ used_at: null }]);
  });

  it('are not spent on a team the person joins rather than makes', async () => {
    await give('joiner@team.test', 7);
    await signUp(JOINER, 'joiner@team.test');
    await signUp(HOST, 'host@team.test');
    const host = await teamOf(HOST, 'Host');
    await db.query(`insert into public.team_plans (team_id, pays) values ($1, true)`, [host]);
    expect(await invite(HOST, host, 'joiner@team.test')).toBeNull();
    await as(JOINER, `select public.accept_invite($1)`, [host]);
    expect((await db.query(`select used_at from public.free_pro_people where email = 'joiner@team.test'`)).rows).toEqual([{ used_at: null }]);
    expect(await daysLeft(await teamOf(JOINER, 'Joiner’s own'))).toBeGreaterThan(6.99);
  });

  it('never shorten free days a team already has', async () => {
    await give('longer@team.test', 7);
    await signUp(LONGER, 'longer@team.test');
    const { rows } = await as(LONGER, `insert into public.teams (name, created_by) values ('Longer', $1) returning id`, [LONGER]);
    const team = (rows[0] as { id: string }).id;
    await db.query(`insert into public.team_plans (team_id, free_until) values ($1, now() + interval '30 days')`, [team]);
    await as(LONGER, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team, LONGER]);
    expect(await daysLeft(team)).toBeGreaterThan(29);
  });
});

describe('a person with no days given', () => {
  it('makes a team that starts on Free', async () => {
    await signUp(NOBODY, 'nobody@team.test');
    const team = await teamOf(NOBODY, 'Nothing given');
    expect(await daysLeft(team)).toBeNull();
    expect(await invite(NOBODY, team, 'x@team.test')).toMatch(/needs Pro/);
  });

  it('can neither read the list nor put themselves on it', async () => {
    expect(await refusal(NOBODY, `select * from public.free_pro_people`)).toMatch(/permission denied/);
    expect(await refusal(NOBODY, `insert into public.free_pro_people (email, days) values ('nobody@team.test', 365)`)).toMatch(/permission denied/);
  });
});

it('running the migration again keeps the days already waiting', async () => {
  await give('again@team.test', 7);
  await db.exec(read([THIS!]));
  expect((await db.query(`select days from public.free_pro_people where email = 'again@team.test'`)).rows).toEqual([{ days: 7 }]);
});
