// A PERSON'S PAGE SHOWS NONE OF THEIR THREADS (w-0bc0443617, 2026-10-25).
//
// A person's page opened on "Today's activity": a board of every thread they
// had waiting, running and done today. On your own page that was every thread
// you have, private ones included, and nothing on it said who else could see
// it. "Feels a little intrusive... Make sure others can't see what tasks I'm
// working on or others are working on." Measured by drawing ProfilePage for
// me, a teammate and a room-mate outside my team: all three had the tab and
// the board, and myPresence put up to 36 thread names on the row everyone in
// my rooms reads once thread names were on.
//
// Now the page is the numbers and the hours chart for everyone, the presence row
// carries no list of threads, and a list an older Mac still sends is dropped:
// by the wall that reads it, and by the cloud before anyone can read it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfilePage } from '../renderer/src/team/rooms/RoomPerson.tsx';
import { myPresence, wallCards } from '../shared/room-cards.mjs';
globalThis.React = React;

const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 0, level: 3, hoursTotal: 1, hoursWeek: 1, hoursToday: 0, streak: 1, byMonth: [], teammate: true, showActivity: true, activity: null, status: null, workingOn: null, workingPrivate: false, ...o });
const threads = [{ personId: 'sam', threadId: 'w-1', title: 'Pick a font for the receipts', state: 'waiting', updatedAt: Date.now() }];

function page(c) {
  const asked = [];
  const renderBoard = (people) => { asked.push(people); return React.createElement('div', { className: 'th-board' }, 'a board'); };
  const room = { id: 'r1', name: 'Coworking', wall: [c] };
  const html = renderToStaticMarkup(React.createElement(ProfilePage, { card: c, room, rooms: [room], cards: threads.map((t) => ({ ...t, personId: c.id })), rank: 1, onRanks: () => {}, renderBoard }));
  return { html, asked };
}

describe('a person’s page', () => {
  for (const [who, c] of [
    ['mine', card('sam', { me: true, teammate: false })],
    ['a teammate’s who shares their activity', card('maya')],
    ['a room-mate’s outside my team who shows their threads', card('alex', { teammate: false, activity: [{ title: 'Pick a font for the receipts', project: null, state: 'running', at: 1 }] })],
  ]) {
    it(`${who} has no Today’s activity and no board`, () => {
      const { html, asked } = page(c);
      expect(html).not.toContain('activity');
      expect(html).not.toContain('Pick a font for the receipts');
      expect(html).not.toContain('th-board');
      expect(asked).toEqual([]);
    });
    it(`${who} is the hours chart alone, with no tab that switches nothing`, () => {
      const { html } = page(c);
      expect(html).toContain('rm-pgrid');
      expect(html).toContain('Agent hours');
      expect(html).not.toContain('tm-tab');
    });
  }
});

describe('the presence row everyone in my rooms reads', () => {
  const NOW = Date.parse('2026-10-25T12:00:00-07:00');
  const cards = [{ threadId: 't1', title: 'Fix the flaky booking test', project: 'Web', state: 'running', people: null, updatedAt: NOW - 60_000 }];

  it('carries no thread list, even with thread names shown to everyone and activity on', () => {
    expect(myPresence({ cards, now: NOW, showWorking: 'everyone', showActivity: true }).activity).toEqual([]);
  });
  it('carries none on the quieter settings either', () => {
    expect(myPresence({ cards, now: NOW, showWorking: 'team', showActivity: true }).activity).toEqual([]);
    expect(myPresence({ cards, now: NOW, showWorking: 'none', showActivity: false }).activity).toEqual([]);
  });

  it('a list an older Mac still sends reaches nobody’s wall', () => {
    const prof = { person_id: 'p-maya', display_name: 'Maya C.', show_working: 'everyone', show_activity: true };
    const pres = { person_id: 'p-maya', device: 'aaaaaaaaaaaa', agents_running: 1, working_at: new Date(NOW - 60_000).toISOString(), updated_at: new Date(NOW - 60_000).toISOString(), activity: [{ title: 'Fix the flaky booking test', project: null, state: 'running', at: NOW }] };
    const [maya] = wallCards({ members: ['p-maya', 'p-me'], profiles: [prof], presence: [pres], meId: 'p-me', now: NOW });
    expect(maya.activity).toBeNull();
  });
});

describe('the cloud', () => {
  const dir = path.join(import.meta.dirname, '..', 'cloud/supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const THIS = '20261029000000_presence_carries_no_thread_list.sql';
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
  const OLD = '11111111-1111-1111-1111-111111111111';
  const NEW = '22222222-2222-2222-2222-222222222222';
  const LIST = JSON.stringify([{ title: 'Fix the flaky booking test', project: 'Web', state: 'running', at: 1 }]);
  const LONG_AGO = '2026-10-20T10:00:00Z';
  let db;
  const row = async (id) => (await db.query('select activity, working_on, agents_running, updated_at from public.room_presence where person_id = $1', [id])).rows[0];
  const publish = (id) => db.query(`insert into public.room_presence (person_id, device, agents_running, working_on, activity) values ($1, 'a1b2c3d4e5f6', 1, 'Shared thread', $2)
    on conflict (person_id, device) do update set activity = excluded.activity, agents_running = excluded.agents_running`, [id, LIST]);

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(STAND_IN);
    await db.exec(sql(files.filter((f) => f < THIS)));
    for (const id of [OLD, NEW]) {
      await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())', [id, `${id.slice(0, 4)}@example.test`]);
      await db.query("insert into public.room_profiles (person_id, display_name, show_working) values ($1, 'Someone', 'everyone')", [id]);
    }
    await publish(OLD);
    await db.exec(`alter table public.room_presence disable trigger room_presence_stamped;
      update public.room_presence set updated_at = '${LONG_AGO}';
      alter table public.room_presence enable trigger room_presence_stamped;`);
    await db.exec(sql([THIS]));
  }, 60_000);
  afterAll(() => db.close());

  it('clears a list already there, keeping the rest of the row and its age', async () => {
    const r = await row(OLD);
    expect(r).toMatchObject({ activity: [], working_on: 'Shared thread', agents_running: 1 });
    expect(new Date(r.updated_at).toISOString()).toBe(new Date(LONG_AGO).toISOString());
  });
  it('keeps no list an older Mac sends, new or updated', async () => {
    await publish(NEW);
    expect((await row(NEW)).activity).toEqual([]);
    await publish(NEW);
    expect((await row(NEW)).activity).toEqual([]);
  });
  it('running it again changes nothing', async () => {
    await db.exec(sql([THIS]));
    expect((await row(OLD)).activity).toEqual([]);
  });
});
