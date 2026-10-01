// THE SHARED DATABASE SHOWS A PERSON THEIR OWN TEAM AND NOTHING ELSE.
//
// cloud/migrations/0001_team.sql is the whole of the shared part: people,
// teams, shared projects, their ledger lines, and the title-free activity of
// private work. Every rule about who sees what lives in its row level
// security, so a bug there is a teammate (or a stranger) reading another
// team's work. These tests run the real migration in an in-process Postgres
// (PGlite) with Supabase's `auth` schema stood in, sign people in by setting
// the claim Supabase sets, and try every door from both sides.
//
// No Docker and no network: the Mac this runs on has other work on it.
import { it, expect, beforeAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every migration, in the order Supabase applies them.
const migrationsDir = path.join(root, 'cloud/supabase/migrations');
const migration = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

// What a Supabase project already has before our migration runs.
const SUPABASE_STAND_IN = `
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role authenticated;
create role anon;
create role service_role;
create publication supabase_realtime;
`;
// Only what Supabase itself grants; the table rights come from our own
// migrations, so a missing grant there fails here.
const GRANTS = `
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`;

const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const JUN = '33333333-3333-3333-3333-333333333333';
const PROJECT = '44444444-4444-4444-4444-444444444444';
const SECRET = '55555555-5555-5555-5555-555555555555';

let db;
let team;

// Run one statement as a signed-in person, the way PostgREST does.
async function as(person, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const refused = async (person, sql, params) => {
  try { await as(person, sql, params); return false; } catch { return true; }
};

async function signUp(id, email, fullName) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { full_name: fullName, avatar_url: `https://faces/${fullName}.jpg` }]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  await signUp(MAYA, 'maya@northwind.test', 'Maya Chen');
  await signUp(THEO, 'theo@northwind.test', 'Theo Park');
  await signUp(JUN, 'jun@elsewhere.test', 'Jun Ito');
  [team] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, MAYA]);
  await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'THEO@northwind.test', $2)`, [team.id, MAYA]);
  await as(THEO, `select public.accept_invites()`);
}, 60_000);

describe('people', () => {
  it('turns a sign-in into a person named from their Google profile', async () => {
    const [me] = await rows(MAYA, `select name, avatar_url from public.people where id = $1`, [MAYA]);
    expect(me).toEqual({ name: 'Maya Chen', avatar_url: 'https://faces/Maya Chen.jpg' });
  });

  it('joins the team that invited your email, whatever its case', async () => {
    const members = await rows(THEO, `select person_id from public.team_members order by person_id`);
    expect(members.map((m) => m.person_id)).toEqual([MAYA, THEO]);
  });

  it('shows teammates to each other and nobody to a stranger', async () => {
    expect((await rows(THEO, `select id from public.people`)).length).toBe(2);
    expect((await rows(JUN, `select id from public.people`)).map((p) => p.id)).toEqual([JUN]);
    expect(await rows(JUN, `select id from public.teams`)).toEqual([]);
  });

  it('will not let a stranger add themselves to a team', async () => {
    expect(await refused(JUN, `insert into public.team_members (team_id, person_id) values ($1, $2)`, [team.id, JUN])).toBe(true);
  });
});

describe('a project shared with the whole team', () => {
  beforeAll(async () => {
    // Shared the way the app shares, as an upsert: Postgres holds the proposed
    // row to the read policy too, which a plain insert never exercised.
    await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by) values ($1, $2, 'Website', 'team', $3)
                    on conflict (id) do update set name = excluded.name, visibility = excluded.visibility`, [PROJECT, team.id, MAYA]);
  });

  it('lets a teammate read it and add lines as themselves', async () => {
    expect((await rows(THEO, `select name from public.projects`)).map((p) => p.name)).toEqual(['Website']);
    await as(THEO, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-theo-1', $2, '{"id":"w-aaaaaa"}')`, [PROJECT, THEO]);
    expect((await rows(MAYA, `select uid from public.lines where project_id = $1`, [PROJECT])).map((l) => l.uid)).toEqual(['l-theo-1']);
  });

  it('will not let anyone write a line as somebody else', async () => {
    expect(await refused(THEO, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-forged', $2, '{}')`, [PROJECT, MAYA])).toBe(true);
  });

  it('stores a line pushed twice once', async () => {
    const push = `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-theo-2', $2, '{}') on conflict (uid) do nothing`;
    await as(THEO, push, [PROJECT, THEO]);
    await as(THEO, push, [PROJECT, THEO]);
    expect((await rows(THEO, `select count(*)::int as n from public.lines where uid = 'l-theo-2'`))[0].n).toBe(1);
  });

  it('never lets a line be changed or deleted', async () => {
    await as(THEO, `update public.lines set body = '{"x":1}' where uid = 'l-theo-1'`);
    await as(THEO, `delete from public.lines where uid = 'l-theo-1'`);
    const [line] = await rows(MAYA, `select body from public.lines where uid = 'l-theo-1'`);
    expect(line.body).toEqual({ id: 'w-aaaaaa' });
  });

  it('shows a stranger nothing of it', async () => {
    expect(await rows(JUN, `select id from public.projects`)).toEqual([]);
    expect(await rows(JUN, `select uid from public.lines`)).toEqual([]);
    expect(await refused(JUN, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-jun', $2, '{}')`, [PROJECT, JUN])).toBe(true);
  });
});

describe('a project shared with specific people', () => {
  beforeAll(async () => {
    await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by) values ($1, $2, 'Board deck', 'people', $3)`, [SECRET, team.id, MAYA]);
    await as(MAYA, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-maya-secret', $2, '{}')`, [SECRET, MAYA]);
  });

  it('is invisible to a teammate who is not on it', async () => {
    expect((await rows(THEO, `select name from public.projects order by name`)).map((p) => p.name)).toEqual(['Website']);
    expect(await rows(THEO, `select uid from public.lines where project_id = $1`, [SECRET])).toEqual([]);
  });

  it('opens to a teammate once its maker adds them', async () => {
    await as(MAYA, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [SECRET, THEO]);
    expect((await rows(THEO, `select uid from public.lines where project_id = $1`, [SECRET])).map((l) => l.uid)).toEqual(['l-maya-secret']);
  });

  it('can only be opened by the person who made it', async () => {
    expect(await refused(THEO, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [SECRET, JUN])).toBe(true);
  });
});

describe('private work on the Team page', () => {
  it('shows a teammate a title-free line and a stranger nothing', async () => {
    await as(MAYA, `insert into public.private_activity (person_id, task_key, state, moved_at) values ($1, 'k1', 'run', now())`, [MAYA]);
    expect((await rows(THEO, `select state from public.private_activity`)).map((a) => a.state)).toEqual(['run']);
    expect(await rows(JUN, `select state from public.private_activity`)).toEqual([]);
  });

  it('will not let anyone write activity as somebody else', async () => {
    expect(await refused(THEO, `insert into public.private_activity (person_id, task_key, state, moved_at) values ($1, 'k2', 'run', now())`, [MAYA])).toBe(true);
  });
});
