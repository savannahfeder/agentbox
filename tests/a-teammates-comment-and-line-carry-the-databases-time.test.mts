// A TEAMMATE'S COMMENT AND LINE CARRY THE DATABASE'S TIME, NOT ONE THEY PICKED.
//
// A help ask passes the helper's comments to the owner's agent only while the
// ask covers them (shared/thread-asks.mts helpAskCovering), judged by each
// comment's created_at and by the hand-back line's time, which the pull takes
// from lines.created_at. Both columns were only `default now()` with insert
// granted on the whole table, so a helper calling the REST API directly could
// backdate a comment into the old window, or date the hand-back in 2030, and
// keep starting turns of the owner's agent after handing back. Reproduced on
// dummy rows with the real relay (security review, 2026-11-21). Run here against
// every migration in PGlite.
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
`;
const GRANTS = `
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`;
const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const PROJECT = '55555555-5555-5555-5555-555555555555';

let db: PGlite;
let team: { id: string };
async function as(person: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person: string, sql: string, params?: unknown[]) => (await as(person, sql, params)).rows as Record<string, unknown>[];
const secondsFromNow = async (person: string, sql: string, params?: unknown[]) =>
  Number((await rows(person, `select abs(extract(epoch from (${sql}) - now())) as s`, params))[0].s);

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(STAND_IN);
  await db.exec(migration);
  await db.exec(`insert into public.multiplayer_people (email) values ('*')`);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@nw.test', 'Maya'], [THEO, 'theo@nw.test', 'Theo']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
  }
  [team] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]) as { id: string }[];
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, MAYA]);
  await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo@nw.test', $2)`, [team.id, MAYA]);
  await as(THEO, `select public.accept_invite($1)`, [team.id]);
  await as(MAYA, `insert into public.thread_cards (person_id, team_id, thread_id, title, state) values ($1, $2, 'w-help', 'T', 'done')`, [MAYA, team.id]);
  await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by) values ($1, $2, 'Website', 'team', $3)`, [PROJECT, team.id, MAYA]);
}, 60_000);
afterAll(() => db.close());

it('stamps a comment with the database time, whatever time the writer sends', async () => {
  for (const [uid, sent] of [['past', '2020-01-01T00:00:00Z'], ['future', '2030-01-01T00:00:00Z']]) {
    await as(THEO, `insert into public.thread_comments (owner, thread_id, by_person, body, created_at) values ($1, 'w-help', $2, $3, $4)`, [MAYA, THEO, uid, sent]);
    expect(await secondsFromNow(MAYA, `select created_at from public.thread_comments where body = $1`, [uid])).toBeLessThan(60);
  }
});

it('stamps a line with the database time, whatever time the writer sends', async () => {
  for (const [uid, sent] of [['l-past', '2020-01-01T00:00:00Z'], ['l-future', '2030-01-01T00:00:00Z']]) {
    await as(THEO, `insert into public.lines (project_id, uid, by_person, body, created_at) values ($1, $2, $3, '{"id":"w-aaaaaa"}', $4)`, [PROJECT, uid, THEO, sent]);
    expect(await secondsFromNow(MAYA, `select created_at from public.lines where uid = $1`, [uid])).toBeLessThan(60);
  }
});

it('still takes a comment and a line that send no time at all, as the app does', async () => {
  await as(THEO, `insert into public.thread_comments (owner, thread_id, by_person, body) values ($1, 'w-help', $2, 'plain')`, [MAYA, THEO]);
  await as(THEO, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-plain', $2, '{}') on conflict (uid) do nothing`, [PROJECT, THEO]);
  expect(await secondsFromNow(MAYA, `select created_at from public.thread_comments where body = 'plain'`)).toBeLessThan(60);
  expect(await secondsFromNow(MAYA, `select created_at from public.lines where uid = 'l-plain'`)).toBeLessThan(60);
});

it('leaves a line sent twice as it first landed', async () => {
  const first = (await rows(MAYA, `select created_at from public.lines where uid = 'l-plain'`))[0].created_at;
  await as(THEO, `insert into public.lines (project_id, uid, by_person, body, created_at) values ($1, 'l-plain', $2, '{}', '2030-01-01') on conflict (uid) do nothing`, [PROJECT, THEO]);
  expect((await rows(MAYA, `select created_at from public.lines where uid = 'l-plain'`))[0].created_at).toEqual(first);
});
