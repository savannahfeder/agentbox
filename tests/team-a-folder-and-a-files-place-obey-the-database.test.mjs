// A FOLDER AND A FILE'S PLACE OBEY THE DATABASE, NOT ONLY THE APP.
//
// Folders are new tables, and a place names a file a private thread must not
// give away. Measured against the migrations on a real Postgres (PGlite): who
// reads and writes each row from each side, and that a place goes with its card.
// It also caught that Postgres text cannot hold the \0 in a family key.
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

let db;
let team;
async function as(person, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const refused = async (person, sql, params) => { try { await as(person, sql, params); return false; } catch { return true; } };
const card = (thread, people = null) => as(MAYA, `insert into public.thread_cards (person_id, team_id, thread_id, title, state, people) values ($1, $2, $3, 'T', 'done', $4)
  on conflict (person_id, thread_id) do update set people = excluded.people`, [MAYA, team.id, thread, people]);
const folder = (who, id, people = null) => as(who, `insert into public.file_folders (id, team_id, project, name, people, at) values ($1, $2, 'Lumen', 'Launch', $3, 1)`, [id, team.id, people]);
const place = (who, thread, folderId, family = 'launch/image') => as(who, `insert into public.file_places (owner, thread_id, family, project, folder, by_person, at) values ($1, $2, $3, 'Lumen', $4, $5, 1)`, [MAYA, thread, family, folderId, who]);
const foldersFor = async (who) => (await rows(who, 'select id from public.file_folders')).map((r) => r.id);
const placesFor = async (who, thread) => (await rows(who, 'select family from public.file_places where thread_id = $1', [thread])).map((r) => r.family);

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

describe('a folder', () => {
  it('reaches the team, and nobody outside it', async () => {
    await folder(MAYA, 'f-team');
    expect(await foldersFor(THEO)).toContain('f-team');
    expect(await foldersFor(JUN)).not.toContain('f-team');
  });

  it('shared with chosen people reaches only them', async () => {
    await folder(MAYA, 'f-chosen', [MAYA]);
    expect(await foldersFor(MAYA)).toContain('f-chosen');
    expect(await foldersFor(THEO)).not.toContain('f-chosen');
  });

  it('can be renamed by a teammate who reads it, and not by one who does not', async () => {
    await folder(MAYA, 'f-rename');
    await as(THEO, `update public.file_folders set name = 'Launch day', at = 2 where id = 'f-rename'`);
    expect((await rows(MAYA, `select name from public.file_folders where id = 'f-rename'`))[0].name).toBe('Launch day');
    await as(THEO, `update public.file_folders set name = 'Taken', at = 3 where id = 'f-chosen'`);
    expect((await rows(MAYA, `select name from public.file_folders where id = 'f-chosen'`))[0].name).toBe('Launch');
  });

  it('cannot be made by someone off the team, or shared with nobody', async () => {
    expect(await refused(JUN, `insert into public.file_folders (id, team_id, project, name, at) values ('f-jun', $1, 'x', 'x', 1)`, [team.id])).toBe(true);
    expect(await refused(MAYA, `insert into public.file_folders (id, team_id, project, name, people, at) values ('f-none', $1, 'x', 'x', '{}', 1)`, [team.id])).toBe(true);
  });

  it('is one this person cannot be left out of when they write it', async () => {
    expect(await refused(MAYA, `insert into public.file_folders (id, team_id, project, name, people, at) values ('f-out', $1, 'x', 'x', $2, 1)`, [team.id, [THEO]])).toBe(true);
  });
});

describe('a file\'s place', () => {
  it('reaches those who may read the thread', async () => {
    await card('w-open');
    await place(THEO, 'w-open', 'f-team');
    expect(await placesFor(MAYA, 'w-open')).toEqual(['launch/image']);
    expect(await placesFor(JUN, 'w-open')).toEqual([]);
  });

  it('on a thread for chosen people stays with them', async () => {
    await card('w-chosen', [MAYA]);
    await place(MAYA, 'w-chosen', 'f-team');
    expect(await placesFor(THEO, 'w-chosen')).toEqual([]);
  });

  it('cannot be written on a thread with no card, one you cannot read, or into a folder you cannot read', async () => {
    expect(await refused(MAYA, `insert into public.file_places (owner, thread_id, family, project, by_person, at) values ($1, 'w-private', 'x', 'Lumen', $1, 1)`, [MAYA])).toBe(true);
    expect(await refused(THEO, `insert into public.file_places (owner, thread_id, family, project, by_person, at) values ($1, 'w-chosen', 'y', 'Lumen', $2, 1)`, [MAYA, THEO])).toBe(true);
    expect(await refused(THEO, `insert into public.file_places (owner, thread_id, family, project, folder, by_person, at) values ($1, 'w-open', 'z', 'Lumen', 'f-chosen', $2, 1)`, [MAYA, THEO])).toBe(true);
  });

  it('goes with the card when a thread is made private', async () => {
    await card('w-gone');
    await place(MAYA, 'w-gone', 'f-team');
    await as(MAYA, `delete from public.thread_cards where person_id = $1 and thread_id = 'w-gone'`, [MAYA]);
    expect(await placesFor(MAYA, 'w-gone')).toEqual([]);
  });
});
