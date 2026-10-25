// THE ROOMS CLOUD SHOWS EACH ROOM ONLY TO ITS PEOPLE (w-3d0fa23ffb, 2026-10-20).
//
// Rooms puts people who are not on one team in one place: a public room like
// General, or a room joined by link. Every rule about who sees whom lives in
// cloud/supabase/migrations/20261021000000_rooms.sql, so a mistake there is a
// stranger reading someone's email, their thread names, or a room they were
// removed from. The plan (docs/team/ROOMS-PLAN.md) was reviewed by Codex four
// times; these are the doors it asked to see tested.
//
// Every migration runs in an in-process Postgres (PGlite) with Supabase's
// `auth` schema stood in, as in team-cloud-keeps-each-team-to-itself. People
// are signed in by setting the claim Supabase sets. No Docker, no network.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const migrationsDir = path.join(import.meta.dirname, '..', 'cloud/supabase/migrations');
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
grant usage on schema public to anon;
grant usage on schema auth to anon;
grant execute on function auth.uid() to anon;
`;

const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const JUN = '33333333-3333-3333-3333-333333333333';
const ANA = '44444444-4444-4444-4444-444444444444';
const BEN = '55555555-5555-5555-5555-555555555555';
const GENERAL = '9e9e9e9e-0000-4000-8000-000000000001';
const DEVICE = 'a1b2c3d4e5f6';

let db;
let northwind;
let northwindRoom;

async function as(person, sql, params = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const refused = async (person, sql, params, role) => {
  try { await as(person, sql, params, role); return false; } catch { return true; }
};
const one = async (person, sql, params) => (await rows(person, sql, params))[0];

async function signUp(id, email, fullName, { confirmed = true } = {}) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)`, [id, email, confirmed ? new Date() : null, { full_name: fullName }]);
}
const profile = (person, name, extra = '') => as(person, `insert into public.room_profiles (person_id, display_name${extra ? ', invisible_until' : ''}) values ($1, $2${extra ? ', $3' : ''})`, extra ? [person, name, extra] : [person, name]);
const presence = (person, fields = {}) => as(person,
  `insert into public.room_presence (person_id, device, agents_running, working_on, hours_total) values ($1, $2, $3, $4, $5)
   on conflict (person_id, device) do update set agents_running = excluded.agents_running, working_on = excluded.working_on, hours_total = excluded.hours_total`,
  [person, fields.device ?? DEVICE, fields.agents ?? 2, fields.working ?? null, fields.hours ?? 10]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  await signUp(MAYA, 'maya@northwind.test', 'Maya Chen');
  await signUp(THEO, 'theo@northwind.test', 'Theo Park');
  await signUp(JUN, 'jun@elsewhere.test', 'Jun Ito');
  await signUp(ANA, 'ana@friends.test', 'Ana Lima');
  await signUp(BEN, 'ben@friends.test', 'Ben Cole', { confirmed: false });
  [northwind] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [northwind.id, MAYA]);
  await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo@northwind.test', $2)`, [northwind.id, MAYA]);
  await as(THEO, `select public.accept_invite($1)`, [northwind.id]);
  ({ id: northwindRoom } = await one(MAYA, `select id from public.rooms where team_id = $1`, [northwind.id]));
  for (const [p, n] of [[MAYA, 'Maya C.'], [THEO, 'Theo P.'], [JUN, 'Jun I.'], [ANA, 'Ana L.']]) await profile(p, n);
}, 60_000);
afterAll(() => db.close());

describe('a team has its room', () => {
  it('made with the team, named after it, and its members are the team', async () => {
    const mine = await rows(MAYA, `select name, team_id, members from public.my_rooms()`);
    expect(mine).toEqual([{ name: 'Northwind', team_id: northwind.id, members: 2 }]);
    expect(await rows(THEO, `select name from public.my_rooms()`)).toEqual([{ name: 'Northwind' }]);
  });
  it('someone not on the team is not in it and cannot read it', async () => {
    expect(await rows(JUN, `select id from public.my_rooms()`)).toEqual([]);
    expect(await rows(JUN, `select id from public.rooms where id = $1`, [northwindRoom])).toEqual([]);
  });
  it('the open group everyone joins exists, listed, and anyone signed in can see it in Find rooms', async () => {
    const listed = await rows(JUN, `select id, name, joined from public.listed_rooms()`);
    expect(listed).toContainEqual({ id: GENERAL, name: 'Coworking', joined: false });
    // Find rooms' New tab sorts on it.
    expect((await rows(JUN, `select created_at from public.listed_rooms() where id = $1`, [GENERAL]))[0].created_at).toBeTruthy();
  });
});

