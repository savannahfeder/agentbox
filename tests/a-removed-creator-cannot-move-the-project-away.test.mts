// A PROJECT'S CREATOR WHO IS REMOVED FROM ITS TEAM CANNOT MOVE IT AWAY.
//
// projects_update let the creator update the row whoever's team it was on.
// Removal keeps created_by, so in the 2026-11-10 security audit a removed
// creator ran an update that read no column (PostgREST sends that shape for a
// PATCH with no filter), moved the project into their own team, read a line
// written after the removal, and the old team lost the project. Now the
// creator must still be on the project's team.
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

let db: PGlite;
async function as(person: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person: string, sql: string, params: unknown[] = []) => (await as(person, sql, params)).rows as Record<string, unknown>[];
const teamOfProject = async (project: string) => ((await db.query(`select team_id from public.projects where id = $1`, [project])).rows[0] as { team_id: string }).team_id;

async function signUp(id: string, email: string, name: string) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
}
async function newTeam(owner: string, name: string) {
  const [t] = await rows(owner, `insert into public.teams (name, created_by) values ($1, $2) returning id`, [name, owner]);
  await as(owner, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [t.id, owner]);
  return t.id as string;
}
async function join(team: string, owner: string, who: string, email: string) {
  await as(owner, `insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)`, [team, email, owner]);
  await as(who, `select public.accept_invite($1)`, [team]);
}
let n = 0;
async function projectBy(creator: string, team: string) {
  n += 1;
  const id = `44444444-4444-4444-4444-${String(n).padStart(12, '0')}`;
  await as(creator, `insert into public.projects (id, team_id, name, created_by) values ($1, $2, $3, $4)`, [id, team, `Plan ${n}`, creator]);
  return id;
}

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  await signUp(MAYA, 'maya@northwind.test', 'Maya');
  await signUp(THEO, 'theo@northwind.test', 'Theo');
}, 60_000);
afterAll(() => db.close());

describe('a creator removed from the project\'s team', () => {
  it('cannot move it into their own team, even with an update that names no row', async () => {
    const northwind = await newTeam(MAYA, 'Northwind');
    const theos = await newTeam(THEO, 'Theo Labs');
    await join(northwind, MAYA, THEO, 'theo@northwind.test');
    const plan = await projectBy(THEO, northwind);
    await as(MAYA, `select public.remove_and_hand_over($1, $2, $3, 'Theo', '[]')`, [northwind, THEO, MAYA]);

    await as(THEO, `with moved as (update public.projects set team_id = $1 returning 1) select count(*) from moved`, [theos]);
    await as(THEO, `update public.projects set team_id = $1`, [theos]);
    expect(await teamOfProject(plan)).toBe(northwind);
  });
});

describe('a creator still on the team', () => {
  it('renames the project and moves it to another team they are on', async () => {
    const first = await newTeam(MAYA, 'First');
    const second = await newTeam(MAYA, 'Second');
    const plan = await projectBy(MAYA, first);
    await as(MAYA, `update public.projects set name = 'Renamed' where id = $1`, [plan]);
    await as(MAYA, `update public.projects set team_id = $1 where id = $2`, [second, plan]);
    expect(await teamOfProject(plan)).toBe(second);
    expect(((await db.query(`select name from public.projects where id = $1`, [plan])).rows[0] as { name: string }).name).toBe('Renamed');
  });
});
