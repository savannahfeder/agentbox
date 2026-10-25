// STRANGERS ON THE CLOUD SEE NO THREAD NAMES UNTIL YOU TURN THEM ON (w-64116bb761, 2026-10-24).
//
// 20261022000100_rooms_show_everyone.sql moves every card to show its work to
// everyone in its rooms. It reached the hosted cloud only on 2026-10-24, two
// days late, so it also moved cards whose owners had kept thread names to
// their team. The founder: "We want to hide thread names from strangers.
// That's important." Measured on PGlite with every migration: a card showing
// its work to everyone goes back to its team only, what its Macs last
// published is cleared, a card on none stays none, and a new card starts on
// team.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const dir = path.join(import.meta.dirname, '..', 'cloud/supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const THIS = '20261027000000_thread_names_stay_with_the_team.sql';
const sql = (names) => names.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

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

const SHOWS = '11111111-1111-1111-1111-111111111111';
const TEAM = '22222222-2222-2222-2222-222222222222';
const NONE = '33333333-3333-3333-3333-333333333333';
const NEW = '44444444-4444-4444-4444-444444444444';
const DEVICE = 'a1b2c3d4e5f6';
const ACTIVITY = JSON.stringify([{ title: 'Card disputes: export for the bank', project: 'Payments', state: 'running', at: 1 }]);
const LONG_AGO = '2026-10-20T10:00:00Z';

let db;
const one = async (q, params) => (await db.query(q, params)).rows[0];
const card = (id) => one('select show_working from public.room_profiles where person_id = $1', [id]);
const row = (id) => one('select working_on, activity, agents_running, updated_at from public.room_presence where person_id = $1', [id]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STAND_IN);
  await db.exec(sql(files.filter((f) => f < THIS)));
  for (const [id, show] of [[SHOWS, 'everyone'], [TEAM, 'team'], [NONE, 'none'], [NEW, null]]) {
    await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())', [id, `${id.slice(0, 4)}@example.test`]);
    if (!show) continue;
    await db.query('insert into public.room_profiles (person_id, display_name, show_working) values ($1, $2, $3)', [id, 'Someone', show]);
    await db.query(`insert into public.room_presence (person_id, device, agents_running, working_on, activity) values ($1, $2, 2, $3, $4)`,
      [id, DEVICE, show === 'everyone' ? 'Card disputes: export for the bank' : null, show === 'everyone' ? ACTIVITY : '[]']);
  }
  // A Mac that went quiet days ago keeps its age, so its agents do not come back to life.
  await db.exec(`alter table public.room_presence disable trigger room_presence_stamped;
    update public.room_presence set updated_at = '${LONG_AGO}';
    alter table public.room_presence enable trigger room_presence_stamped;`);
  await db.exec(sql([THIS]));
}, 60_000);
afterAll(() => db.close());

describe('after this update', () => {
  it('a card that showed thread names to everyone keeps them to its team', async () => {
    expect(await card(SHOWS)).toEqual({ show_working: 'team' });
  });
  it('what its Mac last published is cleared, its agent count kept, its age unchanged', async () => {
    const r = await row(SHOWS);
    expect(r).toMatchObject({ working_on: null, activity: [], agents_running: 2 });
    expect(new Date(r.updated_at).toISOString()).toBe(new Date(LONG_AGO).toISOString());
  });
  it('a card already on team stays on team, and one on none is never loosened', async () => {
    expect(await card(TEAM)).toEqual({ show_working: 'team' });
    expect(await card(NONE)).toEqual({ show_working: 'none' });
  });
  it('a card made afterwards starts on team', async () => {
    await db.query("insert into public.room_profiles (person_id, display_name) values ($1, 'New N.')", [NEW]);
    expect(await card(NEW)).toEqual({ show_working: 'team' });
  });
  it('someone can still turn thread names on for everyone', async () => {
    await db.query("update public.room_profiles set show_working = 'everyone' where person_id = $1", [NEW]);
    expect(await card(NEW)).toEqual({ show_working: 'everyone' });
    await db.query("update public.room_profiles set show_working = 'team' where person_id = $1", [NEW]);
  });
  it('running it again changes nothing', async () => {
    await db.exec(sql([THIS]));
    expect([await card(SHOWS), await card(TEAM), await card(NONE)]).toEqual([{ show_working: 'team' }, { show_working: 'team' }, { show_working: 'none' }]);
  });
});
