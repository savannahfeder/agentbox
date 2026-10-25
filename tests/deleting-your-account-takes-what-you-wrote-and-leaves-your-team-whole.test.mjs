// DELETING YOUR ACCOUNT TAKES WHAT YOU WROTE, AND LEAVES YOUR TEAM WHOLE.
//
// App Review (guideline 5.1.1(v)) wants an app that makes accounts to delete
// one from inside it, and the plan's reading of it (docs/mobile/PLAN.md, "What
// App Review will look for") is that what the person shared goes too. Nothing
// deleted an account. Read in the migrations on 2026-10-23, deleting the
// auth user alone would have failed for anyone who had used a team: lines,
// message files, projects, teams and invites point at a person with no rule
// for what happens when the person goes, so Postgres refuses the delete.
//
// delete_my_account() deletes the caller only. What they wrote goes with them,
// in shared projects too; a project or team other people still use is handed
// to one of them; one nobody else uses goes. Run here against every migration
// in PGlite, with a stand-in for Supabase's auth schema.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'cloud/supabase/migrations');
const migrations = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

const STAND_IN = `
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated; create role anon; create role service_role;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated;
`;

const ME = '11111111-1111-1111-1111-111111111111';
const MATE = '22222222-2222-2222-2222-222222222222';
const SHARED_TEAM = 'aaaaaaaa-0000-0000-0000-000000000001';
const MY_TEAM = 'aaaaaaaa-0000-0000-0000-000000000002';
const SHARED = 'bbbbbbbb-0000-0000-0000-000000000001';
const PRIVATE = 'bbbbbbbb-0000-0000-0000-000000000002';
let db;

const as = async (person, sql, role = 'authenticated') => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql); } finally { await db.exec('reset role;'); }
};
const one = async (sql) => (await db.query(sql)).rows[0];

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STAND_IN);
  await db.exec(migrations);
  await db.exec(`
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users (id, email, email_confirmed_at) values ('${ME}', 'me@example.com', now()), ('${MATE}', 'mate@example.com', now());
    insert into public.teams (id, name, created_by) values ('${SHARED_TEAM}', 'Astral', '${ME}'), ('${MY_TEAM}', 'Just me', '${ME}');
    insert into public.team_members (team_id, person_id, role) values ('${SHARED_TEAM}', '${ME}', 'owner'), ('${SHARED_TEAM}', '${MATE}', 'member'), ('${MY_TEAM}', '${ME}', 'owner');
    insert into public.team_invites (team_id, email, invited_by) values ('${SHARED_TEAM}', 'new@example.com', '${ME}');
    insert into public.projects (id, team_id, name, created_by) values ('${SHARED}', '${SHARED_TEAM}', 'Launch', '${ME}'), ('${PRIVATE}', '${MY_TEAM}', 'Mine', '${ME}');
    insert into public.lines (project_id, uid, by_person, body) values ('${SHARED}', 'l-me', '${ME}', '{}'), ('${SHARED}', 'l-mate', '${MATE}', '{}'), ('${PRIVATE}', 'l-mine', '${ME}', '{}');
    insert into public.message_files (project_id, name, by_person, data) values ('${SHARED}', 'a.png', '${ME}', 'AA=='), ('${SHARED}', 'b.png', '${MATE}', 'AA==');
    insert into public.phone_projects (owner, device, project, name) values ('${ME}', 'a1b2c3d4e5f6', 'p', 'P'), ('${MATE}', 'a1b2c3d4e5f6', 'p', 'P');
  `);
});
afterEach(() => db.close());

describe('deleting your account', () => {
  it('takes you and everything you wrote, in shared projects too', async () => {
    await as(ME, 'select public.delete_my_account()');
    expect((await one(`select count(*)::int as n from auth.users where id = '${ME}'`)).n).toBe(0);
    expect((await one(`select count(*)::int as n from public.people where id = '${ME}'`)).n).toBe(0);
    expect((await db.query('select uid from public.lines order by uid')).rows.map((r) => r.uid)).toEqual(['l-mate']);
    expect((await db.query('select name from public.message_files')).rows.map((r) => r.name)).toEqual(['b.png']);
    expect((await db.query('select owner from public.phone_projects')).rows.map((r) => r.owner)).toEqual([MATE]);
  });

  it('hands a project and a team your teammates still use to one of them', async () => {
    await as(ME, 'select public.delete_my_account()');
    expect((await one(`select created_by from public.projects where id = '${SHARED}'`)).created_by).toBe(MATE);
    expect((await one(`select role from public.team_members where team_id = '${SHARED_TEAM}' and person_id = '${MATE}'`)).role).toBe('owner');
    expect((await one(`select created_by from public.teams where id = '${SHARED_TEAM}'`)).created_by).toBe(MATE);
    expect((await one(`select invited_by from public.team_invites where team_id = '${SHARED_TEAM}'`)).invited_by).toBeNull();
  });

  it('takes a project and a team nobody else uses', async () => {
    await as(ME, 'select public.delete_my_account()');
    expect((await one(`select count(*)::int as n from public.projects where id = '${PRIVATE}'`)).n).toBe(0);
    expect((await one(`select count(*)::int as n from public.teams where id = '${MY_TEAM}'`)).n).toBe(0);
  });
});

describe('what never happens', () => {
  it('deletes only the one who asks, and nothing of anyone else', async () => {
    await as(MATE, 'select public.delete_my_account()');
    expect((await one(`select count(*)::int as n from auth.users where id = '${ME}'`)).n).toBe(1);
    expect((await one(`select count(*)::int as n from public.lines where by_person = '${ME}'`)).n).toBe(2);
    expect((await one(`select created_by from public.projects where id = '${SHARED}'`)).created_by).toBe(ME);
  });

  it('refuses when nobody is signed in', async () => {
    await expect(as(null, 'select public.delete_my_account()', 'anon')).rejects.toThrow();
    expect((await one('select count(*)::int as n from auth.users')).n).toBe(2);
  });
});