describe('signed out', () => {
  it('reads no room table and calls nothing but the link preview', async () => {
    for (const t of ['rooms', 'room_members', 'room_profiles', 'room_presence', 'room_messages', 'room_events', 'access_events']) {
      expect(await refused(null, `select * from public.${t}`, [], 'anon'), t).toBe(true);
    }
    expect(await refused(null, `select * from public.my_rooms()`, [], 'anon')).toBe(true);
    expect(await refused(null, `select * from public.listed_rooms()`, [], 'anon')).toBe(true);
    expect(await refused(null, `select * from public.agentbox_ranks($1)`, [[MAYA]], 'anon')).toBe(true);
    expect(await refused(null, `select * from public.room_preview('nothing')`, [], 'anon')).toBe(false);
  });
});

describe('strangers in General', () => {
  beforeAll(async () => {
    await as(MAYA, `select public.join_listed_room($1)`, [GENERAL]);
    await as(JUN, `select public.join_listed_room($1)`, [GENERAL]);
    await presence(MAYA, { working: 'Cloud launch video', hours: 1240 });
    await presence(JUN, { working: null, hours: 12 });
  });

  it('see each other’s room profile and presence', async () => {
    expect((await one(JUN, `select display_name from public.room_profiles where person_id = $1`, [MAYA])).display_name).toBe('Maya C.');
    expect((await one(JUN, `select agents_running from public.room_presence where person_id = $1`, [MAYA])).agents_running).toBe(2);
  });

  it('never see each other’s people row or email', async () => {
    expect(await rows(JUN, `select email from public.people where id = $1`, [MAYA])).toEqual([]);
  });

  it('a person not in any room with them sees nothing of them', async () => {
    expect(await rows(ANA, `select * from public.room_profiles where person_id = $1`, [MAYA])).toEqual([]);
    expect(await rows(ANA, `select * from public.room_presence where person_id = $1`, [MAYA])).toEqual([]);
  });

  it('invisible hides a person from everyone but themselves, and coming back shows them', async () => {
    await as(MAYA, `update public.room_profiles set invisible_until = now() + interval '1 hour' where person_id = $1`, [MAYA]);
    expect(await rows(JUN, `select * from public.room_profiles where person_id = $1`, [MAYA])).toEqual([]);
    expect(await rows(JUN, `select * from public.room_presence where person_id = $1`, [MAYA])).toEqual([]);
    expect(await rows(THEO, `select * from public.room_presence where person_id = $1`, [MAYA])).toEqual([]);
    expect((await rows(MAYA, `select * from public.room_presence where person_id = $1`, [MAYA])).length).toBe(1);
    await as(MAYA, `update public.room_profiles set invisible_until = null where person_id = $1`, [MAYA]);
    expect((await rows(JUN, `select * from public.room_presence where person_id = $1`, [MAYA])).length).toBe(1);
  });

  it('a Mac that went away is hidden; its row is updated, never deleted', async () => {
    await as(JUN, `update public.room_presence set gone = true where person_id = $1`, [JUN]);
    expect(await rows(MAYA, `select * from public.room_presence where person_id = $1`, [JUN])).toEqual([]);
    expect(await refused(JUN, `delete from public.room_presence where person_id = $1`, [JUN])).toBe(true);
    await as(JUN, `update public.room_presence set gone = false where person_id = $1`, [JUN]);
  });

  it('rank on Agentbox is a number, worked out without reading anyone else', async () => {
    const ranks = async (who, ids) => Object.fromEntries((await rows(who, `select person_id, rank from public.agentbox_ranks($1)`, [ids])).map((r) => [r.person_id, r.rank]));
    expect(await ranks(JUN, [JUN, MAYA])).toEqual({ [JUN]: 2, [MAYA]: 1 });
    expect(await ranks(MAYA, [MAYA])).toEqual({ [MAYA]: 1 });
  });

  it('only for me and the people I share a room with', async () => {
    const ids = async (who, list) => (await rows(who, `select person_id from public.agentbox_ranks($1)`, [list])).map((r) => r.person_id).sort();
    expect(await ids(ANA, [ANA, MAYA, JUN])).toEqual([ANA]);
  });
});

