// Security review, 2026-11-16. Every invitation emails the address invited,
// and anyone signed in may make a team and invite any text: a throwaway account
// inserted 5,000 invitations in one statement, each an Agentbox email carrying
// its own words in the subject. Twenty rows that could never be sent held the
// front of the queue and stopped real teams' invitations for a week, and a
// client could backdate a row or mark it sent. These run every real migration
// in PGlite with Supabase's auth stood in.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mts';

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

const DANA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const JUN = '33333333-3333-3333-3333-333333333333';
const SPAM = '44444444-4444-4444-4444-444444444444';

let db: PGlite;

async function as(person: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person}', false); set role authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}
const refusal = async (person: string, sql: string, params: unknown[] = []) => {
  try { await as(person, sql, params); return null; } catch (e) { return String((e as Error).message); }
};
const invite = (person: string, team: string, email: string) =>
  refusal(person, `insert into public.team_invites (team_id, email, invited_by) values ($1, $2, $3)`, [team, email, person]);
const inviteMany = async (person: string, team: string, tag: string, n: number) => {
  for (let i = 0; i < n; i++) {
    const out = await invite(person, team, `${tag}${i}@example.test`);
    if (out) return out;
  }
  return null;
};

async function signUp(id: string, email: string, name: string) {
  await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
}
async function teamOf(owner: string, name: string) {
  const { rows } = await as(owner, `insert into public.teams (name, created_by) values ($1, $2) returning id`, [name, owner]);
  const team = (rows[0] as { id: string }).id;
  await as(owner, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team, owner]);
  return team;
}
// Sorted: two rows made in the same instant tie on created_at.
const waiting = async () => (await db.query(`select email from public.team_invites_to_email(50)`)).rows.map((r) => (r as { email: string }).email).sort();
// The function's claim and its giving back after a failed send, as it makes them.
const claim = (email: string) => db.query(`update public.team_invites set emailed_at = now() where email = $1 and emailed_at is null`, [email]);
const giveBack = (email: string) => db.query(`update public.team_invites set emailed_at = null where email = $1`, [email]);

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(`insert into public.multiplayer_people (email) values ('*')`);
  await db.exec(GRANTS);
  await signUp(DANA, 'dana@northwind.test', 'Dana');
  await signUp(THEO, 'theo@northwind.test', 'Theo');
  await signUp(JUN, 'jun@northwind.test', 'Jun');
  await signUp(SPAM, 'throwaway@example.test', 'Throwaway');
}, 60_000);
afterAll(() => db.close());

