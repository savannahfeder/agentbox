// THE SHARED DATABASE SHOWS A PERSON THEIR OWN TEAM AND NOTHING ELSE.
//
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

describe('people', () => {
  it('turns a sign-in into a person named from their Google profile', async () => {
    const [me] = await rows(MAYA, `select name, avatar_url from public.people where id = $1`, [MAYA]);
    expect(me).toEqual({ name: 'Maya Chen', avatar_url: 'https://faces/Maya Chen.jpg' });
  });

  it('joins the team that invited your email, whatever its case', async () => {
    const members = await rows(THEO, `select person_id from public.team_members order by person_id`);
    expect(members.map((m) => m.person_id)).toEqual([MAYA, THEO]);
  });

  it('shows teammates to each other and nobody to a stranger', async () => {
    expect((await rows(THEO, `select id from public.people`)).length).toBe(2);
    expect((await rows(JUN, `select id from public.people`)).map((p) => p.id)).toEqual([JUN]);
    expect(await rows(JUN, `select id from public.teams`)).toEqual([]);
  });

  it('will not let a stranger add themselves to a team', async () => {
    expect(await refused(JUN, `insert into public.team_members (team_id, person_id) values ($1, $2)`, [team.id, JUN])).toBe(true);
  });
});

describe('a project shared with the whole team', () => {
  beforeAll(async () => {
    // Shared the way the app shares, as an upsert: Postgres holds the proposed
    // row to the read policy too, which a plain insert never exercised.
    await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by) values ($1, $2, 'Website', 'team', $3)
                    on conflict (id) do update set name = excluded.name, visibility = excluded.visibility`, [PROJECT, team.id, MAYA]);
  });

  it('lets a teammate read it and add lines as themselves', async () => {
    expect((await rows(THEO, `select name from public.projects`)).map((p) => p.name)).toEqual(['Website']);
    await as(THEO, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-theo-1', $2, '{"id":"w-aaaaaa"}')`, [PROJECT, THEO]);
    expect((await rows(MAYA, `select uid from public.lines where project_id = $1`, [PROJECT])).map((l) => l.uid)).toEqual(['l-theo-1']);
  });

  it('will not let anyone write a line as somebody else', async () => {
    expect(await refused(THEO, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-forged', $2, '{}')`, [PROJECT, MAYA])).toBe(true);
  });

  it('stores a line pushed twice once', async () => {
    const push = `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-theo-2', $2, '{}') on conflict (uid) do nothing`;
    await as(THEO, push, [PROJECT, THEO]);
    await as(THEO, push, [PROJECT, THEO]);
    expect((await rows(THEO, `select count(*)::int as n from public.lines where uid = 'l-theo-2'`))[0].n).toBe(1);
  });

  it('never lets a line be changed or deleted', async () => {
    await as(THEO, `update public.lines set body = '{"x":1}' where uid = 'l-theo-1'`);
    await as(THEO, `delete from public.lines where uid = 'l-theo-1'`);
    const [line] = await rows(MAYA, `select body from public.lines where uid = 'l-theo-1'`);
    expect(line.body).toEqual({ id: 'w-aaaaaa' });
  });

  it('shows a stranger nothing of it', async () => {
    expect(await rows(JUN, `select id from public.projects`)).toEqual([]);
    expect(await rows(JUN, `select uid from public.lines`)).toEqual([]);
    expect(await refused(JUN, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-jun', $2, '{}')`, [PROJECT, JUN])).toBe(true);
  });
});

describe('a project shared with specific people', () => {
  beforeAll(async () => {
    await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by) values ($1, $2, 'Board deck', 'people', $3)`, [SECRET, team.id, MAYA]);
    await as(MAYA, `insert into public.lines (project_id, uid, by_person, body) values ($1, 'l-maya-secret', $2, '{}')`, [SECRET, MAYA]);
  });

  it('is invisible to a teammate who is not on it', async () => {
    expect((await rows(THEO, `select name from public.projects order by name`)).map((p) => p.name)).toEqual(['Website']);
    expect(await rows(THEO, `select uid from public.lines where project_id = $1`, [SECRET])).toEqual([]);
  });

  it('opens to a teammate once its maker adds them', async () => {
    await as(MAYA, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [SECRET, THEO]);
    expect((await rows(THEO, `select uid from public.lines where project_id = $1`, [SECRET])).map((l) => l.uid)).toEqual(['l-maya-secret']);
  });

  it('can only be opened by the person who made it', async () => {
    expect(await refused(THEO, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [SECRET, JUN])).toBe(true);
  });
});

describe('private work on the Team page', () => {
  it('shows a teammate a title-free line and a stranger nothing', async () => {
    await as(MAYA, `insert into public.private_activity (person_id, task_key, state, moved_at) values ($1, 'k1', 'run', now())`, [MAYA]);
    expect((await rows(THEO, `select state from public.private_activity`)).map((a) => a.state)).toEqual(['run']);
    expect(await rows(JUN, `select state from public.private_activity`)).toEqual([]);
  });

  it('will not let anyone write activity as somebody else', async () => {
    expect(await refused(THEO, `insert into public.private_activity (person_id, task_key, state, moved_at) values ($1, 'k2', 'run', now())`, [MAYA])).toBe(true);
  });
});

describe('thread cards, what a teammate sees of your threads', () => {
  const card = (person, thread, extra = {}) => [person, team.id, thread, extra.visible ?? true, extra.title ?? null, extra.state ?? 'running'];
  const insert = `insert into public.thread_cards (person_id, team_id, thread_id, visible, title, state) values ($1, $2, $3, $4, $5, $6)`;

  it('shows a teammate your visible card and a stranger nothing', async () => {
    await as(MAYA, insert, card(MAYA, 'w-card1', { title: 'Acme renewal terms' }));
    expect((await rows(THEO, `select title from public.thread_cards where thread_id = 'w-card1'`)).map((c) => c.title)).toEqual(['Acme renewal terms']);
    expect(await rows(JUN, `select title from public.thread_cards`)).toEqual([]);
  });

  it('will not let anyone write a card as somebody else', async () => {
    expect(await refused(THEO, insert, card(MAYA, 'w-forged', { title: 'Forged' }))).toBe(true);
  });

  // The second wall only: since 2026-10-01 the app sends no card at all for a
  // private thread (shared/thread-cards.mjs, both backends' putCards).
  it('refuses words on a private card, so a private title can never leave the Mac', async () => {
    expect(await refused(MAYA, insert, card(MAYA, 'w-secret', { visible: false, title: 'Board deck numbers' }))).toBe(true);
    await as(MAYA, insert, card(MAYA, 'w-secret', { visible: false }));
    expect((await rows(THEO, `select visible, title from public.thread_cards where thread_id = 'w-secret'`))).toEqual([{ visible: false, title: null }]);
  });

  // CHOSEN PEOPLE (w-41ff964775, 20261001000800). A card carries the people it
  // is for, and an empty list is the whole team, which is what every card
  // written before that migration says.
  describe('shared with chosen people', () => {
    const chosen = `insert into public.thread_cards (person_id, team_id, thread_id, visible, title, state, people) values ($1, $2, $3, true, $4, 'running', $5)`;
    let ana;

    beforeAll(async () => {
      // A third teammate, so "not everyone" is a real distinction here.
      ana = '77777777-7777-7777-7777-777777777777';
      await signUp(ana, 'ana@northwind.test', 'Ana Ruiz');
      await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'ana@northwind.test', $2)`, [team.id, MAYA]);
      await as(ana, `select public.accept_invite($1)`, [team.id]);
      await as(MAYA, chosen, [MAYA, team.id, 'w-chosen', 'Pay review', [THEO]]);
    });

    it('shows the card to the person it names and to nobody else on the team', async () => {
      expect((await rows(THEO, `select title from public.thread_cards where thread_id = 'w-chosen'`)).map((c) => c.title)).toEqual(['Pay review']);
      expect(await rows(ana, `select title from public.thread_cards where thread_id = 'w-chosen'`)).toEqual([]);
      expect(await rows(JUN, `select title from public.thread_cards where thread_id = 'w-chosen'`)).toEqual([]);
    });

    it('still shows it to the person whose thread it is', async () => {
      expect((await rows(MAYA, `select title from public.thread_cards where thread_id = 'w-chosen'`)).map((c) => c.title)).toEqual(['Pay review']);
    });

    it('takes it off their page when they come off the list', async () => {
      await as(MAYA, `update public.thread_cards set people = $1 where thread_id = 'w-chosen'`, [[ana]]);
      expect(await rows(THEO, `select title from public.thread_cards where thread_id = 'w-chosen'`)).toEqual([]);
      expect((await rows(ana, `select title from public.thread_cards where thread_id = 'w-chosen'`)).map((c) => c.title)).toEqual(['Pay review']);
      await as(MAYA, `update public.thread_cards set people = $1 where thread_id = 'w-chosen'`, [[THEO]]);
    });

    // FAIL CLOSED. An empty list would have to mean both "everyone" and
    // "nobody", so the table refuses to store one; the app never sends one
    // either (shared/thread-cards.mjs publishes no card for a thread shared
    // with nobody).
    it('refuses a card that names nobody, rather than letting it mean everybody', async () => {
      expect(await refused(MAYA, chosen, [MAYA, team.id, 'w-nobody', 'Named nobody', []])).toBe(true);
    });

    it('leaves a card with no list on it visible to the whole team, as before', async () => {
      await as(MAYA, `insert into public.thread_cards (person_id, team_id, thread_id, visible, title, state) values ($1, $2, 'w-everyone', true, 'Launch video', 'running')`, [MAYA, team.id]);
      expect((await rows(ana, `select title from public.thread_cards where thread_id = 'w-everyone'`)).map((c) => c.title)).toEqual(['Launch video']);
    });

    it('will not let a card name somebody who is not on the team', async () => {
      expect(await refused(MAYA, chosen, [MAYA, team.id, 'w-stranger', 'Out of the team', [JUN]])).toBe(true);
      expect(await refused(MAYA, `update public.thread_cards set people = $1 where thread_id = 'w-chosen'`, [[JUN]])).toBe(true);
    });
  });

  it('lets only its owner change or remove it', async () => {
    await as(THEO, `update public.thread_cards set title = 'Taken over' where thread_id = 'w-card1'`);
    await as(THEO, `delete from public.thread_cards where thread_id = 'w-card1'`);
    expect((await rows(MAYA, `select title from public.thread_cards where thread_id = 'w-card1'`)).map((c) => c.title)).toEqual(['Acme renewal terms']);
  });
});

