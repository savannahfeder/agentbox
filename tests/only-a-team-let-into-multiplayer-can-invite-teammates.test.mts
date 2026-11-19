// Multiplayer is invite-only for now (2026-11-19). Before this, anyone signed
// in could make a team and invite people to it, so a Loom post saying "we're
// bringing on a few teams" would have let in everyone who downloaded the app.
// These run every real migration in PGlite with Supabase's auth stood in.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'cloud/supabase/migrations');
const GATE = '20261119000000_multiplayer_is_invite_only.sql';
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const read = (list: string[]) => list.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

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

const OLD = '11111111-1111-1111-1111-111111111111';
const ASKED = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';
const MATE = '44444444-4444-4444-4444-444444444444';
const UNCONFIRMED = '55555555-5555-5555-5555-555555555555';

let db: PGlite;

async function as(person: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const refusal = async (person: string, sql: string, params: unknown[] = []) => {
  try { await as(person, sql, params); return null; } catch (e) { return String((e as Error).message); }
};
const invite = (person: string, team: string, email: string) =>
  refusal(person, `insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)`, [team, email, person]);
const mine = async (person: string) => ((await as(person, `select public.i_have_multiplayer() as on`)).rows[0] as { on: boolean }).on;
const sends = async (person: string) => ((await db.query(`select count(*)::int as n from public.team_invite_sends where invited_by = $1`, [person])).rows[0] as { n: number }).n;

async function signUp(id: string, email: string, confirmed = true) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, ${confirmed ? 'now()' : 'null'})`, [id, email]);
}
async function teamOf(owner: string, name: string) {
  const { rows } = await as(owner, `insert into public.teams (name, created_by) values ($1, $2) returning id`, [name, owner]);
  const team = (rows[0] as { id: string }).id;
  await as(owner, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team, owner]);
  return team;
}

let oldTeam = '';

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(read(files.filter((f) => f < GATE)));
  await db.exec(GRANTS);
  await signUp(OLD, 'early@before.test');
  oldTeam = await teamOf(OLD, 'Made before the gate');
  await db.exec(read(files.filter((f) => f >= GATE)));
  await db.exec(GRANTS);
  await signUp(ASKED, 'Asked@Invited.test');
  await signUp(STRANGER, 'someone@stranger.test');
  await signUp(MATE, 'mate@invited.test');
  await signUp(UNCONFIRMED, 'asked-too@invited.test', false);
  await db.query(`insert into public.multiplayer_people (email) values ('asked@invited.test'), ('asked-too@invited.test')`);
}, 60_000);
afterAll(() => db.close());

describe('a team that is not let in', () => {
  it('can still be made, so a paid plan has a team to buy seats for', async () => {
    expect(await teamOf(STRANGER, 'On my own')).toMatch(/-/);
  });

  it('cannot invite anyone, and the refusal says why', async () => {
    const team = await teamOf(STRANGER, 'Trying');
    expect(await invite(STRANGER, team, 'friend@stranger.test')).toMatch(/invite-only/);
    expect((await db.query(`select * from public.team_invites where team_id = $1`, [team])).rows).toEqual([]);
  });

  it('spends none of the daily invitations on a refusal', async () => {
    expect(await sends(STRANGER)).toBe(0);
  });

  it('cannot put itself on the list or let its own team in', async () => {
    expect(await refusal(STRANGER, `insert into public.multiplayer_people (email) values ('someone@stranger.test')`)).toMatch(/permission denied/);
    expect(await refusal(STRANGER, `insert into public.multiplayer_teams (team_id) select id from public.teams where created_by = $1`, [STRANGER])).toMatch(/permission denied/);
    expect(await refusal(STRANGER, `select * from public.multiplayer_people`)).toMatch(/permission denied/);
    expect(await mine(STRANGER)).toBe(false);
  });

  it('is not let in by an unconfirmed email that is on the list', async () => {
    const team = await teamOf(UNCONFIRMED, 'Not yet confirmed');
    expect(await invite(UNCONFIRMED, team, 'x@invited.test')).toMatch(/invite-only/);
    expect(await mine(UNCONFIRMED)).toBe(false);
  });
});

describe('a team let in', () => {
  it('invites when its owner signs in with an email on the list, in any case', async () => {
    expect(await mine(ASKED)).toBe(true);
    const team = await teamOf(ASKED, 'Invited');
    expect(await invite(ASKED, team, 'mate@invited.test')).toBeNull();
  });

  it('lets the teammate who joined invite too, and tells them they have multiplayer', async () => {
    const team = ((await db.query(`select id from public.teams where name = 'Invited'`)).rows[0] as { id: string }).id;
    expect(await mine(MATE)).toBe(false);
    await as(MATE, `select public.accept_invite($1)`, [team]);
    expect(await mine(MATE)).toBe(true);
    expect(await invite(MATE, team, 'third@invited.test')).toBeNull();
  });

  it('keeps inviting if it was made before the gate', async () => {
    expect(await invite(OLD, oldTeam, 'later@before.test')).toBeNull();
    expect(await mine(OLD)).toBe(true);
  });

  it('can be let in by hand, without anyone on the list', async () => {
    const team = await teamOf(STRANGER, 'Let in by hand');
    await db.query(`insert into public.multiplayer_teams (team_id) values ($1)`, [team]);
    expect(await invite(STRANGER, team, 'friend@stranger.test')).toBeNull();
  });
});

describe('opening it to everyone', () => {
  it('lets every team invite once the list holds a star', async () => {
    const someone = '66666666-6666-6666-6666-666666666666';
    await signUp(someone, 'anyone@anywhere.test');
    const team = await teamOf(someone, 'Anyone');
    expect(await invite(someone, team, 'a@anywhere.test')).toMatch(/invite-only/);
    await db.query(`insert into public.multiplayer_people (email) values ('*')`);
    expect(await invite(someone, team, 'a@anywhere.test')).toBeNull();
    expect(await mine(someone)).toBe(true);
  });
});
