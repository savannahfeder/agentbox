// ROOMS CLOUD: ONLY THE AUTHOR CHANGES A MESSAGE, AND ONLY THE ROOM SEES WHAT HANGS OFF IT (2026-10-21).
//
// Room chat could only send and read plain messages: no reactions, no editing
// or deleting your own message, no marking a room unread, and no file on a
// message, so a voice note or an attachment had nowhere to live.
// 20261022000000_room_messages_do_more.sql adds them. Each is a door a stranger
// could walk through (editing someone else's words, reading a room's files from
// outside it), so each door is tried here from both sides.
//
// Every migration runs in an in-process Postgres (PGlite) with Supabase's auth
// schema stood in, as in rooms-cloud-shows-each-room-only-to-its-people.
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
const GENERAL = '9e9e9e9e-0000-4000-8000-000000000001';

let db;
let room;

async function as(person, sql, params = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const one = async (person, sql, params) => (await rows(person, sql, params))[0];
const refused = async (person, sql, params, role) => {
  try { await as(person, sql, params, role); return false; } catch { return true; }
};
const errorOf = async (person, sql, params) => {
  try { await as(person, sql, params); return null; } catch (err) { return err; }
};
const say = async (person, body, mentions = []) => (await one(person,
  `insert into public.room_messages (room_id, by_person, body, mentions) values ($1, $2, $3, $4) returning id`, [room, person, body, mentions])).id;
const asRoot = async (sql, params) => (await db.query(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@northwind.test', 'Maya Chen'], [THEO, 'theo@northwind.test', 'Theo Park'], [JUN, 'jun@elsewhere.test', 'Jun Ito']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
  }
  const [team] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, MAYA]);
  await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo@northwind.test', $2)`, [team.id, MAYA]);
  await as(THEO, `select public.accept_invite($1)`, [team.id]);
  ({ id: room } = await one(MAYA, `select id from public.rooms where team_id = $1`, [team.id]));
  await as(JUN, `select public.join_listed_room($1)`, [GENERAL]);
}, 60_000);
afterAll(() => db.close());

describe('editing a message', () => {
  it('the author edits: new words, an edit time, and mentions only of people in the room', async () => {
    const m = await say(MAYA, 'first try');
    const edited = await one(MAYA, `select body, edited_at, mentions from public.edit_room_message($1, $2, $3)`, [m, 'second try @Theo @Jun', [THEO, JUN]]);
    expect(edited.body).toBe('second try @Theo @Jun');
    expect(edited.edited_at).toBeTruthy();
    expect(edited.mentions).toEqual([THEO]);
    expect((await one(THEO, `select body, edited_at from public.room_messages where id = $1`, [m])).body).toBe('second try @Theo @Jun');
  });

  it('a teammate’s edit is refused, and so is someone outside the room’s', async () => {
    const m = await say(MAYA, 'mine');
    expect(await refused(THEO, `select public.edit_room_message($1, 'theirs now')`, [m])).toBe(true);
    expect(await refused(JUN, `select public.edit_room_message($1, 'theirs now')`, [m])).toBe(true);
    expect((await one(MAYA, `select body, edited_at from public.room_messages where id = $1`, [m]))).toEqual({ body: 'mine', edited_at: null });
  });

  it('an edit keeps a message between 1 and 4000 characters', async () => {
    const m = await say(MAYA, 'short');
    expect(await refused(MAYA, `select public.edit_room_message($1, '   ')`, [m])).toBe(true);
    expect(await refused(MAYA, `select public.edit_room_message($1, $2)`, [m, 'x'.repeat(4001)])).toBe(true);
    expect(await refused(MAYA, `select public.edit_room_message($1, $2)`, [m, 'x'.repeat(4000)])).toBe(false);
  });

  it('nobody changes a message by hand, not even its author', async () => {
    const m = await say(MAYA, 'by hand');
    expect(await refused(MAYA, `update public.room_messages set body = 'changed' where id = $1`, [m])).toBe(true);
    expect(await refused(MAYA, `delete from public.room_messages where id = $1`, [m])).toBe(true);
  });

  it('a new message cannot arrive already edited or already deleted', async () => {
    const [m] = await rows(MAYA, `insert into public.room_messages (room_id, by_person, body, edited_at) values ($1, $2, 'fresh', now()) returning edited_at, deleted_at`, [room, MAYA]);
    expect(m).toEqual({ edited_at: null, deleted_at: null });
    expect(await refused(MAYA, `insert into public.room_messages (room_id, by_person, body, deleted_at) values ($1, $2, '', now())`, [room, MAYA])).toBe(true);
  });

  it('twenty edits a minute, then no more', async () => {
    const m = await say(THEO, 'edit me');
    let refusedAt = null;
    for (let i = 0; i < 25 && refusedAt === null; i += 1) {
      if (await refused(THEO, `select public.edit_room_message($1, $2)`, [m, `edit ${i}`])) refusedAt = i;
    }
    expect(refusedAt).toBe(20);
  });
});