// THE DOORS A REVIEW FOUND OPEN ON 2026-10-01 (cloud/supabase/migrations/
// 20261001000500_security.sql). Each was walked through by hand before the
// fix: a stranger rewrote their own email to a teammate's and joined the team;
// a team made with created_at in 2000 became the "oldest" team an invited
// person's app picked; a "direct" record took a third person and read what two
// teammates said to each other; a project moved into a team its maker was not
// on.
describe('joining a team takes a confirmed email and a yes', () => {
  const LEE = '66666666-6666-6666-6666-666666666666';
  beforeAll(async () => {
    await signUp(LEE, 'lee@northwind.test', 'Lee Unconfirmed', { confirmed: false });
  });

  it('will not let a person change their own email, only their name and face', async () => {
    expect(await refused(JUN, `update public.people set email = 'theo@northwind.test' where id = $1`, [JUN])).toBe(true);
    await as(JUN, `update public.people set name = 'Jun I.' where id = $1`, [JUN]);
    expect((await rows(JUN, `select email, name from public.people where id = $1`, [JUN]))).toEqual([{ email: 'jun@elsewhere.test', name: 'Jun I.' }]);
  });

  it('uses an invite up once it is accepted', async () => {
    expect(await rows(MAYA, `select email from public.team_invites`)).toEqual([]);
    expect(await refused(THEO, `select public.accept_invite($1)`, [team.id])).toBe(true);
  });

  it('never matches an invite against an email nobody confirmed', async () => {
    await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'lee@northwind.test', $2)`, [team.id, MAYA]);
    expect(await rows(LEE, `select team_id from public.pending_invites()`)).toEqual([]);
    expect(await refused(LEE, `select public.accept_invite($1)`, [team.id])).toBe(true);
    expect(await rows(LEE, `select team_id from public.team_members`)).toEqual([]);
  });

  it('shows a pending invite with its team and who sent it, and joins nothing until the person accepts', async () => {
    await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'jun@elsewhere.test', $2)`, [team.id, MAYA]);
    // What a build from before this change calls at every start.
    await as(JUN, `select public.accept_invites()`);
    expect(await rows(JUN, `select team_id from public.team_members`)).toEqual([]);
    expect(await rows(JUN, `select team_id, team_name, invited_by_name from public.pending_invites()`))
      .toEqual([{ team_id: team.id, team_name: 'Northwind', invited_by_name: 'Maya Chen' }]);
  });
});

