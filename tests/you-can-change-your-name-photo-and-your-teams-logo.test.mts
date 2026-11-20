// Nobody could change their own name or photo after signing up, and the top
// left corner could only wear the team's first letter (w-8ae9f6902e). The
// database already let a person change their name and face (people_update_self);
// nothing in the app called it. Measured on the stand-in cloud: no call existed.
// Now Settings -> Team saves your name and photo, and the owner sets a logo.
// Pictures go in the public `pictures` bucket under a hash of their bytes
// (20261120000000_a_person_and_a_team_wear_a_picture.sql).
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

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
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid, unique (bucket_id, name));
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated, anon;
`;
const GRANTS = `
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
`;

const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const JUN = '33333333-3333-3333-3333-333333333333';
const HASH = '0123456789abcdef0123456789abcdef';
let db: PGlite;
let team: string;

async function as(person: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person}', false); set role authenticated;`);
  try { return await db.query<Record<string, unknown>>(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person: string, sql: string, params: unknown[] = []) => (await as(person, sql, params)).rows;
const refused = async (person: string, sql: string, params: unknown[] = []) => {
  try { await as(person, sql, params); return false; } catch { return true; }
};
const add = (person: string, name: string) => `insert into storage.objects (bucket_id, name, owner) values ('pictures', '${name}', '${person}')`;

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(SUPABASE_STAND_IN);
  await db.exec(migration);
  await db.exec(`insert into public.multiplayer_people (email) values ('*')`);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@nw.test', 'Maya'], [THEO, 'theo@nw.test', 'Theo'], [JUN, 'jun@elsewhere.test', 'Jun']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
  }
  const [made] = await rows(MAYA, `insert into public.teams (name, created_by) values ('Northwind', $1) returning id`, [MAYA]);
  team = String(made.id);
  await as(MAYA, `insert into public.team_members (team_id, person_id, role) values ($1, $2, 'owner')`, [team, MAYA]);
  await as(MAYA, `insert into public.team_invites (team_id, email, invited_by) values ($1, 'theo@nw.test', $2)`, [team, MAYA]);
  await as(THEO, `select public.accept_invite($1)`, [team]);
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('the database', () => {
  it('keeps a public pictures bucket', async () => {
    const [bucket] = (await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'pictures'`)).rows;
    expect(bucket?.public).toBe(true);
  });

  it('lets you add a picture to your own folder and nobody else’s', async () => {
    expect(await refused(MAYA, add(MAYA, `people/${MAYA}/${HASH}.jpg`))).toBe(false);
    expect(await refused(MAYA, add(MAYA, `people/${THEO}/${HASH}.jpg`))).toBe(true);
  });

  it('lets only the team’s owner add its logo', async () => {
    expect(await refused(MAYA, add(MAYA, `teams/${team}/${HASH}.png`))).toBe(false);
    expect(await refused(THEO, add(THEO, `teams/${team}/${'f'.repeat(32)}.png`))).toBe(true);
    expect(await refused(JUN, add(JUN, `teams/${team}/${'e'.repeat(32)}.png`))).toBe(true);
  });

  it('takes only a hashed png or jpg', async () => {
    expect(await refused(MAYA, add(MAYA, `people/${MAYA}/${'a'.repeat(32)}.svg`))).toBe(true);
    expect(await refused(MAYA, add(MAYA, `people/${MAYA}/me.jpg`))).toBe(true);
  });

  it('lets you change your own name and photo, and nobody else’s', async () => {
    await as(MAYA, `update public.people set name = 'Maya Chen', avatar_url = 'https://x.test/p.jpg' where id = $1`, [MAYA]);
    expect((await rows(MAYA, `select name, avatar_url from public.people where id = $1`, [MAYA]))[0]).toEqual({ name: 'Maya Chen', avatar_url: 'https://x.test/p.jpg' });
    await as(THEO, `update public.people set name = 'Not Maya' where id = $1`, [MAYA]);
    expect((await rows(MAYA, `select name from public.people where id = $1`, [MAYA]))[0].name).toBe('Maya Chen');
  });

  it('lets the owner set the team’s logo, a link and nothing else, and not a member', async () => {
    expect(await rows(MAYA, `update public.teams set logo_url = 'https://x.test/logo.png' where id = $1 returning logo_url`, [team])).toEqual([{ logo_url: 'https://x.test/logo.png' }]);
    expect(await rows(THEO, `update public.teams set logo_url = 'https://x.test/mine.png' where id = $1 returning logo_url`, [team])).toEqual([]);
    expect(await refused(MAYA, `update public.teams set logo_url = 'data:image/png;base64,AAAA' where id = $1`, [team])).toBe(true);
    expect((await rows(THEO, `select logo_url from public.teams where id = $1`, [team]))[0].logo_url).toBe('https://x.test/logo.png');
  });
});

// A one-pixel png and jpg, as the window sends them after shrinking.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]).toString('base64');

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'team-faces-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  return createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
}

async function aTeam() {
  const cloud = createMemoryCloud();
  const ownerId = signUpMemory(cloud, { email: 'o@x.test', name: 'Owner' });
  const memberId = signUpMemory(cloud, { email: 'm@x.test', name: 'Member' });
  const owner = await aMac(cloud, ownerId);
  const member = await aMac(cloud, memberId);
  await owner.signIn();
  await owner.createTeam('Northwind');
  await owner.invite('m@x.test');
  await member.signIn();
  await member.acceptInvite(owner.state().team!.id);
  return { cloud, owner, member, ownerId, memberId };
}

describe('your name and photo, from Settings', () => {
  it('saves a new name, which your teammates see on their next pass', async () => {
    const { owner, member, memberId } = await aTeam();
    await member.updateMe({ name: '  Mira   Okafor ' });
    expect(member.state().me!.name).toBe('Mira Okafor');
    await owner.syncNow();
    expect(owner.state().people.find((p) => p.id === memberId)!.name).toBe('Mira Okafor');
  });

  it('refuses an empty name and keeps the old one', async () => {
    const { member } = await aTeam();
    await expect(member.updateMe({ name: '   ' })).rejects.toThrow(/name/);
    expect(member.state().me!.name).toBe('Member');
  });

  it('saves a photo under your own folder, named for its bytes, the same link for the same picture', async () => {
    const { owner, member, memberId } = await aTeam();
    await member.updateMe({ photo: { data: JPG, type: 'image/jpeg' } });
    const url = member.state().me!.avatarUrl!;
    expect(url).toMatch(new RegExp(`^https://.+/pictures/people/${memberId}/[0-9a-f]{32}\\.jpg$`));
    await member.updateMe({ photo: { data: JPG, type: 'image/jpeg' } });
    expect(member.state().me!.avatarUrl).toBe(url);
    await owner.syncNow();
    expect(owner.state().people.find((p) => p.id === memberId)!.avatarUrl).toBe(url);
  });

  it('takes the photo away when you remove it', async () => {
    const { member } = await aTeam();
    await member.updateMe({ photo: { data: PNG, type: 'image/png' } });
    await member.updateMe({ photo: null });
    expect(member.state().me!.avatarUrl).toBe(null);
  });

  it('refuses what is not a png or jpg', async () => {
    const { member } = await aTeam();
    await expect(member.updateMe({ photo: { data: Buffer.from('<svg/>').toString('base64'), type: 'image/png' } })).rejects.toThrow(/picture/);
    expect(member.state().me!.avatarUrl ?? null).toBe(null);
  });
});

describe('the team’s logo', () => {
  it('is the owner’s to set, and every teammate’s corner wears it on their next pass', async () => {
    const { owner, member, ownerId } = await aTeam();
    await owner.setTeamLogo({ data: PNG, type: 'image/png' });
    const url = owner.state().team!.logoUrl!;
    expect(url).toMatch(new RegExp(`^https://.+/pictures/teams/${owner.state().team!.id}/[0-9a-f]{32}\\.png$`));
    expect(ownerId).toBeTruthy();
    await member.syncNow();
    expect(member.state().team!.logoUrl).toBe(url);
    await owner.setTeamLogo(null);
    expect(owner.state().team!.logoUrl ?? null).toBe(null);
  });

  it('is refused to a member', async () => {
    const { member } = await aTeam();
    await expect(member.setTeamLogo({ data: PNG, type: 'image/png' })).rejects.toThrow(/logo|not allowed/);
  });
});

describe('the top-left corner', () => {
  const noop = () => {};
  const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
  const draw = (team: Record<string, unknown>) => {
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, {
      view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop,
      team: { configured: true, signedIn: true, me, team, people: [me], cards: [], lastSyncAt: null, error: null },
    } as never));
    return html.slice(0, html.indexOf('workspace-tabs'));
  };

  it('wears the logo when the team has one', () => {
    const top = draw({ id: 't-1', name: 'Northwind', logoUrl: 'https://x.test/logo.png' });
    expect(top).toMatch(/<img[^>]*class="th-mark th-mark-logo"[^>]*src="https:\/\/x\.test\/logo\.png"/);
    expect(top).not.toContain('>N</span>');
  });

  it('wears the first letter when it has none', () => {
    expect(draw({ id: 't-1', name: 'Northwind', logoUrl: null })).toContain('>N</span>');
  });
});
