// A PICTURE SENT IN A CONVERSATION IS READ BY ITS PEOPLE AND NOBODY ELSE.
//
// w-140ac855b1, 2026-10-13: pictures in messages never left the sender's Mac,
// so the cloud now keeps the files a conversation's messages link to
// (cloud/supabase/migrations/20261013000000_message_files.sql). A screenshot
// is often the most private thing in a conversation, so every door on that
// table is tried here against the real migrations, in an in-process Postgres
// (PGlite) with Supabase's `auth` schema stood in: the two people in it, a
// teammate who is not, and a stranger.
import { it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

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
const PRIYA = '33333333-3333-3333-3333-333333333333';
const JUN = '44444444-4444-4444-4444-444444444444';
const TALK = '55555555-5555-5555-5555-555555555555';

let db;

async function as(person, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const refused = async (person, sql, params) => {
  try { await as(person, sql, params); return false; } catch { return true; }
};
const put = (person, name, by = person, data = 'iVBORw0KGgo=') => as(person,
  `insert into public.message_files (project_id, name, by_person, data) values ($1, $2, $3, $4) on conflict (project_id, name) do nothing`,
  [TALK, name, by, data]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@nw.test', 'Maya'], [THEO, 'theo@nw.test', 'Theo'], [PRIYA, 'priya@nw.test', 'Priya'], [JUN, 'jun@elsewhere.test', 'Jun']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
  }
  const [team] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, MAYA]);
  for (const email of ['theo@nw.test', 'priya@nw.test']) await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)`, [team.id, email, MAYA]);
  await as(THEO, `select public.accept_invite($1)`, [team.id]);
  await as(PRIYA, `select public.accept_invite($1)`, [team.id]);
  // Maya's conversation with Theo, the way the app makes one.
  await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by, direct) values ($1, $2, 'Theo', 'people', $3, true)`, [TALK, team.id, MAYA]);
  await as(MAYA, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [TALK, THEO]);
  await put(MAYA, 'k2x9ab-q1w2e3-pasted-1042.png');
}, 60_000);
afterAll(() => db.close());

it('lets the other person in the conversation read the picture', async () => {
  expect(await rows(THEO, `select name, data from public.message_files where project_id = $1`, [TALK]))
    .toEqual([{ name: 'k2x9ab-q1w2e3-pasted-1042.png', data: 'iVBORw0KGgo=' }]);
});

it('lets them send one back, as themselves', async () => {
  await put(THEO, 'from-theo.png');
  expect((await rows(MAYA, `select name from public.message_files where by_person = $1`, [THEO])).map((r) => r.name)).toEqual(['from-theo.png']);
});

it('shows a teammate who is not in the conversation nothing, and lets them add nothing', async () => {
  expect(await rows(PRIYA, `select name from public.message_files`)).toEqual([]);
  expect(await refused(PRIYA, `insert into public.message_files (project_id, name, by_person, data) values ($1, 'p.png', $2, 'x')`, [TALK, PRIYA])).toBe(true);
});

it('shows a stranger nothing', async () => {
  expect(await rows(JUN, `select name from public.message_files`)).toEqual([]);
  expect(await rows(null, `select name from public.message_files`)).toEqual([]);
});

it('will not let anyone send a picture as somebody else', async () => {
  expect(await refused(THEO, `insert into public.message_files (project_id, name, by_person, data) values ($1, 'forged.png', $2, 'x')`, [TALK, MAYA])).toBe(true);
});

it('never lets a picture be swapped or deleted once it is there', async () => {
  await put(THEO, 'k2x9ab-q1w2e3-pasted-1042.png', THEO, 'c3dhcHBlZA==');
  await as(THEO, `update public.message_files set data = 'c3dhcHBlZA==' where name = 'k2x9ab-q1w2e3-pasted-1042.png'`).catch(() => {});
  await as(THEO, `delete from public.message_files where name = 'k2x9ab-q1w2e3-pasted-1042.png'`).catch(() => {});
  const [file] = await rows(MAYA, `select data, by_person from public.message_files where name = 'k2x9ab-q1w2e3-pasted-1042.png'`);
  expect(file).toEqual({ data: 'iVBORw0KGgo=', by_person: MAYA });
});

it('refuses a name that is a path, and a file over ten megabytes', async () => {
  for (const name of ['../escape.png', 'sub/dir.png', '.hidden', '']) {
    expect(await refused(MAYA, `insert into public.message_files (project_id, name, by_person, data) values ($1, $2, $3, 'x')`, [TALK, name, MAYA]), name).toBe(true);
  }
  expect(await refused(MAYA, `insert into public.message_files (project_id, name, by_person, data) values ($1, 'big.png', $2, repeat('A', 14000001))`, [TALK, MAYA])).toBe(true);
  // The boundary on the other side: exactly at the limit goes in.
  await put(MAYA, 'at-limit.png', MAYA, 'A'.repeat(14_000_000));
  expect((await rows(THEO, `select length(data)::int as n from public.message_files where name = 'at-limit.png'`))[0].n).toBe(14_000_000);
});
