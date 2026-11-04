// THE DATABASE LETS ONLY THE OWNER HAND OVER A LEAVER'S WORK.
//
// Jordan left and nothing could hand his work on. The record of who
// takes it (20261101093000_a_person_who_leaves_hands_over.sql) is what every
// copy of the app acts on, so a member who could write one could move anyone's
// tasks to themselves. Run here on the real migrations in PGlite, with
// Supabase's auth stood in (harness from team-settings-are-the-owners).
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
`;
const GRANTS = `
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`;

const MAYA = '11111111-1111-1111-1111-111111111111';
const DEV = '22222222-2222-2222-2222-222222222222';
const JORDAN = '33333333-3333-3333-3333-333333333333';
const STRANGER = '44444444-4444-4444-4444-444444444444';

let db;
let team;

async function as(person, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const refused = async (person, sql, params) => { try { await as(person, sql, params); return false; } catch { return true; } };
const handOver = (by, who, to, mates = []) => as(by, 'select public.remove_and_hand_over($1, $2, $3, $4, $5)', [team.id, who, to, 'Jordan Lee', JSON.stringify(mates)]);
const members = async () => (await db.query('select person_id from public.team_members where team_id = $1', [team.id])).rows.map((r) => r.person_id);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@lumen.test', 'Maya Chen'], [DEV, 'dev@lumen.test', 'Dev Rao'], [JORDAN, 'jordan@lumen.test', 'Jordan Lee'], [STRANGER, 'kai@else.test', 'Kai']]) {
    await db.query('insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)', [id, email, { full_name: name }]);
  }
  [team] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Lumen', $1) returning id`, [MAYA]);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, MAYA]);
  for (const [id, email] of [[DEV, 'dev@lumen.test'], [JORDAN, 'jordan@lumen.test']]) {
    await as(MAYA, 'insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)', [team.id, email, MAYA]);
    await as(id, 'select public.accept_invite($1)', [team.id]);
  }
}, 60_000);
afterAll(() => db.close());

describe('handing over a leaver\'s work', () => {
  it('is refused to a member who is not the owner, and to anyone handing to a stranger or to the leaver', async () => {
    expect(await refused(DEV, 'select public.remove_and_hand_over($1, $2, $3, $4, $5)', [team.id, JORDAN, DEV, 'Jordan Lee', '[]'])).toBe(true);
    expect(await refused(MAYA, 'select public.remove_and_hand_over($1, $2, $3, $4, $5)', [team.id, JORDAN, STRANGER, 'Jordan Lee', '[]'])).toBe(true);
    expect(await refused(MAYA, 'select public.remove_and_hand_over($1, $2, $3, $4, $5)', [team.id, JORDAN, JORDAN, 'Jordan Lee', '[]'])).toBe(true);
    expect(await refused(MAYA, 'select public.remove_and_hand_over($1, $2, $3, $4, $5)', [team.id, JORDAN, MAYA, 'Jordan Lee', JSON.stringify([{ id: 'tm-1', name: 'Support lead', to: STRANGER }])])).toBe(true);
    expect(await refused(MAYA, 'select public.remove_and_hand_over($1, $2, $3, $4, $5)', [team.id, MAYA, DEV, 'Maya', '[]'])).toBe(true);
    expect(await members()).toContain(JORDAN);
    expect(await rows(MAYA, 'select * from public.team_departures')).toEqual([]);
  });

  it('nobody writes the record straight into the table', async () => {
    expect(await refused(MAYA, 'insert into public.team_departures (team_id, person_id, hand_to, left_by) values ($1, $2, $3, $3)', [team.id, JORDAN, MAYA])).toBe(true);
  });

  it('from the owner removes them and keeps the record, which the team reads and a stranger does not', async () => {
    await handOver(MAYA, JORDAN, MAYA, [{ id: 'tm-1', name: 'Support lead', job: 'Answer user emails.', to: DEV }]);
    expect(await members()).not.toContain(JORDAN);
    const [d] = await rows(DEV, 'select person_id, name, hand_to, mates from public.team_departures');
    expect(d).toEqual({ person_id: JORDAN, name: 'Jordan Lee', hand_to: MAYA, mates: [{ id: 'tm-1', name: 'Support lead', job: 'Answer user emails.', to: DEV }] });
    expect(await rows(STRANGER, 'select * from public.team_departures')).toEqual([]);
    expect(await rows(JORDAN, 'select * from public.team_departures')).toEqual([]);
  });
});
