// A ROOM TAKES NO ONE BACK AND SHOWS STRANGERS NOTHING PRIVATE (w-4008458eae,
// 2026-10-24). Three holes found in PGlite with every migration applied, each
// a different way around the rule that a room is only for its own people:
//
//   1. A member who was removed walked straight back in. join_room_by_link read
//      only the token, and accept_room_invite only the room and email, so the
//      link and the pending invite outlived their maker leaving. Measured: after
//      remove_room_member the leaver's own link still joined them, and their
//      still-pending invite still accepted; room_preview already refused to name
//      an inviter who had left, so the paths disagreed.
//   2. Any member, a link-joined stranger included, read every invited email.
//      room_invites_read was `in_room`. Measured: a stranger who joined General
//      by link read a room's whole invite list.
//   3. The internal helpers were revoked only from public and anon. On a hosted
//      project that keeps Supabase's stock `grant all on functions to ...
//      authenticated` default they stayed callable. Measured below by setting
//      that default before the migrations run: has_function_privilege said
//      authenticated could execute join_into, and a stranger's select
//      public.join_into(<team room>) joined them.
//
// Same PGlite stand-in as rooms-cloud-shows-each-room-only-to-its-people.
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
// The stock default a Supabase project made before 2025 keeps: every new
// function is executable by every role. The rooms migrations revoke the
// internal helpers only from public and anon, so this is what hides bug 3.
const STOCK_DEFAULT = `alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`;

const OWNER = '10000000-0000-4000-8000-000000000001';
const MEMBER = '10000000-0000-4000-8000-000000000002';
const FRIEND = '10000000-0000-4000-8000-000000000003';
const GUEST = '10000000-0000-4000-8000-000000000004';
const INVITER = '10000000-0000-4000-8000-000000000005';
const NEWGUEST = '10000000-0000-4000-8000-000000000006';
const CONFIRMED = '10000000-0000-4000-8000-000000000007';
const STRANGER = '10000000-0000-4000-8000-000000000008';
const MEMBER2 = '10000000-0000-4000-8000-000000000009';
const TOWNER = '10000000-0000-4000-8000-00000000000a';
const TMEMBER = '10000000-0000-4000-8000-00000000000b';

let db;

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

async function signUp(id, email, fullName) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: fullName }]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [
    [OWNER, 'owner@rooms.test', 'Olive Owner'],
    [MEMBER, 'member@rooms.test', 'Mel Member'],
    [FRIEND, 'friend@rooms.test', 'Fay Friend'],
    [GUEST, 'guest@rooms.test', 'Gus Guest'],
    [INVITER, 'inviter@rooms.test', 'Ivy Inviter'],
    [NEWGUEST, 'newguest@rooms.test', 'Ned Newguest'],
    [CONFIRMED, 'confirmed@rooms.test', 'Cam Confirmed'],
    [STRANGER, 'stranger@rooms.test', 'Sam Stranger'],
    [MEMBER2, 'member2@rooms.test', 'Moe Member2'],
    [TOWNER, 'towner@rooms.test', 'Tess Owner'],
    [TMEMBER, 'tmember@rooms.test', 'Tom Member'],
  ]) await signUp(id, email, name);
}, 60_000);
afterAll(() => db.close());