describe('a team is as old as the database says', () => {
  it('ignores a created_at its maker sends', async () => {
    const before = Date.now() - 60_000;
    const [made] = await rows(JUN, `insert into public.teams (name, created_by, created_at) values ('Backdated', $1, '2000-01-01') returning id, created_at`, [JUN]);
    expect(new Date(made.created_at).getTime()).toBeGreaterThan(before);
  });
});

// A MESSAGE RECORD HOLDS A SMALL GROUP (2026-10-01, 20261001000700): its maker
// and up to eleven others. The app writes only into a record whose people are
// exactly the ones chosen, which is what keeps a stranger's record unread.
describe('a direct message record holds a small group', () => {
  const DIRECT = '77777777-7777-7777-7777-777777777777';
  const PEOPLE = '88888888-8888-8888-8888-888888888888';
  const extra = Array.from({ length: 12 }, (_, i) => `99999999-9999-9999-9999-${String(i).padStart(12, '0')}`);

  beforeAll(async () => {
    for (const [i, id] of extra.entries()) {
      await signUp(id, `extra${i}@northwind.test`, `Extra ${i}`);
      await db.query(`insert into public.team_members (team_id, person_id) values ($1, $2)`, [team.id, id]);
    }
  });

  it('takes its maker and eleven others, and refuses a twelfth', async () => {
    await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by, direct) values ($1, $2, 'Direct', 'people', $3, true)`, [DIRECT, team.id, MAYA]);
    for (const id of extra.slice(0, 11)) await as(MAYA, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [DIRECT, id]);
    expect(await refused(MAYA, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [DIRECT, extra[11]])).toBe(true);
    expect((await rows(MAYA, `select person_id from public.project_people where project_id = $1`, [DIRECT])).length).toBe(11);
  });

  it('will not turn a project with twelve other people on it into a message record', async () => {
    await as(MAYA, `insert into public.projects (id, team_id, name, visibility, created_by) values ($1, $2, 'Twelve others', 'people', $3)`, [PEOPLE, team.id, MAYA]);
    for (const id of extra) await as(MAYA, `insert into public.project_people (project_id, person_id) values ($1, $2)`, [PEOPLE, id]);
    expect(await refused(MAYA, `update public.projects set direct = true where id = $1`, [PEOPLE])).toBe(true);
  });
});

describe('a project stays in its maker\'s team', () => {
  it('cannot be moved into a team its maker is not on', async () => {
    const [other] = await rows(JUN, `select id from public.teams where name = 'Backdated'`);
    expect(await refused(MAYA, `update public.projects set team_id = $1 where id = $2`, [other.id, PROJECT])).toBe(true);
    const [still] = await rows(MAYA, `select team_id from public.projects where id = $1`, [PROJECT]);
    expect(still.team_id).toBe(team.id);
  });
});