describe('nobody writes for someone else', () => {
  it('not their presence, their profile, a message as them, or a membership', async () => {
    expect(await refused(JUN, `insert into public.room_presence (person_id, device) values ($1, 'bbbbbbbbbbbb')`, [MAYA])).toBe(true);
    expect(await refused(JUN, `insert into public.room_profiles (person_id, display_name) values ($1, 'x')`, [BEN])).toBe(true);
    expect(await refused(JUN, `insert into public.room_messages (room_id, by_person, body) values ($1, $2, 'hi')`, [GENERAL, MAYA])).toBe(true);
    expect(await refused(JUN, `insert into public.room_members (room_id, person_id) values ($1, $2)`, [northwindRoom, JUN])).toBe(true);
    // An update to someone else's row changes nothing.
    await as(JUN, `update public.room_presence set agents_running = 99 where person_id = $1`, [MAYA]);
    expect((await one(MAYA, `select agents_running from public.room_presence where person_id = $1`, [MAYA])).agents_running).toBe(2);
  });
  it('nobody inserts into the event tables', async () => {
    expect(await refused(MAYA, `insert into public.room_events (room_id, kind) values ($1, 'joined')`, [GENERAL])).toBe(true);
    expect(await refused(MAYA, `insert into public.access_events (person_id) values ($1)`, [MAYA])).toBe(true);
  });
});

