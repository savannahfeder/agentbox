// THE GROUP EVERYONE JOINS IS CALLED COWORKING (w-64116bb761, 2026-10-24).
//
// Someone with no team lands in one open group, seeded as "General". The
// founder did not like the name; of six drawn in the app, Coworking was
// picked. Measured on PGlite with every migration and on the in-memory cloud:
// the group keeps its id, so everyone already in it stays, and only its name
// changes. A room somebody else called General keeps that name.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { GENERAL_ROOM } from '../main/team/rooms-memory.mjs';

const dir = path.join(import.meta.dirname, '..', 'cloud/supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const RENAME = '20261026120000_general_is_coworking.sql';
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
const OTHER = '9e9e9e9e-0000-4000-8000-0000000000aa';

describe('on the cloud', () => {
  let db;
  const nameOf = async (id) => (await db.query('select name, listed from public.rooms where id = $1', [id])).rows[0];
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(STAND_IN);
    await db.exec(sql(files.filter((f) => f < RENAME)));
    await db.exec(`insert into public.rooms (id, name, kind, listed) values ('${OTHER}', 'General', 'room', false)`);
    await db.exec(sql([RENAME]));
  }, 60_000);
  afterAll(() => db.close());

  it('the group everyone joins keeps its id and is called Coworking', async () => {
    expect(await nameOf(GENERAL_ROOM)).toEqual({ name: 'Coworking', listed: true });
  });
  it('a room somebody else called General keeps its name', async () => {
    expect((await nameOf(OTHER)).name).toBe('General');
  });
  it('running it again changes nothing', async () => {
    await db.exec(sql([RENAME]));
    expect(await nameOf(GENERAL_ROOM)).toEqual({ name: 'Coworking', listed: true });
  });
});

describe('on the in-memory cloud', () => {
  it('Find groups lists it as Coworking', async () => {
    const cloud = createMemoryCloud();
    const me = memoryBackend(cloud, signUpMemory(cloud, { email: 'alex@elsewhere.test', name: 'Alex Rivera' }));
    const listed = await me.listedRooms();
    expect(listed.find((r) => r.id === GENERAL_ROOM)).toMatchObject({ name: 'Coworking' });
  });
});
