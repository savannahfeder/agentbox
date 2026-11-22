// A SHARED LINK SAYS WHO CAN OPEN IT AND WHAT THEY CAN DO, AND KEEPS ITS HISTORY.
//
// Asked for 2026-11-12 (w-926a6814a5): a shared document's owner could not say
// whether people may edit, only share it with anyone or stop. Every link let
// anyone read it and comment once signed in. Measured here on
// 20261112120000_a_link_says_who_can_open_it_and_what_they_can_do.sql, every
// migration run in PGlite: Maya shares, Theo is someone she adds by email, Jun
// is a signed-in stranger, Ana signed up with Theo's address but never
// confirmed it, and nobody signed in is `anon`.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase } from './an-empty-test-database.mts';

const dir = path.join(import.meta.dirname, '..', 'cloud/supabase/migrations');
const migration = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

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
const GRANTS = `
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to anon;
`;
const MAYA = '11111111-1111-1111-1111-111111111111';
const THEO = '22222222-2222-2222-2222-222222222222';
const JUN = '44444444-4444-4444-4444-444444444444';
const ANA = '55555555-5555-5555-5555-555555555555';

let db: PGlite;
type Row = Record<string, unknown>;
async function as(person: string | null, sql: string, params: unknown[] = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query<Row>(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person: string | null, sql: string, params: unknown[] = []) => (await as(person, sql, params, person ? 'authenticated' : 'anon')).rows;
const one = async (person: string | null, sql: string, params: unknown[] = []) => (await rows(person, sql, params))[0];
const refusal = async (person: string | null, sql: string, params: unknown[] = []) => {
  try { await as(person, sql, params, person ? 'authenticated' : 'anon'); return null; } catch (err) { return (err as Error).message; }
};
let n = 0;
const share = async (body = '# Plan', { kind = 'markdown', name = 'plan.md', type = 'text/markdown', h = '' } = {}) =>
  (await one(MAYA, `select public.share_file($1, $2, $3, $4, $5, 1, $6) as t`, [`p/w-${++n}/plan`, name, kind, type, body, h || `h${n}`])).t as string;
const door = async (tok: string, who: string | null) => (await one(who, `select public.file_link_door($1) as d`, [tok])).d;
const view = (tok: string, who: string | null) => rows(who, `select * from public.file_link_view($1)`, [tok]);
const canOf = async (tok: string, who: string | null) => (await view(tok, who))[0]?.can ?? null;
const access = (tok: string, acc: string, c: string) => as(MAYA, `select public.set_file_link_access($1, $2, $3)`, [tok, acc, c]);
const person = (tok: string, mail: string, c: string | null) => as(MAYA, `select public.set_file_link_person($1, $2, $3)`, [tok, mail, c]);
const rev = async (tok: string) => (await view(tok, MAYA))[0].rev as number;
const edit = async (who: string, tok: string, body: string, base?: number) => (await one(who, `select public.edit_file_link($1, $2, $3) as r`, [tok, body, base ?? await rev(tok)])).r;
const history = (tok: string, who: string | null) => rows(who, `select * from public.file_link_history($1)`, [tok]);

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name, confirmed] of [[MAYA, 'maya@nw.test', 'Maya Chen', true], [THEO, 'Theo@NW.test', 'Theo', true], [JUN, 'jun@else.test', 'Jun', true], [ANA, 'theo@nw.test', 'Ana', false]] as const) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, ${confirmed ? 'now()' : 'null'}, $3)`, [id, email, { full_name: name }]);
  }
}, 60_000);
afterAll(() => db.close());

describe('a link as it was before this change', () => {
  it('still lets anyone read it and a signed-in person comment', async () => {
    const tok = await share();
    expect(await door(tok, null)).toBe('open');
    expect(await canOf(tok, null)).toBe('comment');
    expect(await canOf(tok, JUN)).toBe('comment');
    expect(await canOf(tok, MAYA)).toBe('owner');
    expect(await one(JUN, `select public.comment_on_file_link($1, 'hi') as id`, [tok])).toBeTruthy();
    expect(await refusal(null, `select public.comment_on_file_link($1, 'hi')`, [tok])).toBeTruthy();
  });
});

describe('anyone with the link, at each level', () => {
  let tok: string;
  beforeAll(async () => { tok = await share(); });

  it('can view: reads it, sees no comments and cannot write one', async () => {
    await access(tok, 'anyone', 'view');
    await as(MAYA, `select public.comment_on_file_link($1, 'owner note')`, [tok]);
    expect(await canOf(tok, JUN)).toBe('view');
    expect(await rows(JUN, `select * from public.file_link_comments_of($1)`, [tok])).toEqual([]);
    expect(await refusal(JUN, `select public.comment_on_file_link($1, 'x')`, [tok])).toMatch(/not comment/);
    expect(await refusal(JUN, `select public.edit_file_link($1, 'x', 1)`, [tok])).toMatch(/does not let you edit/);
    expect((await rows(MAYA, `select * from public.file_link_comments_of($1)`, [tok])).length).toBe(1);
  });
  it('can edit: a signed-in person saves, and signed out is asked to sign in', async () => {
    await access(tok, 'anyone', 'edit');
    expect(await canOf(tok, JUN)).toBe('edit');
    expect(await canOf(tok, null)).toBe('edit');
    expect(await refusal(null, `select public.edit_file_link($1, 'x', 1)`, [tok])).toBeTruthy();
    await edit(JUN, tok, '# Plan\n\nJun was here');
    expect((await view(tok, null))[0]).toMatchObject({ body: '# Plan\n\nJun was here', changed_by_name: 'Jun' });
  });
  it('is only the owner\'s to change', async () => {
    expect(await refusal(JUN, `select public.set_file_link_access($1, 'anyone', 'edit')`, [tok])).toMatch(/stopped/);
    expect(await refusal(JUN, `select public.set_file_link_person($1, 'jun@else.test', 'edit')`, [tok])).toMatch(/stopped/);
    expect(await refusal(MAYA, `select public.set_file_link_access($1, 'everyone', 'edit')`, [tok])).toMatch(/not a way/);
  });
});

describe('only the people added', () => {
  let tok: string;
  beforeAll(async () => {
    tok = await share();
    await access(tok, 'people', 'view');
    await person(tok, '  THEO@nw.test ', 'comment');
  });

  it('asks somebody signed out to sign in, and tells a stranger they have no access', async () => {
    expect(await door(tok, null)).toBe('sign-in');
    expect(await view(tok, null)).toEqual([]);
    expect(await door(tok, JUN)).toBe('no-access');
    expect(await view(tok, JUN)).toEqual([]);
    expect(await rows(JUN, `select * from public.file_link_comments_of($1)`, [tok])).toEqual([]);
    expect(await refusal(JUN, `select public.comment_on_file_link($1, 'x')`, [tok])).toBeTruthy();
  });
  it('opens for the person added, by their confirmed address in any case', async () => {
    expect(await door(tok, THEO)).toBe('open');
    expect(await canOf(tok, THEO)).toBe('comment');
  });
  it('does not open for somebody who only typed that address into an account they never confirmed', async () => {
    expect(await door(tok, ANA)).toBe('no-access');
  });
  it('gives a person the most either the link or their own line gives them', async () => {
    await access(tok, 'anyone', 'edit');
    expect(await canOf(tok, THEO)).toBe('edit');
    await access(tok, 'people', 'view');
    await person(tok, 'theo@nw.test', 'edit');
    expect(await canOf(tok, THEO)).toBe('edit');
  });
  it('lists the people for the owner alone, with the name of each who has an account', async () => {
    await person(tok, 'new@nowhere.test', 'view');
    const list = await rows(MAYA, `select email, can, name from public.file_link_people_of($1)`, [tok]);
    expect(list).toEqual([{ email: 'theo@nw.test', can: 'edit', name: 'Theo' }, { email: 'new@nowhere.test', can: 'view', name: null }]);
    expect(await rows(THEO, `select * from public.file_link_people_of($1)`, [tok])).toEqual([]);
  });
  it('takes a person off, and then they are out', async () => {
    await person(tok, 'theo@nw.test', null);
    expect(await door(tok, THEO)).toBe('no-access');
  });
  it('refuses something that is not an email address', async () => {
    expect(await refusal(MAYA, `select public.set_file_link_person($1, 'not an address', 'view')`, [tok])).toMatch(/email address/);
  });
});

describe('editing', () => {
  it('is only for a document or a table: a page lets an editor comment', async () => {
    const tok = await share('<p>hi</p>', { kind: 'page', name: 'p.html', type: 'text/html' });
    await access(tok, 'anyone', 'edit');
    expect(await canOf(tok, JUN)).toBe('comment');
    expect(await refusal(JUN, `select public.edit_file_link($1, 'x', 1)`, [tok])).toMatch(/does not let you edit/);
  });
  it('refuses a save over a copy somebody else changed since, and takes it on the newer one', async () => {
    const tok = await share();
    await access(tok, 'anyone', 'edit');
    const start = await rev(tok);
    await edit(JUN, tok, 'Jun first', start);
    expect(await refusal(THEO, `select public.edit_file_link($1, 'Theo late', $2)`, [tok, start])).toMatch(/changed since/);
    await edit(THEO, tok, 'Theo merged', start + 1);
    expect((await view(tok, null))[0].body).toBe('Theo merged');
  });
  it('carries the same hash the owner\'s computer makes of the file, so a copy brought home reads as current', async () => {
    const tok = await share();
    await access(tok, 'anyone', 'edit');
    await edit(JUN, tok, 'héllo ✓');
    const [mine] = await rows(MAYA, `select * from public.my_file_link($1)`, [`p/w-${n}/plan`]);
    const { createHash } = await import('node:crypto');
    expect(mine).toMatchObject({ hash: createHash('sha256').update('héllo ✓').digest('hex').slice(0, 40), changed_on_web: true, changed_by_name: 'Jun' });
  });
});

describe('history', () => {
  let tok: string;
  beforeAll(async () => {
    tok = await share('one');
    await access(tok, 'anyone', 'edit');
  });

  it('starts with the shared copy and folds one person\'s run of saves into one version', async () => {
    await edit(JUN, tok, 'two');
    await edit(JUN, tok, 'two and a bit');
    await edit(THEO, tok, 'three');
    const h = await history(tok, JUN);
    expect(h.map((v) => [v.how, v.by_name, v.current])).toEqual([['edited', 'Theo', true], ['edited', 'Jun', false], ['shared', 'Maya Chen', false]]);
    const junVersion = h[1].id;
    expect((await one(JUN, `select public.file_link_version($1, $2) as b`, [tok, junVersion])).b).toBe('two and a bit');
  });
  it('is for editors and the owner, not for someone who may only comment or view', async () => {
    await access(tok, 'anyone', 'comment');
    expect(await history(tok, JUN)).toEqual([]);
    expect(await history(tok, null)).toEqual([]);
    expect((await history(tok, MAYA)).length).toBe(3);
    const any = (await history(tok, MAYA))[0].id;
    expect((await one(JUN, `select public.file_link_version($1, $2) as b`, [tok, any])).b).toBeNull();
    await access(tok, 'anyone', 'edit');
  });
  it('restores an old copy as a new version, and nothing is lost', async () => {
    const first = (await history(tok, MAYA)).find((v) => v.how === 'shared')!.id;
    await as(MAYA, `select public.restore_file_link_version($1, $2, $3)`, [tok, first, await rev(tok)]);
    expect((await view(tok, null))[0].body).toBe('one');
    expect((await history(tok, MAYA)).map((v) => v.how)).toEqual(['restored', 'edited', 'edited', 'shared']);
  });
  it('gets a version when the owner shares a newer copy, and none when the copy is the same', async () => {
    const before = (await history(tok, MAYA)).length;
    await as(MAYA, `select public.share_file($1, 'plan.md', 'markdown', 'text/markdown', 'from her computer', 2, 'hnew')`, [`p/w-${n}/plan`]);
    await as(MAYA, `select public.share_file($1, 'plan.md', 'markdown', 'text/markdown', 'from her computer', 2, 'hnew')`, [`p/w-${n}/plan`]);
    expect((await history(tok, MAYA)).length).toBe(before + 1);
    expect((await view(tok, null))[0].changed_by_name).toBeNull();
  });
  it('is emptied with the people when the link stops', async () => {
    await person(tok, 'theo@nw.test', 'edit');
    await as(MAYA, `select public.stop_file_link($1)`, [tok]);
    expect((await db.query(`select count(*)::int as c from public.file_link_versions where token = $1`, [tok])).rows[0]).toEqual({ c: 0 });
    expect((await db.query(`select count(*)::int as c from public.file_link_people where token = $1`, [tok])).rows[0]).toEqual({ c: 0 });
    expect(await door(tok, THEO)).toBe('stopped');
  });
});

describe('an edit made on the web reaching the owner\'s computer', () => {
  it('is listed for the owner until their computer says it wrote that copy, and a newer edit stays listed', async () => {
    const tok = await share();
    await access(tok, 'anyone', 'edit');
    const r = await edit(JUN, tok, 'edited on the web');
    const listed = await rows(MAYA, `select token, rev, changed_by_name from public.my_links_changed_on_web()`);
    expect(listed).toContainEqual({ token: tok, rev: r, changed_by_name: 'Jun' });
    expect(await rows(JUN, `select * from public.my_links_changed_on_web()`)).toEqual([]);
    await edit(JUN, tok, 'and again');
    await as(MAYA, `select public.file_link_brought_home($1, $2, 3)`, [tok, r]);
    expect((await rows(MAYA, `select token from public.my_links_changed_on_web()`)).map((x) => x.token)).toContain(tok);
    await as(MAYA, `select public.file_link_brought_home($1, $2, 3)`, [tok, (r as number) + 1]);
    expect((await rows(MAYA, `select token from public.my_links_changed_on_web()`)).map((x) => x.token)).not.toContain(tok);
    expect((await view(tok, null))[0].version).toBe(3);
  });
});

describe('the tables themselves', () => {
  it('are read by nobody directly', async () => {
    expect(await refusal(JUN, `select * from public.file_link_people`)).toBeTruthy();
    expect(await refusal(null, `select * from public.file_link_versions`)).toBeTruthy();
  });
});