describe('a removed member cannot walk back into a room', () => {
  it('their own link stops working, and so does it in someone else’s hands', async () => {
    const { r } = await one(OWNER, `select public.create_room('Crew', 'room', false, '{}') as r`);
    const { t } = await one(OWNER, `select public.room_link($1) as t`, [r]);
    await as(MEMBER, `select public.join_room_by_link($1)`, [t]);
    const { ml } = await one(MEMBER, `select public.room_link($1) as ml`, [r]);
    await as(OWNER, `select public.remove_room_member($1, $2)`, [r, MEMBER]);
    expect(await rows(MEMBER, `select id from public.my_rooms() where id = $1`, [r])).toEqual([]);
    expect(await refused(MEMBER, `select public.join_room_by_link($1)`, [ml])).toBe(true);
    // Leaving revokes the leaver's link on the way out.
    expect((await db.query(`select revoked_at from public.room_links where token = $1`, [ml])).rows[0].revoked_at).toBeTruthy();
    // And forced live again, it is dead because its maker is no longer in the room.
    await db.query(`update public.room_links set revoked_at = null where token = $1`, [ml]);
    expect(await refused(FRIEND, `select public.join_room_by_link($1)`, [ml])).toBe(true);
  });

  it('their still-pending email invite stops working', async () => {
    const { r } = await one(OWNER, `select public.create_room('Deck', 'room', false, '{}') as r`);
    await as(OWNER, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, 'guest@rooms.test', $2)`, [r, OWNER]);
    const { t } = await one(OWNER, `select public.room_link($1) as t`, [r]);
    await as(GUEST, `select public.join_room_by_link($1)`, [t]); // a member now, invite still pending
    expect((await rows(GUEST, `select id from public.my_rooms() where id = $1`, [r])).length).toBe(1);
    await as(OWNER, `select public.remove_room_member($1, $2)`, [r, GUEST]);
    expect(await refused(GUEST, `select public.accept_room_invite($1)`, [r])).toBe(true);
    expect(await rows(GUEST, `select room_id from public.pending_room_invites()`)).toEqual([]);
  });

  it('an invite from someone who has since left the room no longer works', async () => {
    const { r } = await one(OWNER, `select public.create_room('Studio', 'room', false, '{}') as r`);
    const { t } = await one(OWNER, `select public.room_link($1) as t`, [r]);
    await as(INVITER, `select public.join_room_by_link($1)`, [t]);
    await as(INVITER, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, 'newguest@rooms.test', $2)`, [r, INVITER]);
    await as(INVITER, `delete from public.room_members where room_id = $1 and person_id = $2`, [r, INVITER]);
    // The invite was sent to Ned, not to the leaver, so it stays; its sender is gone.
    expect((await db.query(`select count(*)::int as n from public.room_email_invites where room_id = $1 and email = 'newguest@rooms.test' and accepted_at is null`, [r])).rows[0].n).toBe(1);
    expect(await refused(NEWGUEST, `select public.accept_room_invite($1)`, [r])).toBe(true);
  });

  it('removed from a team, their link to its room dies too', async () => {
    const [team] = await rows(TOWNER, `insert into public.teams (name, created_by) values ('Builders', $1) returning id`, [TOWNER]);
    await as(TOWNER, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, TOWNER]);
    await as(TOWNER, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'tmember@rooms.test', $2)`, [team.id, TOWNER]);
    await as(TMEMBER, `select public.accept_invite($1)`, [team.id]);
    const { id: teamRoom } = await one(TOWNER, `select id from public.rooms where team_id = $1`, [team.id]);
    const { t } = await one(TMEMBER, `select public.room_link($1) as t`, [teamRoom]);
    await as(TOWNER, `delete from public.team_members where team_id = $1 and person_id = $2`, [team.id, TMEMBER]);
    expect(await rows(TMEMBER, `select id from public.my_rooms() where id = $1`, [teamRoom])).toEqual([]);
    expect(await refused(TMEMBER, `select public.join_room_by_link($1)`, [t])).toBe(true);
    expect((await db.query(`select revoked_at from public.room_links where token = $1`, [t])).rows[0].revoked_at).toBeTruthy();
  });

  it('a member still in the room keeps inviting by link and by email', async () => {
    const { r } = await one(OWNER, `select public.create_room('Hall', 'room', false, '{}') as r`);
    const { t } = await one(OWNER, `select public.room_link($1) as t`, [r]);
    await as(FRIEND, `select public.join_room_by_link($1)`, [t]);
    expect((await rows(FRIEND, `select name from public.my_rooms() where id = $1`, [r])).map((x) => x.name)).toEqual(['Hall']);
    await as(OWNER, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, 'confirmed@rooms.test', $2)`, [r, OWNER]);
    expect((await rows(CONFIRMED, `select room_name from public.pending_room_invites()`)).map((x) => x.room_name)).toContain('Hall');
    await as(CONFIRMED, `select public.accept_room_invite($1)`, [r]);
    expect((await rows(CONFIRMED, `select name from public.my_rooms() where id = $1`, [r])).map((x) => x.name)).toEqual(['Hall']);
  });
});

