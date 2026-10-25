// HER FILES FOR THE PHONE ARE HERS ALONE (20261017000000_phone_files.sql).
//
// The Mac now uploads the pictures, films and pages a thread names to a
// private bucket so the phone can draw them with the Mac shut. Every migration
// runs here, in order, in PGlite, over a stand-in of Supabase Storage (its
// buckets and objects tables, row level security on, and storage.foldername),
// trying each door as the owner, a stranger, and nobody.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
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
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated;
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

const OWNER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';
const DEV = 'a1b2c3d4e5f6';
const NAME = `${'ab'.repeat(32)}.png`;
let db;

async function as(person, sql, params = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const refused = async (person, sql, params, role) => {
  try { await as(person, sql, params, role); return false; } catch { return true; }
};
const add = (person, name) => as(person, `insert into storage.objects (bucket_id, name, owner) values ('phone-files', $1, $2)`, [name, person]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
}, 60_000);
afterAll(() => db.close());

describe('the bucket', () => {
  it('is private, and no file in it is over 25 MB', async () => {
    const { rows } = await db.query(`select public, file_size_limit from storage.buckets where id = 'phone-files'`);
    expect(rows.map((r) => [r.public, Number(r.file_size_limit)])).toEqual([[false, 26214400]]);
  });
});

describe('her files', () => {
  it('she adds in her own folder, named by what is in them, and reads them back', async () => {
    await add(OWNER, `${OWNER}/${DEV}/${NAME}`);
    const { rows } = await as(OWNER, `select name from storage.objects where bucket_id = 'phone-files'`);
    expect(rows.map((r) => r.name)).toEqual([`${OWNER}/${DEV}/${NAME}`]);
  });

  it('nobody adds in somebody else\'s folder, or under a name that is not a file\'s', async () => {
    expect(await refused(STRANGER, `insert into storage.objects (bucket_id, name, owner) values ('phone-files', $1, $2)`, [`${OWNER}/${DEV}/${'cd'.repeat(32)}.png`, STRANGER])).toBe(true);
    for (const name of [`${OWNER}/${DEV}/../x.png`, `${OWNER}/${DEV}/notes.txt`, `${OWNER}/${NAME}`, `${OWNER}/${DEV}/sub/${NAME}`]) {
      expect(await refused(OWNER, `insert into storage.objects (bucket_id, name, owner) values ('phone-files', $1, $2)`, [name, OWNER]), name).toBe(true);
    }
  });

  it('a stranger and somebody signed out see none of them and delete none of them', async () => {
    expect((await as(STRANGER, `select name from storage.objects`)).rows).toEqual([]);
    expect((await as(null, `select name from storage.objects`, [], 'anon')).rows).toEqual([]);
    await as(STRANGER, `delete from storage.objects where bucket_id = 'phone-files'`);
    expect((await as(OWNER, `select count(*)::int as n from storage.objects`)).rows[0].n).toBe(1);
  });

  it('nobody replaces one, not even she: a name is what is in it', async () => {
    await as(OWNER, `update storage.objects set name = $1 where bucket_id = 'phone-files'`, [`${OWNER}/${DEV}/${'ef'.repeat(32)}.png`]);
    expect((await as(OWNER, `select name from storage.objects`)).rows.map((r) => r.name)).toEqual([`${OWNER}/${DEV}/${NAME}`]);
  });

  it('she deletes her own', async () => {
    await as(OWNER, `delete from storage.objects where bucket_id = 'phone-files'`);
    expect((await as(OWNER, `select count(*)::int as n from storage.objects`)).rows[0].n).toBe(0);
  });
});