describe('deleting a message', () => {
  it('only its author deletes it; it stays in its place with no words, mentions or reactions', async () => {
    const m = await say(MAYA, 'gone soon @Theo', [THEO]);
    await as(THEO, `select public.react_room_message($1, '👍', true)`, [m]);
    expect(await refused(THEO, `select public.delete_room_message($1)`, [m])).toBe(true);
    expect(await refused(JUN, `select public.delete_room_message($1)`, [m])).toBe(true);
    expect((await one(THEO, `select body from public.room_messages where id = $1`, [m])).body).toBe('gone soon @Theo');
    await as(MAYA, `select public.delete_room_message($1)`, [m]);
    const row = await one(THEO, `select body, mentions, deleted_at, created_at from public.room_messages where id = $1`, [m]);
    expect(row).toMatchObject({ body: '', mentions: [] });
    expect(row.deleted_at).toBeTruthy();
    expect(await asRoot(`select * from public.room_reactions where message_id = $1`, [m])).toEqual([]);
  });

  it('a deleted message takes no edit and no reaction, and deleting it again changes nothing', async () => {
    const m = await say(MAYA, 'to delete');
    await as(MAYA, `select public.delete_room_message($1)`, [m]);
    const { deleted_at: first } = await one(MAYA, `select deleted_at from public.room_messages where id = $1`, [m]);
    expect(await refused(MAYA, `select public.edit_room_message($1, 'back')`, [m])).toBe(true);
    expect(await refused(THEO, `select public.react_room_message($1, '👍', true)`, [m])).toBe(true);
    expect(await refused(MAYA, `select public.delete_room_message($1)`, [m])).toBe(false);
    expect((await one(MAYA, `select deleted_at from public.room_messages where id = $1`, [m])).deleted_at).toEqual(first);
  });

  it('takes the author’s own files named in it, and leaves every other file', async () => {
    for (const [who, name] of [[MAYA, 'voice-1.webm'], [MAYA, 'kept.png'], [THEO, 'theirs.png']]) {
      await as(who, `insert into public.room_files (room_id, name, by_person, data) values ($1, $2, $3, 'AAAA')`, [room, name, who]);
    }
    const m = await say(MAYA, '[voice](attachments/voice-1.webm) and [theirs](attachments/theirs.png)');
    await as(MAYA, `select public.delete_room_message($1)`, [m]);
    expect((await rows(THEO, `select name from public.room_files where room_id = $1 order by name`, [room])).map((r) => r.name)).toEqual(['kept.png', 'theirs.png']);
  });
});

describe('reactions', () => {
  it('people in the room react and read them; the room comes from the message', async () => {
    const m = await say(MAYA, 'react to this');
    await as(THEO, `select public.react_room_message($1, '🎉', true)`, [m]);
    await as(MAYA, `select public.react_room_message($1, '🎉')`, [m]);
    const got = await rows(MAYA, `select room_id, person_id, emoji, is_on from public.room_reactions where message_id = $1 order by person_id`, [m]);
    expect(got).toEqual([
      { room_id: room, person_id: MAYA, emoji: '🎉', is_on: true },
      { room_id: room, person_id: THEO, emoji: '🎉', is_on: true },
    ]);
  });

  it('someone outside the room can neither react nor read them', async () => {
    const m = await say(MAYA, 'not for Jun');
    await as(THEO, `select public.react_room_message($1, '👀', true)`, [m]);
    expect(await refused(JUN, `select public.react_room_message($1, '👀', true)`, [m])).toBe(true);
    expect(await rows(JUN, `select * from public.room_reactions where message_id = $1`, [m])).toEqual([]);
  });

  it('turning one off is an update: the row stays, marked off, and turns on again', async () => {
    const m = await say(MAYA, 'toggle');
    await as(THEO, `select public.react_room_message($1, '👍', true)`, [m]);
    await as(THEO, `select public.react_room_message($1, '👍', false)`, [m]);
    expect(await rows(MAYA, `select emoji, is_on from public.room_reactions where message_id = $1`, [m])).toEqual([{ emoji: '👍', is_on: false }]);
    await as(THEO, `select public.react_room_message($1, '👍', true)`, [m]);
    expect(await rows(MAYA, `select emoji, is_on from public.room_reactions where message_id = $1`, [m])).toEqual([{ emoji: '👍', is_on: true }]);
  });

  it('turning off one I never made writes nothing', async () => {
    const m = await say(MAYA, 'never');
    await as(THEO, `select public.react_room_message($1, '🔥', false)`, [m]);
    expect(await rows(MAYA, `select * from public.room_reactions where message_id = $1`, [m])).toEqual([]);
  });

  it('nobody writes a reaction by hand, for themselves or anyone else', async () => {
    const m = await say(MAYA, 'by hand');
    expect(await refused(THEO, `insert into public.room_reactions (message_id, room_id, person_id, emoji) values ($1, $2, $3, '👍')`, [m, room, THEO])).toBe(true);
    await as(THEO, `select public.react_room_message($1, '👍', true)`, [m]);
    expect(await refused(MAYA, `update public.room_reactions set is_on = false where message_id = $1`, [m])).toBe(true);
    expect(await refused(MAYA, `delete from public.room_reactions where message_id = $1`, [m])).toBe(true);
  });

  it('an emoji is 1 to 16 characters and not blank', async () => {
    const m = await say(MAYA, 'emoji sizes');
    expect(await refused(THEO, `select public.react_room_message($1, '', true)`, [m])).toBe(true);
    expect(await refused(THEO, `select public.react_room_message($1, ' ', true)`, [m])).toBe(true);
    expect(await refused(THEO, `select public.react_room_message($1, $2, true)`, [m, 'x'.repeat(17)])).toBe(true);
    expect(await refused(THEO, `select public.react_room_message($1, $2, true)`, [m, 'x'.repeat(16)])).toBe(false);
  });

  it('sixty a minute, then no more', async () => {
    const { id: m } = await one(JUN, `insert into public.room_messages (room_id, by_person, body) values ($1, $2, 'many') returning id`, [GENERAL, JUN]);
    let refusedAt = null;
    for (let i = 0; i < 65 && refusedAt === null; i += 1) {
      if (await refused(JUN, `select public.react_room_message($1, $2, true)`, [m, `e${i}`])) refusedAt = i;
    }
    expect(refusedAt).toBe(60);
  });
});

