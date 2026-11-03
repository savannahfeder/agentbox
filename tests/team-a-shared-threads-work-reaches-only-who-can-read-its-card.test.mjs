// A SHARED THREAD'S WORK REACHES ONLY WHOEVER CAN READ ITS CARD, IN THE DATABASE.
//
// The first build of shared thread work (2026-10-30) was only ever
// proved against the memory cloud. This runs every migration in PGlite and tries
// each door from each side, because a mistake here is a private conversation read
// by the wrong person: Maya owns the thread, Theo is on her team, Ana is on her
// team and not on the chosen list, and Jun is on another team.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

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
const ANA = '33333333-3333-3333-3333-333333333333';
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
const work = (thread) => as(MAYA, `insert into public.thread_work (person_id, thread_id, team_id, hash, work) values ($1, $2, $3, 'h', '{"lines":[]}')`, [MAYA, thread, team.id]);
const file = (thread) => as(MAYA, `insert into public.thread_work_files (person_id, thread_id, name, data) values ($1, $2, 'a.png', 'QQ==')`, [MAYA, thread]);
const comment = (who, thread, body = 'Nice') => as(who, `insert into public.thread_comments (owner, thread_id, by_person, body) values ($1, $2, $3, $4)`, [MAYA, thread, who, body]);
const seen = async (who, thread) => ({
  work: (await rows(who, `select 1 from public.thread_work where person_id = $1 and thread_id = $2`, [MAYA, thread])).length,
  files: (await rows(who, `select 1 from public.thread_work_files where person_id = $1 and thread_id = $2`, [MAYA, thread])).length,
  comments: (await rows(who, `select 1 from public.thread_comments where owner = $1 and thread_id = $2`, [MAYA, thread])).length,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@nw.test', 'Maya'], [THEO, 'theo@nw.test', 'Theo'], [ANA, 'ana@nw.test', 'Ana'], [JUN, 'jun@else.test', 'Jun']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
  }
  [team] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, MAYA]);
  for (const email of ['theo@nw.test', 'ana@nw.test']) await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)`, [team.id, email, MAYA]);
  await as(THEO, `select public.accept_invite($1)`, [team.id]);
  await as(ANA, `select public.accept_invite($1)`, [team.id]);
}, 60_000);
afterAll(() => db.close());

describe('a thread the whole team can read', () => {
  beforeAll(async () => { await card('w-team'); await work('w-team'); await file('w-team'); await comment(THEO, 'w-team'); });

  it('shows its work, files and comments to teammates', async () => {
    for (const who of [THEO, ANA, MAYA]) expect(await seen(who, 'w-team')).toEqual({ work: 1, files: 1, comments: 1 });
  });
  it('shows nothing to somebody on another team, and takes no comment from them', async () => {
    expect(await seen(JUN, 'w-team')).toEqual({ work: 0, files: 0, comments: 0 });
    expect(await refused(JUN, `insert into public.thread_comments (owner, thread_id, by_person, body) values ($1, 'w-team', $2, 'Hi')`, [MAYA, JUN])).toBe(true);
  });
  it('refuses a comment signed as somebody else, and an empty one', async () => {
    expect(await refused(ANA, `insert into public.thread_comments (owner, thread_id, by_person, body) values ($1, 'w-team', $2, 'Hi')`, [MAYA, THEO])).toBe(true);
    expect(await refused(ANA, `insert into public.thread_comments (owner, thread_id, by_person, body) values ($1, 'w-team', $2, '   ')`, [MAYA, ANA])).toBe(true);
  });
  it('lets nobody but the owner write its work, change a comment or delete one', async () => {
    expect(await refused(THEO, `insert into public.thread_work (person_id, thread_id, team_id, hash, work) values ($1, 'w-team', $2, 'x', '{}')`, [MAYA, team.id])).toBe(true);
    await as(THEO, `update public.thread_work set hash = 'x'`);
    expect((await rows(MAYA, `select hash from public.thread_work where thread_id = 'w-team'`))[0].hash).toBe('h');
    expect(await refused(THEO, `update public.thread_comments set body = 'x'`)).toBe(true);
    expect(await refused(MAYA, `delete from public.thread_comments`)).toBe(true);
  });
  it('refuses work and files for a thread with no card', async () => {
    expect(await refused(MAYA, `insert into public.thread_work (person_id, thread_id, team_id, hash, work) values ($1, 'w-none', $2, 'x', '{}')`, [MAYA, team.id])).toBe(true);
    expect(await refused(MAYA, `insert into public.thread_work_files (person_id, thread_id, name, data) values ($1, 'w-none', 'a.png', 'QQ==')`, [MAYA])).toBe(true);
    expect(await refused(THEO, `insert into public.thread_comments (owner, thread_id, by_person, body) values ($1, 'w-none', $2, 'Hi')`, [MAYA, THEO])).toBe(true);
  });
  it('refuses a file name that is a path', async () => {
    expect(await refused(MAYA, `insert into public.thread_work_files (person_id, thread_id, name, data) values ($1, 'w-team', '../a.png', 'QQ==')`, [MAYA])).toBe(true);
  });
});

describe('the marks on a shared thread\'s files', () => {
  const MARK = '{"do":"approve","file":"a.png"}';
  const mark = (who, thread, signedAs = who, id = 'm1') => as(who, `insert into public.thread_file_marks (owner, thread_id, by_person, id, mark) values ($1, $2, $3, $4, $5)`, [MAYA, thread, signedAs, id, MARK]);
  const marks = async (who, thread) => (await rows(who, `select 1 from public.thread_file_marks where owner = $1 and thread_id = $2`, [MAYA, thread])).length;
  beforeAll(async () => { await card('w-marks'); await card('w-marks-chosen', [THEO]); await mark(THEO, 'w-marks'); await mark(THEO, 'w-marks-chosen'); });

  it('reach whoever can read the card, and only them', async () => {
    for (const who of [THEO, ANA, MAYA]) expect(await marks(who, 'w-marks')).toBe(1);
    expect(await marks(JUN, 'w-marks')).toBe(0);
    expect(await marks(MAYA, 'w-marks-chosen')).toBe(1);
    expect(await marks(ANA, 'w-marks-chosen')).toBe(0);
  });
  it('are taken from nobody who cannot read the card', async () => {
    expect(await refused(JUN, `insert into public.thread_file_marks (owner, thread_id, by_person, id, mark) values ($1, 'w-marks', $2, 'x', '{}')`, [MAYA, JUN])).toBe(true);
    expect(await refused(ANA, `insert into public.thread_file_marks (owner, thread_id, by_person, id, mark) values ($1, 'w-marks-chosen', $2, 'x', '{}')`, [MAYA, ANA])).toBe(true);
  });
  it('cannot be signed as somebody else, or changed, or deleted', async () => {
    expect(await refused(ANA, `insert into public.thread_file_marks (owner, thread_id, by_person, id, mark) values ($1, 'w-marks', $2, 'x', '{}')`, [MAYA, THEO])).toBe(true);
    expect(await refused(THEO, `update public.thread_file_marks set mark = '{}'`)).toBe(true);
    expect(await refused(THEO, `delete from public.thread_file_marks`)).toBe(true);
  });
  it('are refused for a thread with no card', async () => {
    expect(await refused(THEO, `insert into public.thread_file_marks (owner, thread_id, by_person, id, mark) values ($1, 'w-none', $2, 'x', '{}')`, [MAYA, THEO])).toBe(true);
  });
  it('land once when sent twice', async () => {
    await as(THEO, `insert into public.thread_file_marks (owner, thread_id, by_person, id, mark) values ($1, 'w-marks', $2, 'm1', '{}') on conflict do nothing`, [MAYA, THEO]);
    expect(await marks(THEO, 'w-marks')).toBe(1);
  });
  it('go with the card when a thread is made private', async () => {
    await card('w-marks-gone');
    await mark(THEO, 'w-marks-gone');
    await as(MAYA, `delete from public.thread_cards where person_id = $1 and thread_id = 'w-marks-gone'`, [MAYA]);
    expect(await marks(MAYA, 'w-marks-gone')).toBe(0);
  });
});

describe('a thread shared with chosen people', () => {
  beforeAll(async () => { await card('w-chosen', [THEO]); await work('w-chosen'); await file('w-chosen'); await comment(THEO, 'w-chosen'); });

  it('reaches them and the owner, and not the rest of the team', async () => {
    expect(await seen(THEO, 'w-chosen')).toEqual({ work: 1, files: 1, comments: 1 });
    expect(await seen(MAYA, 'w-chosen')).toEqual({ work: 1, files: 1, comments: 1 });
    expect(await seen(ANA, 'w-chosen')).toEqual({ work: 0, files: 0, comments: 0 });
  });
  it('takes no comment from the rest of the team', async () => {
    expect(await refused(ANA, `insert into public.thread_comments (owner, thread_id, by_person, body) values ($1, 'w-chosen', $2, 'Hi')`, [MAYA, ANA])).toBe(true);
  });
  it('ends for someone taken off the list', async () => {
    await card('w-chosen', [ANA]);
    expect(await seen(THEO, 'w-chosen')).toEqual({ work: 0, files: 0, comments: 0 });
    expect(await seen(ANA, 'w-chosen')).toEqual({ work: 1, files: 1, comments: 1 });
  });
});

describe('a thread made private', () => {
  it('has its work, files and comments deleted with its card', async () => {
    await card('w-gone'); await work('w-gone'); await file('w-gone'); await comment(THEO, 'w-gone');
    await as(MAYA, `delete from public.thread_cards where thread_id = 'w-gone'`);
    expect(await seen(MAYA, 'w-gone')).toEqual({ work: 0, files: 0, comments: 0 });
  });
});
