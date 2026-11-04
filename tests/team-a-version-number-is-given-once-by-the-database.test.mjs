// A VERSION NUMBER IS GIVEN ONCE, BY THE DATABASE.
//
// Sofia's v6 was Dev's v7, because each computer counted. The
// hosted cloud now holds the line (20261104093700_one_version_line_per_file.sql).
// Measured against the migrations on a real Postgres (PGlite): the same bytes
// keep their number from either teammate, new bytes take the next, nobody
// writes a number by hand, and nobody off the team reads or adds one.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mjs';

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
`;
const GRANTS = `
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`;
const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const JUN = '44444444-4444-4444-4444-444444444444';
const FILE = 'ab12cd34ef56';
const bytes = (c) => c.repeat(64);

let db;
let team;
async function as(person, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const refused = async (person, sql, params) => { try { await as(person, sql, params); return false; } catch { return true; } };
const add = async (who, hash, file = FILE) => (await rows(who, 'select public.add_file_version($1, $2, $3, $4, 1) as n', [team.id, file, hash, 'aa11bb22']))[0].n;

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@nw.test', 'Maya'], [THEO, 'theo@nw.test', 'Theo'], [JUN, 'jun@else.test', 'Jun']]) {
    await db.query('insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)', [id, email, { full_name: name }]);
  }
  [team] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, MAYA]);
  await as(MAYA, 'insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)', [team.id, 'theo@nw.test', MAYA]);
  await as(THEO, 'select public.accept_invite($1)', [team.id]);
}, 60_000);
afterAll(() => db.close());

describe('the version line', () => {
  it('numbers new bytes next and the same bytes as before, from either teammate', async () => {
    expect(await add(MAYA, bytes('a'))).toBe(1);
    expect(await add(THEO, bytes('b'))).toBe(2);
    expect(await add(THEO, bytes('a'))).toBe(1);
    expect(await add(MAYA, bytes('c'))).toBe(3);
    expect((await rows(THEO, 'select n from public.file_versions where file = $1 order by n', [FILE])).map((r) => r.n)).toEqual([1, 2, 3]);
  });

  it('starts each file at 1', async () => {
    expect(await add(MAYA, bytes('a'), 'ff00ff00')).toBe(1);
  });

  it('takes no number written by hand, and changes or loses none', async () => {
    expect(await refused(MAYA, `insert into public.file_versions (team_id, file, n, hash, at) values ($1, $2, 9, $3, 1)`, [team.id, FILE, bytes('d')])).toBe(true);
    await as(MAYA, 'update public.file_versions set n = 7 where file = $1', [FILE]).catch(() => null);
    await as(MAYA, 'delete from public.file_versions where file = $1', [FILE]).catch(() => null);
    expect((await rows(MAYA, 'select n from public.file_versions where file = $1 order by n', [FILE])).map((r) => r.n)).toEqual([1, 2, 3]);
  });

  it('is for the team alone', async () => {
    expect(await refused(JUN, 'select public.add_file_version($1, $2, $3, $4, 1)', [team.id, FILE, bytes('e'), 'aa11bb22'])).toBe(true);
    expect(await rows(JUN, 'select n from public.file_versions')).toEqual([]);
  });
});
