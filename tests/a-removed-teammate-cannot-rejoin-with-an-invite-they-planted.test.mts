// A TEAMMATE THE OWNER REMOVES STAYS OFF THE TEAM.
//
// Any member may invite any email, their own included, and removal only
// deleted the membership row: the 2026-11-10 security audit planted a
// self-invite and an alt-address invite while a member, was removed, and
// accept_invite put both accounts back on the team, reading a line written
// after the removal. Rooms had closed the same door on 2026-10-28 (an invite
// works only while its sender is still in the room); teams had not. These
// run every real migration in PGlite with Supabase's auth stood in.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'cloud/supabase/migrations');
const migration = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

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

const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const THEO_ALT = '33333333-3333-3333-3333-333333333333';
const JUN = '44444444-4444-4444-4444-444444444444';
const ROSA = '55555555-5555-5555-5555-555555555555';
const KAI = '66666666-6666-6666-6666-666666666666';

let db: PGlite;

async function as(person: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person}', false); set role authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}
const rows = async (person: string, sql: string, params: unknown[] = []) => (await as(person, sql, params)).rows as Record<string, unknown>[];
const refusal = async (person: string, sql: string, params: unknown[] = []) => {
  try { await as(person, sql, params); return null; } catch (e) { return String((e as Error).message); }
};
const onTeam = async (team: string, person: string) =>
  (await db.query(`select 1 from public.team_members where team_id = $1 and person_id = $2`, [team, person])).rows.length === 1;

async function signUp(id: string, email: string, name: string) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
}

async function teamOf(owner: string, name: string, members: [string, string][]) {
  const [t] = await rows(owner, `insert into public.teams (name, created_by) values ($1, $2) returning id`, [name, owner]);
  const team = t.id as string;
  await as(owner, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team, owner]);
  for (const [id, email] of members) {
    await as(owner, `insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)`, [team, email, owner]);
    await as(id, `select public.accept_invite($1)`, [team]);
  }
  return team;
}

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  await signUp(MAYA, 'maya@northwind.test', 'Maya');
  await signUp(THEO, 'theo@northwind.test', 'Theo');
  await signUp(THEO_ALT, 'theo.alt@elsewhere.test', 'Theo Alt');
  await signUp(JUN, 'jun@northwind.test', 'Jun');
  await signUp(ROSA, 'rosa@northwind.test', 'Rosa');
  await signUp(KAI, 'kai@northwind.test', 'Kai');
}, 60_000);
afterAll(() => db.close());

describe('removed by the owner', () => {
  it('refuses the invite they made for themselves and the one for their other address', async () => {
    const team = await teamOf(MAYA, 'Northwind', [[THEO, 'theo@northwind.test']]);
    await as(THEO, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo@northwind.test', $2)`, [team, THEO]);
    await as(THEO, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo.alt@elsewhere.test', $2)`, [team, THEO]);
    await as(MAYA, `select public.remove_and_hand_over($1, $2, $3, 'Theo', '[]')`, [team, THEO, MAYA]);

    expect(await rows(THEO, `select * from public.pending_invites() where team_id = $1`, [team])).toEqual([]);
    expect(await refusal(THEO, `select public.accept_invite($1)`, [team])).toMatch(/no invite/);
    expect(await refusal(THEO_ALT, `select public.accept_invite($1)`, [team])).toMatch(/no invite/);
    expect(await onTeam(team, THEO)).toBe(false);
    expect(await onTeam(team, THEO_ALT)).toBe(false);
  });

  it('refuses them the same way when the owner deletes the membership directly', async () => {
    const team = await teamOf(MAYA, 'Direct', [[THEO, 'theo@northwind.test']]);
    await as(THEO, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo@northwind.test', $2)`, [team, THEO]);
    await as(MAYA, `delete from public.team_members where team_id = $1 and person_id = $2`, [team, THEO]);

    expect(await refusal(THEO, `select public.accept_invite($1)`, [team])).toMatch(/no invite/);
    expect(await onTeam(team, THEO)).toBe(false);
  });

  it('lets them back when a current member invites them again', async () => {
    const team = await teamOf(MAYA, 'Second chance', [[THEO, 'theo@northwind.test']]);
    await as(MAYA, `select public.remove_and_hand_over($1, $2, $3, 'Theo', '[]')`, [team, THEO, MAYA]);
    await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo@northwind.test', $2)`, [team, MAYA]);

    expect((await rows(THEO, `select invited_by from public.pending_invites() where team_id = $1`, [team])).map((r) => r.invited_by)).toEqual([MAYA]);
    expect(await refusal(THEO, `select public.accept_invite($1)`, [team])).toBeNull();
    expect(await onTeam(team, THEO)).toBe(true);
  });
});

describe('an invite from someone who has since left', () => {
  it('no longer lets anyone in', async () => {
    const team = await teamOf(MAYA, 'Leavers', [[JUN, 'jun@northwind.test']]);
    await as(JUN, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'rosa@northwind.test', $2)`, [team, JUN]);
    await as(JUN, `delete from public.team_members where team_id = $1 and person_id = $2`, [team, JUN]);

    expect(await rows(ROSA, `select * from public.pending_invites() where team_id = $1`, [team])).toEqual([]);
    expect(await refusal(ROSA, `select public.accept_invite($1)`, [team])).toMatch(/no invite/);
    expect(await onTeam(team, ROSA)).toBe(false);
  });
});

describe('an ordinary invite', () => {
  it('still lets the invited person join while its sender is on the team', async () => {
    const team = await teamOf(MAYA, 'Ordinary', [[JUN, 'jun@northwind.test']]);
    await as(JUN, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'kai@northwind.test', $2)`, [team, JUN]);

    expect((await rows(KAI, `select invited_by from public.pending_invites() where team_id = $1`, [team])).map((r) => r.invited_by)).toEqual([JUN]);
    expect(await refusal(KAI, `select public.accept_invite($1)`, [team])).toBeNull();
    expect(await onTeam(team, KAI)).toBe(true);
  });
});