describe('one account in one day', () => {
  it('sends 20 invitations, and the 21st is refused, whichever team it is for', async () => {
    const first = await teamOf(SPAM, 'Agentbox Security Team');
    const second = await teamOf(SPAM, 'Second');
    expect(await inviteMany(SPAM, first, 'a', 12)).toBeNull();
    expect(await inviteMany(SPAM, second, 'b', 8)).toBeNull();
    expect(await invite(SPAM, second, 'c@example.test')).toMatch(/20 invitations today/);
    expect(await invite(SPAM, first, 'd@example.test')).toMatch(/20 invitations today/);
  });

  it('cannot send more by taking one back and sending it again', async () => {
    const team = await teamOf(JUN, 'Again');
    expect(await inviteMany(JUN, team, 'r', 19)).toBeNull();
    await as(JUN, `delete from public.team_invites where team_id = $1 and email = 'r0@example.test'`, [team]);
    expect(await invite(JUN, team, 'r0@example.test')).toBeNull();
    expect(await invite(JUN, team, 'r0@example.test')).toMatch(/duplicate|already/);
    await as(JUN, `delete from public.team_invites where team_id = $1 and email = 'r0@example.test'`, [team]);
    expect(await invite(JUN, team, 'r0@example.test')).toMatch(/20 invitations today/);
  });

  it('may ask again for someone already invited without it counting', async () => {
    const team = await teamOf(THEO, 'Repeats');
    for (let i = 0; i < 30; i++) {
      expect(await refusal(THEO, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'same@example.test', $2) on conflict do nothing`, [team, THEO])).toBeNull();
    }
    expect(await inviteMany(THEO, team, 'fresh', 19)).toBeNull();
  });

  it('sends again the next day', async () => {
    await db.query(`update public.team_invite_sends set at = at - interval '25 hours' where invited_by = $1`, [SPAM]);
    const team = await teamOf(SPAM, 'Tomorrow');
    expect(await invite(SPAM, team, 'next-day@example.test')).toBeNull();
  });
});

describe('one team in one day', () => {
  it('sends 50 invitations among its people, and the 51st is refused', async () => {
    await db.query(`delete from public.team_invite_sends`);
    const team = await teamOf(DANA, 'Northwind');
    for (const [id, email] of [[THEO, 'theo@northwind.test'], [JUN, 'jun@northwind.test']] as const) {
      expect(await invite(DANA, team, email)).toBeNull();
      await as(id, `select public.accept_invite($1)`, [team]);
    }
    expect(await inviteMany(DANA, team, 'dana', 18)).toBeNull();
    expect(await inviteMany(THEO, team, 'theo', 20)).toBeNull();
    expect(await inviteMany(JUN, team, 'jun', 10)).toBeNull();
    expect(await invite(JUN, team, 'one-more@example.test')).toMatch(/50 invitations today/);
  });
});

describe('what an invitation row may hold', () => {
  it('is one email address', async () => {
    await db.query(`delete from public.team_invite_sends`);
    const team = await teamOf(THEO, 'Addresses');
    for (const bad of ['not an email', 'a@b.test, c@d.test', 'a@b.test;c@d.test', '<a@b.test>', 'nobody@nowhere', `${'x'.repeat(250)}@b.test`]) {
      expect(await invite(THEO, team, bad), bad).toMatch(/not an email address/);
    }
    for (const good of ["theo.o'neil+team@north-wind.co.uk", 'Jun@Northwind.Test']) {
      expect(await invite(THEO, team, good), good).toBeNull();
    }
  });

  it('keeps the time it was made and is not marked sent by the person inviting', async () => {
    const team = await teamOf(DANA, 'Dates');
    expect(await refusal(DANA, `insert into public.team_invites (team_id, email, invited_by, created_at, emailed_at) values ($1, 'dated@example.test', $2, now() - interval '6 days 23 hours', now())`, [team, DANA])).toBeNull();
    const { rows } = await db.query(`select created_at > now() - interval '1 minute' as fresh, emailed_at from public.team_invites where email = 'dated@example.test'`);
    expect(rows[0]).toEqual({ fresh: true, emailed_at: null });
  });
});

describe('sending', () => {
  it('gives up on an invitation whose email failed three times, so it does not hold up the rest', async () => {
    await db.query(`update public.team_invites set emailed_at = now() where emailed_at is null`);
    await db.query(`delete from public.team_invite_sends`);
    const team = await teamOf(DANA, 'Sending');
    expect(await invite(DANA, team, 'bounces@example.test')).toBeNull();
    expect(await invite(DANA, team, 'arrives@example.test')).toBeNull();
    for (let i = 0; i < 2; i++) { await claim('bounces@example.test'); await giveBack('bounces@example.test'); }
    expect(await waiting()).toEqual(['arrives@example.test', 'bounces@example.test']);
    await claim('bounces@example.test'); await giveBack('bounces@example.test');
    expect(await waiting()).toEqual(['arrives@example.test']);
  });

  it('cannot be reset to try for ever by the person who invited', async () => {
    await refusal(DANA, `update public.team_invites set email_tries = 0 where email = 'bounces@example.test'`);
    // Nor by an update that only sets the count, whoever makes it.
    await db.query(`update public.team_invites set email_tries = 0 where email = 'bounces@example.test'`);
    expect((await db.query(`select email_tries from public.team_invites where email = 'bounces@example.test'`)).rows).toEqual([{ email_tries: 3 }]);
    expect(await waiting()).toEqual(['arrives@example.test']);
  });
});
