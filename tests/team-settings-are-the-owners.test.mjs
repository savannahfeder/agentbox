// THE SHARED DATABASE SHOWS A PERSON THEIR OWN TEAM AND NOTHING ELSE.
//
// (Harness copied from team-cloud-keeps-each-team-to-itself.)
// cloud/migrations/0001_team.sql is the whole of the shared part: people,
// teams, shared projects, their ledger lines, and the title-free activity of
// private work. Every rule about who sees what lives in its row level
// security, so a bug there is a teammate (or a stranger) reading another
// team's work. These tests run the real migration in an in-process Postgres
// (PGlite) with Supabase's `auth` schema stood in, sign people in by setting
// the claim Supabase sets, and try every door from both sides.
//
// No Docker and no network: the Mac this runs on has other work on it.
import { it, expect, beforeAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every migration, in the order Supabase applies them.
const migrationsDir = path.join(root, 'cloud/supabase/migrations');
const migration = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

// What a Supabase project already has before our migration runs.
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
// Only what Supabase itself grants; the table rights come from our own
// migrations, so a missing grant there fails here.
const GRANTS = `
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`;

const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const JUN = '33333333-3333-3333-3333-333333333333';
const PROJECT = '44444444-4444-4444-4444-444444444444';
const SECRET = '55555555-5555-5555-5555-555555555555';

let db;
let team;

// Run one statement as a signed-in person, the way PostgREST does.
async function as(person, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}
const rows = async (person, sql, params) => (await as(person, sql, params)).rows;
const refused = async (person, sql, params) => {
  try { await as(person, sql, params); return false; } catch { return true; }
};

// Supabase confirms an email when its owner proves they hold it (Google does
// that at sign-in). `confirmed: false` is somebody who never did.
async function signUp(id, email, fullName, { confirmed = true } = {}) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)`, [id, email, confirmed ? new Date() : null, { full_name: fullName, avatar_url: `https://faces/${fullName}.jpg` }]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  await signUp(MAYA, 'maya@northwind.test', 'Maya Chen');
  await signUp(THEO, 'theo@northwind.test', 'Theo Park');
  await signUp(JUN, 'jun@elsewhere.test', 'Jun Ito');
  [team] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team.id, MAYA]);
  await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'THEO@northwind.test', $2)`, [team.id, MAYA]);
  await as(THEO, `select public.accept_invite($1)`, [team.id]);
}, 60_000);

// TEAM SETTINGS (2026-10-01): the owner renames the team, removes people and
// cancels invites; anyone can leave; nobody else can do any of it.
describe('team settings', () => {
  it('lets the owner rename the team, and nobody else', async () => {
    expect((await rows(MAYA, `update public.teams set name = 'Northwind Labs' where id = $1 returning name`, [team.id])).map((r) => r.name)).toEqual(['Northwind Labs']);
    expect(await rows(THEO, `update public.teams set name = 'Theo Co' where id = $1 returning name`, [team.id])).toEqual([]);
    expect(await rows(JUN, `update public.teams set name = 'Jun Co' where id = $1 returning name`, [team.id])).toEqual([]);
  });

  it('lets the owner cancel an invite, and not a stranger', async () => {
    await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'kai@northwind.test', $2)`, [team.id, MAYA]);
    expect(await rows(JUN, `delete from public.team_invites where team_id = $1 returning email`, [team.id])).toEqual([]);
    expect((await rows(MAYA, `delete from public.team_invites where team_id = $1 and email = 'kai@northwind.test' returning email`, [team.id])).length).toBe(1);
  });

  it('will not let a member remove somebody else', async () => {
    expect(await rows(THEO, `delete from public.team_members where team_id = $1 and person_id = $2 returning person_id`, [team.id, MAYA])).toEqual([]);
  });

  it('lets a member leave, and the owner remove someone', async () => {
    expect((await rows(THEO, `delete from public.team_members where team_id = $1 and person_id = $2 returning person_id`, [team.id, THEO])).length).toBe(1);
    await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo@northwind.test', $2) on conflict do nothing`, [team.id, MAYA]);
    await as(THEO, `select public.accept_invite($1)`, [team.id]);
    expect((await rows(MAYA, `delete from public.team_members where team_id = $1 and person_id = $2 returning person_id`, [team.id, THEO])).length).toBe(1);
  });
});

// The same actions through the app's own team service, over the in-memory cloud.
import os from 'node:os';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-settings-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  return createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
}

describe('the settings page\'s actions', () => {
  it('renames, lists invites, cancels one, removes a person, and leaving joins nothing else', async () => {
    const cloud = createMemoryCloud();
    const ownerId = signUpMemory(cloud, { email: 'o@x.test', name: 'Owner' });
    const memberId = signUpMemory(cloud, { email: 'm@x.test', name: 'Member' });
    const owner = await aMac(cloud, ownerId);
    const member = await aMac(cloud, memberId);
    await owner.signIn();
    await owner.createTeam('First name');
    await owner.renameTeam('Second name');
    expect(owner.state().team.name).toBe('Second name');
    await owner.invite('m@x.test');
    await owner.invite('later@x.test');
    expect(owner.state().sent.map((s) => s.email).sort()).toEqual(['later@x.test', 'm@x.test']);
    await owner.cancelInvite('later@x.test');
    expect(owner.state().sent.map((s) => s.email)).toEqual(['m@x.test']);
    await member.signIn();
    await member.acceptInvite(owner.state().team.id);
    await expect(member.renameTeam('Mine now')).rejects.toThrow(/rename/);
    await owner.syncNow();
    expect(owner.state().people.find((p) => p.id === ownerId).role).toBe('owner');
    await owner.removeMember(memberId);
    expect(owner.state().people.map((p) => p.id)).toEqual([ownerId]);
    await owner.leaveTeam();
    expect(owner.state().team).toBeNull();
  });
});