describe('files on a message', () => {
  it('a member adds one as themselves, and the room reads it', async () => {
    await as(THEO, `insert into public.room_files (room_id, name, by_person, data) values ($1, 'note-2.webm', $2, 'QUJD')`, [room, THEO]);
    expect((await one(MAYA, `select data, by_person from public.room_files where room_id = $1 and name = 'note-2.webm'`, [room]))).toEqual({ data: 'QUJD', by_person: THEO });
  });

  it('someone outside the room neither reads nor adds one', async () => {
    expect(await rows(JUN, `select * from public.room_files where room_id = $1`, [room])).toEqual([]);
    expect(await refused(JUN, `insert into public.room_files (room_id, name, by_person, data) values ($1, 'in.png', $2, 'AAAA')`, [room, JUN])).toBe(true);
  });

  it('nobody adds one as somebody else', async () => {
    expect(await refused(THEO, `insert into public.room_files (room_id, name, by_person, data) values ($1, 'fake.png', $2, 'AAAA')`, [room, MAYA])).toBe(true);
  });

  it('a name is a plain name of up to 160 characters', async () => {
    for (const bad of ['../x.png', '.hidden', 'a/b.png', 'with space.png', `a${'b'.repeat(160)}`]) {
      expect(await refused(THEO, `insert into public.room_files (room_id, name, by_person, data) values ($1, $2, $3, 'AAAA')`, [room, bad, THEO]), bad).toBe(true);
    }
    expect(await refused(THEO, `insert into public.room_files (room_id, name, by_person, data) values ($1, $2, $3, 'AAAA')`, [room, `a${'b'.repeat(159)}`, THEO])).toBe(false);
  });

  // A delete landing between an edit's checks and its update must not have the
  // edit write words back into a deleted row, where a member could still read
  // them. PGlite has one connection and cannot interleave the two, so the
  // locks and the guard are pinned in the function's own text.
  it('locks the message while it is edited, deleted or reacted to, and never edits a deleted row', async () => {
    const src = async (fn) => (await db.query(`select prosrc from pg_proc where proname = $1`, [fn])).rows[0].prosrc;
    expect(await src('edit_room_message')).toMatch(/where id = m for update;/);
    expect(await src('edit_room_message')).toMatch(/where id = m and deleted_at is null/);
    expect(await src('delete_room_message')).toMatch(/where id = m for update;/);
    expect(await src('react_room_message')).toMatch(/where id = m for share;/);
  });

  // 10 MiB is 10,485,760 bytes, which base64 writes in 13,981,016 characters
  // ending in '=='. The same length without padding decodes to two bytes more.
  // A member can insert here directly, so this is the limit that holds.
  it('up to 10 MiB of file, counted in decoded bytes, and not one byte more', async () => {
    const insert = (data) => refused(MAYA, `insert into public.room_files (room_id, name, by_person, data) values ($1, 'big.bin', $2, $3)`, [room, MAYA, data]);
    expect(await insert(`${'A'.repeat(13981012)}AAA=`)).toBe(true);
    expect(await insert('A'.repeat(13981016))).toBe(true);
    expect(await insert('A'.repeat(13981020))).toBe(true);
    expect(await insert(`${'A'.repeat(13981012)}AA==`)).toBe(false);
  });

  it('a name is kept once: a second file of that name is a conflict, and nothing is changed or deleted by hand', async () => {
    const err = await errorOf(THEO, `insert into public.room_files (room_id, name, by_person, data) values ($1, 'note-2.webm', $2, 'WFla')`, [room, THEO]);
    expect(err?.code).toBe('23505');
    expect(await refused(THEO, `update public.room_files set data = 'WFla' where name = 'note-2.webm'`)).toBe(true);
    expect(await refused(THEO, `delete from public.room_files where name = 'note-2.webm'`)).toBe(true);
    expect((await one(MAYA, `select data from public.room_files where name = 'note-2.webm'`)).data).toBe('QUJD');
  });

  it('thirty files in ten minutes from one person, then no more', async () => {
    const before = (await one(JUN, `select count(*)::int as n from public.room_files where by_person = $1`, [JUN])).n;
    expect(before).toBe(0);
    let refusedAt = null;
    for (let i = 0; i < 35 && refusedAt === null; i += 1) {
      if (await refused(JUN, `insert into public.room_files (room_id, name, by_person, data) values ($1, $2, $3, 'AAAA')`, [GENERAL, `f${i}.png`, JUN])) refusedAt = i;
    }
    expect(refusedAt).toBe(30);
  });
});

