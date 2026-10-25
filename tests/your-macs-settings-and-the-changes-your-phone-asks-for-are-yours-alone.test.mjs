// YOUR MAC'S SETTINGS, AND THE CHANGES YOUR PHONE ASKS FOR, ARE YOURS ALONE.
//
// The phone app's Settings had two rows because nothing of the Mac's settings
// reached the account the phone reads, and a command could only name a thread
// in a project (`project not null`, and a kind check of ten thread verbs). A
// change to a setting belongs to a computer, not to a project. Measured the way
// tests/the-phone-rows-are-hers-alone-in-the-database.test.mjs measures the
// other phone tables: every migration, in order, in PGlite, with the pre-2025
// Supabase default grants switched on, trying each door as the owner, a
// stranger, and nobody.
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
`;
const GRANTS = `
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
`;

const OWNER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';
const DEV = 'a1b2c3d4e5f6';
const OTHER_DEV = '0f0e0d0c0b0a';
let db;

async function as(person, sql, params = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params, role) => (await as(person, sql, params, role)).rows;
const refused = async (person, sql, params, role) => {
  try { await as(person, sql, params, role); return false; } catch { return true; }
};
const SETTINGS = '{"v":1,"workspace":{"adhdMode":true}}';
const putSettings = (person, device = DEV, settings = SETTINGS) => as(person,
  `insert into public.phone_settings (device, name, settings) values ($1, 'Studio Mac', $2::jsonb)
   on conflict (owner, device) do update set name = excluded.name, settings = excluded.settings, updated_at = now()`, [device, settings]);
const setting = (person = OWNER, { project = null, item = null } = {}) => as(person,
  `insert into public.phone_commands (device, project, item, kind, payload)
   values ($1, $2, $3, 'setting', '{"scope":"workspace","key":"adhdMode","value":false}') returning id, project, item`, [DEV, project, item]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email] of [[OWNER, 'owner@example.com'], [STRANGER, 'stranger@example.com']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), '{}')`, [id, email]);
  }
  await as(OWNER, `insert into public.phone_projects (device, project, name) values ($1, 'alpha', 'Alpha')`, [DEV]);
}, 60_000);
afterAll(() => db.close());

describe('the settings your Mac sends', () => {
  it('are one row per computer, written again in place', async () => {
    await putSettings(OWNER);
    await putSettings(OWNER, DEV, '{"v":1,"workspace":{"adhdMode":false}}');
    await putSettings(OWNER, OTHER_DEV);
    const got = await rows(OWNER, `select device, name, settings from public.phone_settings order by device`);
    expect(got).toEqual([
      { device: OTHER_DEV, name: 'Studio Mac', settings: { v: 1, workspace: { adhdMode: true } } },
      { device: DEV, name: 'Studio Mac', settings: { v: 1, workspace: { adhdMode: false } } },
    ]);
  });

  it('are read and written by nobody else', async () => {
    await putSettings(OWNER);
    expect(await rows(STRANGER, `select * from public.phone_settings`)).toEqual([]);
    await as(STRANGER, `update public.phone_settings set settings = '{}'::jsonb`);
    await as(STRANGER, `delete from public.phone_settings`);
    expect((await rows(OWNER, `select count(*)::int as n from public.phone_settings`))[0].n).toBe(2);
    expect(await refused(STRANGER, `insert into public.phone_settings (owner, device, name, settings) values ($1, $2, 'x', '{}')`, [OWNER, 'cccccccccccc'])).toBe(true);
    expect(await refused(null, `select * from public.phone_settings`, [], 'anon')).toBe(true);
  });

  it('refuse a computer id that is not one, and a copy too big to be settings', async () => {
    expect(await refused(OWNER, `insert into public.phone_settings (device, name, settings) values ('../x', 'x', '{}')`)).toBe(true);
    const huge = JSON.stringify({ pad: 'x'.repeat(200_001) });
    expect(await refused(OWNER, `insert into public.phone_settings (device, name, settings) values ($1, 'x', $2::jsonb)`, ['dddddddddddd', huge])).toBe(true);
  });
});

describe('a change your phone asks for', () => {
  it('names a computer and no project or thread', async () => {
    const { rows: [c] } = await setting();
    expect(c).toMatchObject({ project: null, item: null });
  });

  it('is refused when it names a project or a thread', async () => {
    expect(await refused(OWNER, `insert into public.phone_commands (device, project, kind, payload) values ($1, 'alpha', 'setting', '{}')`, [DEV])).toBe(true);
    expect(await refused(OWNER, `insert into public.phone_commands (device, item, kind, payload) values ($1, 'w-1', 'setting', '{}')`, [DEV])).toBe(true);
  });

  it('leaves every thread command needing its project', async () => {
    expect(await refused(OWNER, `insert into public.phone_commands (device, item, kind, payload) values ($1, 'w-1', 'reply', '{"text":"yes"}')`, [DEV])).toBe(true);
    expect(await refused(OWNER, `insert into public.phone_commands (device, kind, payload) values ($1, 'new', '{"title":"x"}')`, [DEV])).toBe(true);
    const ok = await rows(OWNER, `insert into public.phone_commands (device, project, item, kind, payload) values ($1, 'alpha', 'w-1', 'reply', '{"text":"yes"}') returning kind`, [DEV]);
    expect(ok).toEqual([{ kind: 'reply' }]);
  });

  it('is claimed and marked once, like any command, and read by nobody else', async () => {
    const { rows: [c] } = await setting();
    await as(OWNER, `update public.phone_commands set claimed_at = now() where id = $1`, [c.id]);
    await as(OWNER, `update public.phone_commands set taken_at = now(), outcome = 'done' where id = $1`, [c.id]);
    expect(await refused(OWNER, `update public.phone_commands set taken_at = null, outcome = null where id = $1`, [c.id])).toBe(true);
    expect(await refused(OWNER, `update public.phone_commands set payload = '{}'::jsonb where id = $1`, [c.id])).toBe(true);
    expect(await rows(STRANGER, `select id from public.phone_commands where id = $1`, [c.id])).toEqual([]);
  });

  it('is still refused for a kind nobody made', async () => {
    expect(await refused(OWNER, `insert into public.phone_commands (device, kind, payload) values ($1, 'delete', '{}')`, [DEV])).toBe(true);
  });
});

describe('a database that already ran this file', () => {
  it('runs it again without complaint', async () => {
    const file = fs.readdirSync(migrationsDir).find((f) => f.includes('phone_settings'));
    await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    expect((await rows(OWNER, `select count(*)::int as n from public.phone_settings`))[0].n).toBe(2);
  });
});
