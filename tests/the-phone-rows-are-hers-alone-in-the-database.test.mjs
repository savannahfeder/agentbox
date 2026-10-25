// What broke: Codex's review of step 1 (2026-10-14, finding 5) ran the phone
// migration in an in-process Postgres and showed two holes. On a Supabase
// project made before 2025, every new table is granted to every role by
// default, and the column grant on top took nothing away, so an owner could
// rewrite a command's kind and payload after the computer had read it. And
// with the column grant alone a phone could set `taken_at` back to empty and
// have a command done twice. Measured here the same way: every migration, in
// order, in PGlite, with that old default switched on, trying each door as the
// owner, a stranger, and nobody.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'cloud/supabase/migrations');
const migration = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

// What a Supabase project already has, INCLUDING the default grants of a
// project made before 2025, which is the case that hid the hole.
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
const command = async (person = OWNER, extra = '') => (await rows(person,
  `insert into public.phone_commands (device, project, item, kind, payload${extra ? ', ' + extra.split('=')[0] : ''})
   values ($1, 'alpha', 'w-1', 'reply', '{"text":"yes"}'${extra ? ', ' + extra.split('=')[1] : ''}) returning id, created_at, taken_at, outcome`, [DEV]))[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email] of [[OWNER, 'owner@example.com'], [STRANGER, 'stranger@example.com']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), '{}')`, [id, email]);
  }
  await as(OWNER, `insert into public.phone_projects (device, project, name) values ($1, 'alpha', 'Alpha')`, [DEV]);
  await as(OWNER, `insert into public.phone_threads (device, project, item, snapshot) values ($1, 'alpha', 'w-1', '{"v":3}')`, [DEV]);
}, 60_000);
afterAll(() => db.close());

describe('a command, once written', () => {
  it('cannot be rewritten by its owner: not its kind, its words, its date or its computer', async () => {
    const c = await command();
    for (const set of [`kind = 'close'`, `payload = '{"text":"no"}'`, `created_at = now() - interval '1 day'`, `device = '${OTHER_DEV}'`, `project = 'beta'`, `item = 'w-2'`]) {
      expect(await refused(OWNER, `update public.phone_commands set ${set} where id = $1`, [c.id]), set).toBe(true);
    }
    const [still] = await rows(OWNER, `select kind, payload from public.phone_commands where id = $1`, [c.id]);
    expect(still).toEqual({ kind: 'reply', payload: { text: 'yes' } });
  });

  it('is marked taken once, and never unmarked or marked again', async () => {
    const c = await command();
    await as(OWNER, `update public.phone_commands set taken_at = now(), outcome = 'done' where id = $1`, [c.id]);
    expect(await refused(OWNER, `update public.phone_commands set taken_at = null, outcome = null where id = $1`, [c.id])).toBe(true);
    expect(await refused(OWNER, `update public.phone_commands set taken_at = now(), outcome = 'refused: late' where id = $1`, [c.id])).toBe(true);
    const [after] = await rows(OWNER, `select outcome from public.phone_commands where id = $1`, [c.id]);
    expect(after.outcome).toBe('done');
  });

  it('is dated by the database and is never born taken, whatever the phone sends', async () => {
    const c = await command(OWNER, `created_at='2000-01-01'`).catch(() => null);
    if (c) expect(new Date(c.created_at).getFullYear()).toBeGreaterThan(2020);
    expect(await refused(OWNER, `insert into public.phone_commands (device, project, kind, taken_at, outcome) values ($1, 'alpha', 'new', now(), 'done')`, [DEV])).toBe(true);
    const [n] = await rows(OWNER, `select count(*)::int as n from public.phone_commands where taken_at is not null and outcome = 'done' and created_at < now() - interval '1 hour'`);
    expect(n.n).toBe(0);
  });

  it('cannot be written as somebody else, or deleted', async () => {
    expect(await refused(OWNER, `insert into public.phone_commands (owner, device, project, kind) values ($1, $2, 'alpha', 'new')`, [STRANGER, DEV])).toBe(true);
    const c = await command();
    await as(OWNER, `delete from public.phone_commands where id = $1`, [c.id]).catch(() => {});
    expect((await rows(OWNER, `select id from public.phone_commands where id = $1`, [c.id])).length).toBe(1);
  });

  it('refuses any kind but the four', async () => {
    expect(await refused(OWNER, `insert into public.phone_commands (device, project, kind) values ($1, 'alpha', 'delete')`, [DEV])).toBe(true);
  });
});

describe('a stranger', () => {
  it('reads none of her projects, threads or commands', async () => {
    await command();
    expect(await rows(STRANGER, `select * from public.phone_projects`)).toEqual([]);
    expect(await rows(STRANGER, `select * from public.phone_threads`)).toEqual([]);
    expect(await rows(STRANGER, `select * from public.phone_commands`)).toEqual([]);
  });

  it('cannot mark her command, or write into her rows', async () => {
    const c = await command();
    await as(STRANGER, `update public.phone_commands set taken_at = now(), outcome = 'done' where id = $1`, [c.id]);
    const [still] = await rows(OWNER, `select taken_at from public.phone_commands where id = $1`, [c.id]);
    expect(still.taken_at).toBeNull();
    expect(await refused(STRANGER, `insert into public.phone_threads (owner, device, project, item, snapshot) values ($1, $2, 'alpha', 'w-9', '{}')`, [OWNER, DEV])).toBe(true);
  });
});

describe('nobody signed in', () => {
  it('reads and writes nothing', async () => {
    for (const t of ['phone_projects', 'phone_threads', 'phone_commands']) {
      expect(await refused(null, `select * from public.${t}`, [], 'anon'), t).toBe(true);
    }
    expect(await refused(null, `insert into public.phone_commands (owner, device, project, kind) values ($1, $2, 'alpha', 'new')`, [OWNER, DEV], 'anon')).toBe(true);
  });
});

// Codex's second review, finding 3: a database that ran the first draft of
// these tables kept them, holes and all, because the file only made tables
// that were not there yet.
describe('a database that ran either earlier draft', () => {
  it.each(['phone-inbox-first-draft.sql', 'phone-inbox-second-draft.sql', 'phone-inbox-third-draft.sql'])('%s ends with the tables as they are now, and the holes closed', async (fixture) => {
    const old = new PGlite();
    await old.exec(SUPABASE_STAND_IN);
    const draft = fs.readFileSync(path.join(root, 'tests/fixtures', fixture), 'utf8');
    const before = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') && f < '20261014000000').sort().map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');
    const after = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') && f >= '20261014000000').sort().map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');
    await old.exec(before);
    await old.exec(draft);
    await old.exec(after);
    const cols = (await old.query(`select column_name from information_schema.columns where table_name = 'phone_commands' order by column_name`)).rows.map((r) => r.column_name);
    expect(cols).toEqual(expect.arrayContaining(['device', 'claimed_at']));
    const triggers = (await old.query(`select tgname from pg_trigger where tgname like 'phone_command_%' order by tgname`)).rows.map((r) => r.tgname);
    expect(triggers).toEqual(['phone_command_made', 'phone_command_taken']);
    await old.close();
  });
});

// Codex's third review, finding 3: Undo and the computer raced, and both won.
describe('the computer claims a command; the phone takes one back; only one of them wins', () => {
  it('a command the computer claimed cannot be taken back, and is claimed once', async () => {
    const c = await command();
    const [claimed] = await rows(OWNER, `update public.phone_commands set claimed_at = now() where id = $1 and taken_at is null and claimed_at is null returning id`, [c.id]);
    expect(claimed?.id).toBe(c.id);
    expect(await rows(OWNER, `update public.phone_commands set taken_at = now(), outcome = 'refused: taken back on the phone' where id = $1 and taken_at is null and claimed_at is null returning id`, [c.id])).toEqual([]);
    expect(await refused(OWNER, `update public.phone_commands set claimed_at = now() + interval '1 second' where id = $1`, [c.id])).toBe(true);
    await as(OWNER, `update public.phone_commands set taken_at = now(), outcome = 'done' where id = $1`, [c.id]);
    const [after] = await rows(OWNER, `select outcome, claimed_at is not null as claimed from public.phone_commands where id = $1`, [c.id]);
    expect(after).toEqual({ outcome: 'done', claimed: true });
  });
  it('a command taken back cannot then be claimed', async () => {
    const c = await command();
    await as(OWNER, `update public.phone_commands set taken_at = now(), outcome = 'refused: taken back on the phone' where id = $1 and taken_at is null and claimed_at is null`, [c.id]);
    expect(await refused(OWNER, `update public.phone_commands set claimed_at = now() where id = $1`, [c.id])).toBe(true);
    expect(await rows(OWNER, `update public.phone_commands set claimed_at = now() where id = $1 and taken_at is null and claimed_at is null returning id`, [c.id])).toEqual([]);
  });
  it('an update that changes nothing, or an outcome without a time, is refused', async () => {
    const c = await command();
    expect(await refused(OWNER, `update public.phone_commands set outcome = 'done' where id = $1`, [c.id])).toBe(true);
    expect(await refused(OWNER, `update public.phone_commands set claimed_at = null where id = $1`, [c.id])).toBe(true);
  });
});

describe('two computers on one account', () => {
  it('keep a project of the same name apart', async () => {
    await as(OWNER, `insert into public.phone_projects (device, project, name) values ($1, 'alpha', 'Alpha on the other computer')`, [OTHER_DEV]);
    const names = (await rows(OWNER, `select device, name from public.phone_projects where project = 'alpha' order by name`)).map((r) => [r.device, r.name]);
    expect(names).toEqual([[DEV, 'Alpha'], [OTHER_DEV, 'Alpha on the other computer']]);
  });
  it('refuse a computer id that is not one', async () => {
    expect(await refused(OWNER, `insert into public.phone_projects (device, project, name) values ('../x', 'beta', 'B')`)).toBe(true);
  });
});
