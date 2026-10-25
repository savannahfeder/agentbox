// A ROOM NAMES EVERYONE IN IT AND SHOWS WORK TO ROOM-MATES (w-3d0fa23ffb, 2026-10-22).
//
// An hour with a second person (a test account outside the founder's team) in
// the founder's room found three gaps in what the cloud lets a room-mate read:
// - she went invisible and every message she had ever sent read "Someone" on
//   the founder's side, because her name lived only on the card invisibility
//   hides;
// - the room said five people and its wall showed two: three teammates had not
//   turned Rooms on, had no card, and so had no name anywhere in the room;
// - the founder asked to see what she was working on and could not, because
//   the default kept thread names to one's own team and she was on none.
// Run on PGlite with every migration, as the other rooms cloud tests are.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const dir = path.join(import.meta.dirname, '..', 'cloud/supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const migration = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const thisOne = fs.readFileSync(path.join(dir, '20261022000100_rooms_show_everyone.sql'), 'utf8');

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
grant usage on schema public to anon;
grant usage on schema auth to anon;
grant execute on function auth.uid() to anon;
`;

const ANA = '11111111-1111-1111-1111-111111111111';
const TEO = '22222222-2222-2222-2222-222222222222';
const MAYA = '33333333-3333-3333-3333-333333333333';
const JUN = '44444444-4444-4444-4444-444444444444';
const DEVICE = 'a1b2c3d4e5f6';

let db;
let room;

async function as(person, sql, params = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const refused = async (person, sql, params, role) => { try { await as(person, sql, params, role); return false; } catch { return true; } };
const names = async (person) => (await rows(person, `select person_id, name, has_card from public.room_names($1) order by name`, [room]));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[ANA, 'ana@astral.test', 'Ana Lima'], [TEO, 'teo@astral.test', 'Teo Park'], [MAYA, 'maya@tester.test', 'Maya Chen'], [JUN, 'jun@elsewhere.test', 'Jun Ito']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
  }
  const [team] = await rows(ANA, `insert into public.teams (name, created_by) values ('Astral', $1) returning id`, [ANA]);
  await as(ANA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, ANA]);
  await as(ANA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'teo@astral.test', $2)`, [team.id, ANA]);
  await as(TEO, `select public.accept_invite($1)`, [team.id]);
  ({ id: room } = (await rows(ANA, `select id from public.rooms where team_id = $1`, [team.id]))[0]);
  await as(ANA, `insert into public.room_profiles (person_id, display_name) values ($1, 'Ana L.')`, [ANA]);
  await as(MAYA, `insert into public.room_profiles (person_id, display_name) values ($1, 'Maya C.')`, [MAYA]);
  await as(ANA, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, 'maya@tester.test', $2)`, [room, ANA]);
  await as(MAYA, `select public.accept_room_invite($1)`, [room]);
}, 60_000);
afterAll(() => db.close());

describe('everyone in a room is named', () => {
  it('a member who is invisible keeps her name for her room-mates', async () => {
    await as(MAYA, `update public.room_profiles set invisible_until = now() + interval '1 hour' where person_id = $1`, [MAYA]);
    expect(await rows(ANA, `select display_name from public.room_profiles where person_id = $1`, [MAYA])).toEqual([]);
    expect(await names(ANA)).toContainEqual({ person_id: MAYA, name: 'Maya C.', has_card: true });
    await as(MAYA, `update public.room_profiles set invisible_until = null where person_id = $1`, [MAYA]);
  });

  it('a member with no card yet is named from their account, and says so', async () => {
    expect(await names(ANA)).toContainEqual({ person_id: TEO, name: 'Teo Park', has_card: false });
    expect(await names(MAYA)).toContainEqual({ person_id: TEO, name: 'Teo Park', has_card: false });
  });

  it('names nobody to someone outside the room, or signed out', async () => {
    expect(await names(JUN)).toEqual([]);
    expect(await refused(null, `select * from public.room_names($1)`, [room], 'anon')).toBe(true);
  });

  it('carries a name and a face, and nothing about their work', async () => {
    const cols = Object.keys((await rows(ANA, `select * from public.room_names($1) limit 1`, [room]))[0]);
    expect(cols.sort()).toEqual(['avatar_url', 'has_card', 'name', 'person_id']);
  });
});

describe('work reaches everyone in your rooms', () => {
  // Since 20261027000000_thread_names_stay_with_the_team.sql, room-mates outside
  // your team see your work only once you turn that on.
  it('a new card keeps what you work on to your team, unless you say otherwise', async () => {
    await as(JUN, `insert into public.room_profiles (person_id, display_name) values ($1, 'Jun I.')`, [JUN]);
    expect((await rows(JUN, `select show_working from public.room_profiles where person_id = $1`, [JUN]))[0].show_working).toBe('team');
  });

  it('a card left on the old default moves when this runs, and running it again changes nothing else', async () => {
    await as(ANA, `update public.room_profiles set show_working = 'team' where person_id = $1`, [ANA]);
    await as(MAYA, `update public.room_profiles set show_working = 'none' where person_id = $1`, [MAYA]);
    await db.exec(thisOne);
    const of = async (p) => (await rows(p, `select show_working from public.room_profiles where person_id = $1`, [p]))[0].show_working;
    expect(await of(ANA)).toBe('everyone');
    expect(await of(MAYA)).toBe('none');
  });

  // Since 2026-10-25 the cloud keeps no list of threads on a presence row
  // (tests/a-persons-page-shows-none-of-their-threads).
  it('a room-mate reads no thread list off a Mac’s presence row, whatever it writes', async () => {
    const activity = [{ title: 'Ship the room wall', project: 'Agentbox', state: 'running', at: 1 }];
    const long = JSON.stringify(Array.from({ length: 37 }, (_, i) => ({ title: `t${i}`, state: 'done', at: i })));
    await as(MAYA, `insert into public.room_presence (person_id, device) values ($1, $2)`, [MAYA, DEVICE]);
    for (const list of [JSON.stringify(activity), long, '{}']) {
      await as(MAYA, `update public.room_presence set activity = $3 where person_id = $1 and device = $2`, [MAYA, DEVICE, list]);
      expect((await rows(ANA, `select activity from public.room_presence where person_id = $1`, [MAYA]))[0].activity).toEqual([]);
    }
  });
});