describe('marking a room unread', () => {
  it('moves my read point back, which marking read never does', async () => {
    await as(MAYA, `select public.mark_room_read($1, '2026-10-20T12:00:00Z')`, [room]);
    await as(MAYA, `select public.mark_room_unread($1, '2026-10-20T09:00:00Z')`, [room]);
    expect(new Date((await one(MAYA, `select read_at from public.room_reads where room_id = $1`, [room])).read_at).toISOString()).toBe('2026-10-20T09:00:00.000Z');
    await as(MAYA, `select public.mark_room_read($1, '2026-10-20T08:00:00Z')`, [room]);
    expect(new Date((await one(MAYA, `select read_at from public.room_reads where room_id = $1`, [room])).read_at).toISOString()).toBe('2026-10-20T09:00:00.000Z');
  });

  it('only mine: a teammate’s read point stays where it was', async () => {
    await as(THEO, `select public.mark_room_read($1, '2026-10-20T12:00:00Z')`, [room]);
    await as(MAYA, `select public.mark_room_unread($1, '2026-10-20T07:00:00Z')`, [room]);
    expect(new Date((await one(THEO, `select read_at from public.room_reads where room_id = $1`, [room])).read_at).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('a time ahead of the cloud’s clock is taken as now, and a room I am not in is refused', async () => {
    await as(MAYA, `select public.mark_room_unread($1, now() + interval '1 day')`, [room]);
    expect((await one(MAYA, `select read_at <= now() as ok from public.room_reads where room_id = $1`, [room])).ok).toBe(true);
    expect(await refused(JUN, `select public.mark_room_unread($1, now())`, [room])).toBe(true);
    expect(await refused(MAYA, `select public.mark_room_unread($1, null)`, [room])).toBe(true);
  });
});

describe('signed out', () => {
  it('reads no reaction or file, and calls none of the new doors', async () => {
    for (const t of ['room_reactions', 'room_files']) expect(await refused(null, `select * from public.${t}`, [], 'anon'), t).toBe(true);
    const m = (await asRoot(`select id from public.room_messages limit 1`))[0].id;
    expect(await refused(null, `select public.react_room_message($1, '👍', true)`, [m], 'anon')).toBe(true);
    expect(await refused(null, `select public.edit_room_message($1, 'x')`, [m], 'anon')).toBe(true);
    expect(await refused(null, `select public.delete_room_message($1)`, [m], 'anon')).toBe(true);
    expect(await refused(null, `select public.mark_room_unread($1, now())`, [room], 'anon')).toBe(true);
  });
});

describe('realtime', () => {
  it('carries reactions and messages, and never the files themselves', async () => {
    const published = (await asRoot(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).map((r) => r.tablename);
    expect(published).toEqual(expect.arrayContaining(['room_reactions', 'room_messages']));
    expect(published).not.toContain('room_files');
  });

  it('the migration runs twice without complaint', async () => {
    const again = fs.readFileSync(path.join(migrationsDir, '20261022000000_room_messages_do_more.sql'), 'utf8');
    await db.exec(again);
    expect((await asRoot(`select count(*)::int as n from public.room_messages`))[0].n).toBeGreaterThan(0);
  });
});
