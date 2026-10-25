// YOUR PHONE'S ALERT ADDRESS IS YOURS ALONE, AND GOES WITH YOUR ACCOUNT.
//
// The phone app could get an Expo push token and send itself a test alert,
// and nothing else knew the token (2026-10-23): no computer could reach the
// lock screen. push_devices is where the phone leaves it for its own
// computers to read. A token is an address anyone holding it can send to, so
// it is readable by its owner and nobody else, only a well-formed Expo token
// is taken, and deleting the account takes it too. Run here against every
// migration in PGlite, with a stand-in for Supabase's auth schema.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'cloud/supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const migrations = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

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
const TOKEN = 'ExponentPushToken[abcdefghij0123456789AB]';
const MATE_TOKEN = 'ExponentPushToken[zyxwvutsrq9876543210ZY]';
let db;

const as = async (person, sql, role = 'authenticated') => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql); } finally { await db.exec('reset role;'); }
};
const add = (person, token, platform = 'ios') => as(person, `insert into public.push_devices (token, platform, app_version) values ('${token}', '${platform}', '1.0.0')`);

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STAND_IN);
  await db.exec(migrations);
  await db.exec(`
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users (id, email, email_confirmed_at) values ('${ME}', 'me@example.com', now()), ('${MATE}', 'mate@example.com', now());
  `);
});
afterEach(() => db.close());

describe('push_devices', () => {
  it('is its own migration', () => {
    expect(files).toContain('20261025000000_push_devices.sql');
  });

  it('takes your phone under your own id, and gives it back only to you', async () => {
    await add(ME, TOKEN);
    await add(MATE, MATE_TOKEN);
    expect((await as(ME, 'select owner, token, platform from public.push_devices')).rows).toEqual([{ owner: ME, token: TOKEN, platform: 'ios' }]);
    expect((await as(MATE, 'select token from public.push_devices')).rows.map((r) => r.token)).toEqual([MATE_TOKEN]);
  });

  it('never lets you write, change or delete somebody else\'s', async () => {
    await add(MATE, MATE_TOKEN);
    await expect(as(ME, `insert into public.push_devices (owner, token, platform) values ('${MATE}', '${TOKEN}', 'ios')`)).rejects.toThrow();
    await as(ME, `update public.push_devices set app_version = 'x' where token = '${MATE_TOKEN}'`);
    await as(ME, `delete from public.push_devices where token = '${MATE_TOKEN}'`);
    expect((await db.query('select app_version from public.push_devices')).rows).toEqual([{ app_version: '1.0.0' }]);
  });

  it('gives nothing to somebody signed out', async () => {
    await add(ME, TOKEN);
    await expect(as(null, 'select token from public.push_devices', 'anon')).rejects.toThrow();
  });

  it('takes the same phone again as one row, its moment moved on', async () => {
    await add(ME, TOKEN);
    await as(ME, `insert into public.push_devices (token, platform, app_version, updated_at) values ('${TOKEN}', 'ios', '1.0.1', now() + interval '1 hour')
      on conflict (owner, token) do update set app_version = excluded.app_version, updated_at = excluded.updated_at`);
    const rows = (await db.query('select app_version, updated_at > now() as moved from public.push_devices')).rows;
    expect(rows).toEqual([{ app_version: '1.0.1', moved: true }]);
  });

  it('refuses what is not an Expo token, and a platform it does not know', async () => {
    for (const bad of ['', 'abc', 'ExponentPushToken[]', 'ExponentPushToken[short]', 'ExponentPushToken[has space here!!]', `ExponentPushToken[${'a'.repeat(201)}]`]) {
      await expect(add(ME, bad), bad).rejects.toThrow();
    }
    await expect(add(ME, TOKEN, 'web')).rejects.toThrow();
    await expect(as(ME, `insert into public.push_devices (token, platform, app_version) values ('${TOKEN}', 'ios', '${'9'.repeat(41)}')`)).rejects.toThrow();
  });

  it('goes when the account is deleted', async () => {
    await add(ME, TOKEN);
    await add(MATE, MATE_TOKEN);
    await as(ME, 'select public.delete_my_account()');
    expect((await db.query('select token from public.push_devices')).rows.map((r) => r.token)).toEqual([MATE_TOKEN]);
  });

  it('can be run twice', async () => {
    await add(ME, TOKEN);
    await db.exec(fs.readFileSync(path.join(dir, '20261025000000_push_devices.sql'), 'utf8'));
    expect((await db.query('select count(*)::int as n from public.push_devices')).rows[0].n).toBe(1);
  });
});