describe('chat', () => {
  it('a member writes and reads; someone outside reads nothing', async () => {
    await as(MAYA, `insert into public.room_messages (room_id, by_person, body) values ($1, $2, 'Stripe sandbox is back')`, [northwindRoom, MAYA]);
    expect((await rows(THEO, `select body from public.room_messages where room_id = $1`, [northwindRoom])).map((r) => r.body)).toContain('Stripe sandbox is back');
    expect(await rows(JUN, `select body from public.room_messages where room_id = $1`, [northwindRoom])).toEqual([]);
    expect(await refused(JUN, `insert into public.room_messages (room_id, by_person, body) values ($1, $2, 'let me in')`, [northwindRoom, JUN])).toBe(true);
  });

  it('only people in the room stay mentioned', async () => {
    const [m] = await rows(MAYA, `insert into public.room_messages (room_id, by_person, body, mentions) values ($1, $2, '@Theo @Jun', $3) returning mentions`, [northwindRoom, MAYA, [THEO, JUN]]);
    expect(m.mentions).toEqual([THEO]);
  });

  it('a reply must be to a message in the same room', async () => {
    const [a] = await rows(MAYA, `insert into public.room_messages (room_id, by_person, body) values ($1, $2, 'in general') returning id`, [GENERAL, MAYA]);
    expect(await refused(MAYA, `insert into public.room_messages (room_id, by_person, body, in_reply_to) values ($1, $2, 'x', $3)`, [northwindRoom, MAYA, a.id])).toBe(true);
  });

  it('twenty messages a minute, then no more', async () => {
    let refusedAt = null;
    for (let i = 0; i < 25 && refusedAt === null; i += 1) {
      if (await refused(THEO, `insert into public.room_messages (room_id, by_person, body) values ($1, $2, $3)`, [northwindRoom, THEO, `m${i}`])) refusedAt = i;
    }
    expect(refusedAt).toBe(20);
  });

  it('read time only moves forward, whichever Mac says it', async () => {
    await as(MAYA, `select public.mark_room_read($1, '2026-10-20T12:00:00Z')`, [northwindRoom]);
    await as(MAYA, `select public.mark_room_read($1, '2026-10-20T10:00:00Z')`, [northwindRoom]);
    expect(new Date((await one(MAYA, `select read_at from public.room_reads where room_id = $1`, [northwindRoom])).read_at).toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(await refused(JUN, `select public.mark_room_read($1, now())`, [northwindRoom])).toBe(true);
  });
});

describe('joining by link', () => {
  let token;
  // Round 23's join dialog says who invited you, so a link is one person's:
  // each member has their own, and the preview names whoever made it.
  let theirs;
  it('each member gets a live link of their own, and a friend joins with it', async () => {
    ({ t: token } = await one(MAYA, `select public.room_link($1) as t`, [northwindRoom]));
    expect((await one(MAYA, `select public.room_link($1) as t`, [northwindRoom])).t).toBe(token);
    ({ t: theirs } = await one(THEO, `select public.room_link($1) as t`, [northwindRoom]));
    expect(theirs).not.toBe(token);
    expect(await refused(JUN, `select public.room_link($1)`, [northwindRoom])).toBe(true);
    await as(ANA, `select public.join_room_by_link($1)`, [token]);
    expect((await rows(ANA, `select name from public.my_rooms()`)).map((r) => r.name)).toContain('Northwind');
  });
  it('a guest in the team room shares it with the team, but is not on the team', async () => {
    expect((await one(ANA, `select public.shares_room($1) as s`, [THEO])).s).toBe(true);
    expect(await rows(ANA, `select id from public.teams where id = $1`, [northwind.id])).toEqual([]);
    expect(await rows(ANA, `select * from public.thread_cards where team_id = $1`, [northwind.id])).toEqual([]);
  });
  it('the preview shows the room to anyone with the link, and nothing for a dead one', async () => {
    const [p] = (await as(null, `select name, members, agents_running, faces, invited_by_name, invited_by_avatar from public.room_preview($1)`, [token], 'anon')).rows;
    expect(p.name).toBe('Northwind');
    expect(p.invited_by_name).toBe('Maya C.');
    expect(p.members).toBe(3);
    expect(p.faces.length).toBeGreaterThan(0);
    expect(JSON.stringify(p)).not.toMatch(/@/);
    expect((await as(null, `select * from public.room_preview('nope')`, [], 'anon')).rows).toEqual([]);
  });
  it('turning my link off makes me a new one and leaves everyone else’s; the owner’s turns off them all', async () => {
    const { t: anas } = await one(ANA, `select public.room_link($1) as t`, [northwindRoom]);
    const { t: anasNext } = await one(ANA, `select public.revoke_room_link($1) as t`, [northwindRoom]);
    expect(anasNext).not.toBe(anas);
    expect(await rows(JUN, `select name from public.room_preview($1)`, [anas])).toEqual([]);
    expect((await rows(JUN, `select name from public.room_preview($1)`, [theirs])).map((x) => x.name)).toEqual(['Northwind']);
    const { t: fresh } = await one(MAYA, `select public.revoke_room_link($1) as t`, [northwindRoom]);
    expect(fresh).not.toBe(token);
    for (const old of [token, theirs, anasNext]) expect(await refused(JUN, `select public.join_room_by_link($1)`, [old])).toBe(true);
    expect((await rows(JUN, `select invited_by_name from public.room_preview($1)`, [fresh])).map((x) => x.invited_by_name)).toEqual(['Maya C.']);
  });
  it('a link row cannot be edited by hand', async () => {
    expect(await refused(MAYA, `update public.room_links set room_id = $1`, [GENERAL])).toBe(true);
  });
});

describe('leaving and being removed', () => {
  it('removing someone from the team takes them out of its room at once, and tells them and the room', async () => {
    const before = (await one(THEO, `select count(*)::int as n from public.access_events`)).n;
    await as(MAYA, `delete from public.team_members where team_id = $1 and person_id = $2`, [northwind.id, THEO]);
    expect(await rows(THEO, `select id from public.my_rooms() where id = $1`, [northwindRoom])).toEqual([]);
    expect(await rows(THEO, `select body from public.room_messages where room_id = $1`, [northwindRoom])).toEqual([]);
    expect(await rows(THEO, `select * from public.room_events where room_id = $1`, [northwindRoom])).toEqual([]);
    expect((await one(THEO, `select count(*)::int as n from public.access_events`)).n).toBe(before + 1);
    const left = await rows(MAYA, `select kind, person_id from public.room_events where room_id = $1 and kind = 'left'`, [northwindRoom]);
    expect(left).toContainEqual({ kind: 'left', person_id: THEO });
    // Theo's access events are his alone.
    expect(await rows(MAYA, `select * from public.access_events where person_id = $1`, [THEO])).toEqual([]);
  });

  it('a group only takes people you share a room with, and at most twelve', async () => {
    expect(await refused(ANA, `select public.create_room('Us', 'group', false, $1)`, [[BEN]])).toBe(true);
    const many = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`);
    expect(await refused(MAYA, `select public.create_room('Us', 'group', false, $1)`, [many])).toBe(true);
    const { r } = await one(MAYA, `select public.create_room('Launch', 'group', false, $1) as r`, [[JUN]]);
    expect((await rows(JUN, `select name from public.my_rooms() where id = $1`, [r])).map((x) => x.name)).toEqual(['Launch']);
  });

  it('only someone on a team lists a room for everyone, in the alpha', async () => {
    expect(await refused(JUN, `select public.create_room('Night owls', 'room', true, '{}')`)).toBe(true);
    expect(await refused(MAYA, `select public.create_room('Night owls', 'room', true, '{}')`)).toBe(false);
  });

  it('a room for only the people you invite has no link, and an old link stops working', async () => {
    const { r } = await one(MAYA, `select public.create_room('Board', 'room', false, '{}', true) as r`);
    expect((await one(MAYA, `select invite_only from public.my_rooms() where id = $1`, [r])).invite_only).toBe(true);
    expect(await refused(MAYA, `select public.room_link($1)`, [r])).toBe(true);
    await db.query(`insert into public.room_links (room_id, created_by) values ($1, $2)`, [r, MAYA]);
    const { token } = (await db.query(`select token from public.room_links where room_id = $1`, [r])).rows[0];
    expect(await refused(JUN, `select public.join_room_by_link($1)`, [token])).toBe(true);
    expect(await rows(JUN, `select name from public.room_preview($1)`, [token])).toEqual([]);
    expect(await refused(MAYA, `select public.create_room('Both', 'room', true, '{}', true)`)).toBe(true);
  });

  it('an owner leaving hands the room on; the last one out deletes it', async () => {
    const { r } = await one(MAYA, `select public.create_room('Weekend builds', 'room', false, '{}') as r`);
    const { t } = await one(MAYA, `select public.room_link($1) as t`, [r]);
    await as(JUN, `select public.join_room_by_link($1)`, [t]);
    await as(MAYA, `delete from public.room_members where room_id = $1 and person_id = $2`, [r, MAYA]);
    expect((await one(JUN, `select role from public.my_rooms() where id = $1`, [r])).role).toBe('owner');
    await as(JUN, `delete from public.room_members where room_id = $1 and person_id = $2`, [r, JUN]);
    const { n } = (await db.query(`select count(*)::int as n from public.rooms where id = $1`, [r])).rows[0];
    expect(n).toBe(0);
  });

  it('a room open to everyone keeps an owner when its owner leaves, and stays when the last one goes', async () => {
    const { r } = await one(MAYA, `select public.create_room('Open hours', 'room', true, '{}') as r`);
    await as(JUN, `select public.join_listed_room($1)`, [r]);
    await as(MAYA, `delete from public.room_members where room_id = $1 and person_id = $2`, [r, MAYA]);
    expect((await one(JUN, `select role from public.my_rooms() where id = $1`, [r])).role).toBe('owner');
    await as(JUN, `delete from public.room_members where room_id = $1 and person_id = $2`, [r, JUN]);
    const { n } = (await db.query(`select count(*)::int as n from public.rooms where id = $1`, [r])).rows[0];
    expect(n).toBe(1);
  });

  it('General stays when people leave it', async () => {
    await as(JUN, `delete from public.room_members where room_id = $1 and person_id = $2`, [GENERAL, JUN]);
    const { n } = (await db.query(`select count(*)::int as n from public.rooms where id = $1`, [GENERAL])).rows[0];
    expect(n).toBe(1);
  });
});

describe('invites by email', () => {
  it('stop at fifty a day from one person', async () => {
    const { r } = await one(THEO, `select public.create_room('Many', 'room', false, '{}') as r`);
    for (let i = 0; i < 50; i += 1) await as(THEO, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, $2, $3)`, [r, `p${i}@many.test`, THEO]);
    expect(await refused(THEO, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, 'one-more@many.test', $2)`, [r, THEO])).toBe(true);
  });

  it('reach only a confirmed sign-in with that email', async () => {
    const { r } = await one(ANA, `select public.create_room('Friends', 'room', false, '{}') as r`);
    await as(ANA, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, 'ben@friends.test', $2)`, [r, ANA]);
    expect(await rows(BEN, `select room_id from public.pending_room_invites()`)).toEqual([]);
    expect(await refused(BEN, `select public.accept_room_invite($1)`, [r])).toBe(true);
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [BEN]);
    expect((await rows(BEN, `select room_name from public.pending_room_invites()`)).map((x) => x.room_name)).toEqual(['Friends']);
    await as(BEN, `select public.accept_room_invite($1)`, [r]);
    expect((await rows(BEN, `select name from public.my_rooms()`)).map((x) => x.name)).toEqual(['Friends']);
    expect(await refused(BEN, `select public.accept_room_invite($1)`, [r])).toBe(true);
    expect(await rows(BEN, `select room_id from public.pending_room_invites()`)).toEqual([]);
  });

  // The invite dialog lists who you invited, and which of them joined.
  it('stay, marked joined, so the one who sent them can see who came', async () => {
    const [row] = await rows(ANA, `select email, accepted_at from public.room_email_invites where invited_by = $1 and email = 'ben@friends.test'`, [ANA]);
    expect(row.accepted_at).toBeTruthy();
    await as(BEN, `delete from public.room_members where room_id = (select id from public.rooms where name = 'Friends') and person_id = $1`, [BEN]);
    expect(await rows(BEN, `select room_id from public.pending_room_invites()`)).toEqual([]);
  });
});