describe('only the sender or the owner reads an invited email', () => {
  let r;
  beforeAll(async () => {
    ({ r } = await one(OWNER, `select public.create_room('Lobby', 'room', false, '{}') as r`));
    const { t } = await one(OWNER, `select public.room_link($1) as t`, [r]);
    await as(MEMBER2, `select public.join_room_by_link($1)`, [t]);
    await as(STRANGER, `select public.join_room_by_link($1)`, [t]);
    await as(OWNER, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, 'ola@rooms.test', $2)`, [r, OWNER]);
    await as(MEMBER2, `insert into public.room_email_invites (room_id, email, invited_by) values ($1, 'mila@rooms.test', $2)`, [r, MEMBER2]);
  });

  it('a stranger in the room reads no invite', async () => {
    expect(await rows(STRANGER, `select email from public.room_email_invites where room_id = $1`, [r])).toEqual([]);
  });
  it('the sender reads only the invite they sent', async () => {
    expect((await rows(MEMBER2, `select email from public.room_email_invites where room_id = $1`, [r])).map((x) => x.email).sort()).toEqual(['mila@rooms.test']);
  });
  it('the owner reads every invite to their room', async () => {
    expect((await rows(OWNER, `select email from public.room_email_invites where room_id = $1`, [r])).map((x) => x.email).sort()).toEqual(['mila@rooms.test', 'ola@rooms.test']);
  });
});

describe('the internal helpers are no one’s to call, even on stock default grants', () => {
  let stock, teamRoom;
  const BOSS = '20000000-0000-4000-8000-000000000001';
  const OUTSIDER = '20000000-0000-4000-8000-000000000002';
  // Revoked from authenticated by this migration; none are a public API RPC.
  const internal = [
    'public.join_into(uuid)', 'public.rooms_of(uuid)', 'public.room_member_count(uuid)',
    'public.my_email()', 'public.room_limit(text, int, interval)', 'public.room_act(text, int, interval)',
  ];
  // Must stay callable by authenticated.
  const api = [
    'public.join_room_by_link(text)', 'public.accept_room_invite(uuid)',
    'public.create_room(text, text, boolean, uuid[], boolean)', 'public.join_listed_room(uuid)',
    'public.room_link(uuid)', 'public.revoke_room_link(uuid)', 'public.remove_room_member(uuid, uuid)',
    'public.mark_room_read(uuid, timestamptz)', 'public.room_preview(text)', 'public.listed_rooms()',
    'public.agentbox_ranks(uuid[])',
  ];
  const can = async (role, f) => (await stock.query(`select has_function_privilege($1, $2, 'execute') as ok`, [role, f])).rows[0].ok;

  beforeAll(async () => {
    stock = new PGlite();
    await stock.exec(SUPABASE_STAND_IN);
    await stock.exec(STOCK_DEFAULT);
    await stock.exec(migration);
    await stock.exec(GRANTS);
    await stock.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'boss@stock.test', now()), ($2, 'outsider@stock.test', now())`, [BOSS, OUTSIDER]);
    await stock.exec(`select set_config('request.jwt.claim.sub', '${BOSS}', false); set role authenticated;`);
    const [{ id: teamId }] = (await stock.query(`insert into public.teams (name, created_by) values ('Stock', $1) returning id`, [BOSS])).rows;
    await stock.query(`insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [teamId, BOSS]);
    await stock.exec('reset role;');
    [{ id: teamRoom }] = (await stock.query(`select id from public.rooms where team_id = $1`, [teamId])).rows;
  }, 60_000);
  afterAll(() => stock.close());

  it('authenticated cannot execute them', async () => {
    for (const f of internal) expect(await can('authenticated', f), f).toBe(false);
  });
  it('but can still execute every public API RPC', async () => {
    for (const f of api) expect(await can('authenticated', f), f).toBe(true);
  });
  it('a signed-in stranger cannot call join_into to let themselves into a team room', async () => {
    await stock.exec(`select set_config('request.jwt.claim.sub', '${OUTSIDER}', false); set role authenticated;`);
    let blocked = false;
    try { await stock.query(`select public.join_into($1)`, [teamRoom]); } catch { blocked = true; }
    await stock.exec('reset role;');
    expect(blocked).toBe(true);
    expect((await stock.query(`select count(*)::int as n from public.room_members where person_id = $1`, [OUTSIDER])).rows[0].n).toBe(0);
  });
});
