// A FILM SHARED BY ITS LINK PLAYS FOR ANYONE UNTIL THE LINK STOPS.
//
// The Agent Docs film says docs, tables and videos can be shared, and a video
// open in the app had no Share at all: a link's row held the whole file, and
// a film does not fit one. Now the row holds a list of pieces and the pieces
// sit in the private link-files bucket
// (20261109120000_a_film_can_be_shared_by_its_link.sql). Every door is tried
// here against the real migrations in PGlite over a stand-in of Supabase's
// auth and storage: Maya shares, Jun is signed in elsewhere, nobody signed in
// is `anon`.
import { it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mts';

const dir = path.join(import.meta.dirname, '..', 'cloud/supabase/migrations');
const migration = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

const STAND_IN = `
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
grant usage on schema public to anon;
`;
const MAYA = '11111111-1111-1111-1111-111111111111';
const JUN = '44444444-4444-4444-4444-444444444444';
const H1 = 'a'.repeat(40);
const H2 = 'b'.repeat(40);
const list = (pieces: number, size: number, hash: string) => JSON.stringify({ pieces, size, hash });

let db: PGlite;
async function as(person: string | null, sql: string, params: unknown[] = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person: string | null, sql: string, params?: unknown[], role?: string) => (await as(person, sql, params, role)).rows as Record<string, unknown>[];
const refused = async (person: string | null, sql: string, params?: unknown[], role?: string) => { try { await as(person, sql, params, role); return false; } catch { return true; } };
const share = async (who: string, body: string, hash: string, kind = 'video') =>
  (await rows(who, `select public.share_file($1, $2, $3, $4, $5, 1, $6) as t`, ['notes/w-1/cut', 'cut.mp4', kind, 'video/mp4', body, hash]))[0].t as string;
const addPiece = (who: string, name: string) => as(who, `insert into storage.objects (bucket_id, name, owner) values ('link-files', $1, $2)`, [name, who]);
const pieces = async (who: string | null, role = 'authenticated') =>
  (await rows(who, `select name from storage.objects where bucket_id = 'link-files' order by name`, [], role)).map((r) => r.name);

let tok: string;
beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@nw.test', 'Maya Chen'], [JUN, 'jun@else.test', 'Jun']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
  }
  tok = await share(MAYA, list(2, 9_000_000, H1), H1);
  await addPiece(MAYA, `${tok}/${H1}/0`);
  await addPiece(MAYA, `${tok}/${H1}/1`);
}, 60_000);
afterAll(() => db.close());

it('is a private bucket that takes no piece over 10 MB', async () => {
  const { rows: got } = await db.query(`select public, file_size_limit from storage.buckets where id = 'link-files'`);
  expect(got.map((r: Record<string, unknown>) => [r.public, Number(r.file_size_limit)])).toEqual([[false, 10 * 1024 * 1024]]);
});

it('shows anyone with the link the film as its list of pieces, and lets them read each piece', async () => {
  const [v] = await rows(null, `select * from public.file_link_view($1)`, [tok], 'anon');
  expect(v).toMatchObject({ name: 'cut.mp4', kind: 'video', type: 'video/mp4', body: list(2, 9_000_000, H1) });
  expect(await pieces(null, 'anon')).toEqual([`${tok}/${H1}/0`, `${tok}/${H1}/1`]);
  expect(await pieces(JUN)).toEqual([`${tok}/${H1}/0`, `${tok}/${H1}/1`]);
});

it('takes a film only as a list of pieces whose hash is the link\'s', async () => {
  expect(await refused(MAYA, `select public.share_file('notes/w-2/x', 'x.mp4', 'video', 'video/mp4', 'AAAA', 1, $1)`, [H1])).toBe(true);
  expect(await refused(MAYA, `select public.share_file('notes/w-2/x', 'x.mp4', 'video', 'video/mp4', $1, 1, $2)`, [list(1, 10, H1), H2])).toBe(true);
  expect(await refused(MAYA, `select public.share_file('notes/w-2/x', 'x.mp4', 'video', 'video/mp4', $1, 1, $2)`, [list(0, 10, H1), H1])).toBe(true);
});

it('lets only the link\'s owner add a piece, and only a plain one under that link', async () => {
  expect(await refused(JUN, `insert into storage.objects (bucket_id, name, owner) values ('link-files', $1, $2)`, [`${tok}/${H1}/2`, JUN])).toBe(true);
  expect(await refused(null, `insert into storage.objects (bucket_id, name, owner) values ('link-files', $1, null)`, [`${tok}/${H1}/2`], 'anon')).toBe(true);
  for (const name of [`${tok}/${H1}/../x`, `${tok}/${H1}/a`, `${tok}/short/0`, `nosuchlinktokenhere00/${H1}/0`, `${tok}/${H1}/0/1`]) {
    expect(await refused(MAYA, `insert into storage.objects (bucket_id, name, owner) values ('link-files', $1, $2)`, [name, MAYA]), name).toBe(true);
  }
});

it('stops showing the old copy\'s pieces once the link holds a new one, and the owner can clear them', async () => {
  await addPiece(MAYA, `${tok}/${H2}/0`);
  // Before the link moves on, a stranger still sees only the copy it holds.
  expect(await pieces(null, 'anon')).toEqual([`${tok}/${H1}/0`, `${tok}/${H1}/1`]);
  expect(await share(MAYA, list(1, 100, H2), H2)).toBe(tok);
  expect(await pieces(null, 'anon')).toEqual([`${tok}/${H2}/0`]);
  await as(JUN, `delete from storage.objects where bucket_id = 'link-files' and name like $1`, [`${tok}/${H1}/%`]);
  expect(await pieces(MAYA)).toContain(`${tok}/${H1}/0`);
  await as(MAYA, `delete from storage.objects where bucket_id = 'link-files' and name like $1`, [`${tok}/${H1}/%`]);
  expect(await pieces(MAYA)).toEqual([`${tok}/${H2}/0`]);
});

it('shows nobody a piece once the link is stopped, and the owner can still clear them', async () => {
  await as(MAYA, `select public.stop_file_link($1)`, [tok]);
  expect(await pieces(null, 'anon')).toEqual([]);
  expect(await pieces(JUN)).toEqual([]);
  await as(MAYA, `delete from storage.objects where bucket_id = 'link-files'`);
  const { rows: left } = await db.query(`select count(*)::int as n from storage.objects where bucket_id = 'link-files'`);
  expect(left[0]).toEqual({ n: 0 });
});

it('leaves documents, pictures and pages as they were', async () => {
  const t = (await rows(MAYA, `select public.share_file('notes/w-3/plan', 'plan.md', 'markdown', 'text/markdown', '# Plan', 1, 'h') as t`))[0].t;
  expect((await rows(null, `select kind, body from public.file_link_view($1)`, [t], 'anon'))[0]).toEqual({ kind: 'markdown', body: '# Plan' });
  expect(await refused(MAYA, `select public.share_file('notes/w-4/x', 'x.bin', 'binary', 'application/octet-stream', 'x', 1, 'h')`)).toBe(true);
});
