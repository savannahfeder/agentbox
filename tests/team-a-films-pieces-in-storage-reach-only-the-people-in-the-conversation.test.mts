// A FILM'S PIECES IN STORAGE REACH ONLY THE PEOPLE IN THE CONVERSATION.
//
// A film over 10 MB sent to a teammate now goes as 8 MB pieces into the
// private message-files bucket (20261105000000_a_film_goes_in_pieces_through_storage.sql)
// instead of rows of base64, so a 625 MB film fits. Every door on the bucket is
// tried here against the real migrations, in PGlite over a stand-in of
// Supabase's auth and storage: the two people in the conversation, a teammate
// who is not in it, and a stranger.
import { it, expect, beforeAll, afterAll } from 'vitest';
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
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid, unique (bucket_id, name));
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated, anon;
`;
const GRANTS = `
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
`;

const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const PRIYA = '33333333-3333-3333-3333-333333333333';
const JUN = '44444444-4444-4444-4444-444444444444';
const TALK = '55555555-5555-5555-5555-555555555555';
const PIECE = `${TALK}/0a1b2c3d4e5f-oct-7-intro.mp4.p1of79`;
let db;

async function as(person, sql, params = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params, role) => (await as(person, sql, params, role)).rows;
const refused = async (person, sql, params) => {
  try { await as(person, sql, params); return false; } catch { return true; }
};
const add = (person, name) => as(person, `insert into storage.objects (bucket_id, name, owner) values ('message-files', $1, $2)`, [name, person]);
const names = async (person, role) => (await rows(person, `select name from storage.objects where bucket_id = 'message-files' order by name`, [], role)).map((r) => r.name);

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
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
  await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by, direct) values ($1, $2, 'Theo', 'people', $3, true)`, [TALK, team.id, MAYA]);
  await as(MAYA, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [TALK, THEO]);
  await add(MAYA, PIECE);
}, 60_000);
afterAll(() => db.close());

it('is a private bucket that takes no piece over 10 MB', async () => {
  const { rows: got } = await db.query(`select public, file_size_limit from storage.buckets where id = 'message-files'`);
  expect(got.map((r) => [r.public, Number(r.file_size_limit)])).toEqual([[false, 10 * 1024 * 1024]]);
});

it('lets the other person in the conversation read a piece, and send one back', async () => {
  expect(await names(THEO)).toEqual([PIECE]);
  await add(THEO, `${TALK}/9f8e7d6c5b4a-reply.mov.p1of2`);
  expect(await names(MAYA)).toEqual([PIECE, `${TALK}/9f8e7d6c5b4a-reply.mov.p1of2`]);
});

it('shows a teammate who is not in the conversation nothing, and lets them add nothing', async () => {
  expect(await names(PRIYA)).toEqual([]);
  expect(await refused(PRIYA, `insert into storage.objects (bucket_id, name, owner) values ('message-files', $1, $2)`, [`${TALK}/aaaaaaaaaaaa-p.mp4.p1of2`, PRIYA])).toBe(true);
});

it('shows a stranger and somebody signed out nothing', async () => {
  expect(await names(JUN)).toEqual([]);
  expect(await names(null, 'anon')).toEqual([]);
  expect(await refused(JUN, `insert into storage.objects (bucket_id, name, owner) values ('message-files', $1, $2)`, [`${TALK}/aaaaaaaaaaaa-j.mp4.p1of2`, JUN])).toBe(true);
});

it('takes only a plain name inside a conversation folder', async () => {
  for (const name of [`${TALK}/../x.mp4`, `${TALK}/sub/x.mp4`, `${TALK}/.hidden`, 'x.mp4', 'not-a-project/x.mp4', `66666666-6666-6666-6666-666666666666/x.mp4`]) {
    expect(await refused(MAYA, `insert into storage.objects (bucket_id, name, owner) values ('message-files', $1, $2)`, [name, MAYA]), name).toBe(true);
  }
});

it('never lets a piece be swapped or deleted once it is there', async () => {
  await as(THEO, `update storage.objects set name = $1 where name = $2`, [`${TALK}/ffffffffffff-swap.mp4`, PIECE]);
  await as(THEO, `delete from storage.objects where name = $1`, [PIECE]);
  expect(await names(MAYA)).toContain(PIECE);
});
