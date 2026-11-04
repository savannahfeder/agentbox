// A SHARED FILE'S LINK SHOWS STRANGERS THAT FILE AND NOTHING ELSE.
//
// Asked for 2026-11-03 (w-d7e61eb261): make documents and other files shareable
// on the web, with a way to make an account from there. A link is read by
// people who are not signed in, so a mistake in
// 20261105000000_a_file_anyone_with_its_link_can_read.sql is a stranger reading
// someone's other files, or a link that keeps working after it was stopped.
// Every migration runs here in PGlite and each door is tried from each side:
// Maya shares, Jun is signed in on another team, Theo comments, and nobody
// signed in is `anon`.
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

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

let db;
async function as(person, sql, params = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params, role) => (await as(person, sql, params, role)).rows;
const anon = (sql, params) => rows(null, sql, params, 'anon');
const refused = async (person, sql, params, role) => { try { await as(person, sql, params, role); return false; } catch { return true; } };
const share = async (who, src, body = '# Plan', { name = 'plan.md', kind = 'markdown', type = 'text/markdown', v = 1 } = {}) =>
  (await rows(who, `select public.share_file($1, $2, $3, $4, $5, $6) as t`, [src, name, kind, type, body, v]))[0].t;
const view = (tok, who = null) => (who ? rows(who, `select * from public.file_link_view($1)`, [tok]) : anon(`select * from public.file_link_view($1)`, [tok]));
const comments = (tok, who = null) => (who ? rows(who, `select * from public.file_link_comments_of($1)`, [tok]) : anon(`select * from public.file_link_comments_of($1)`, [tok]));
const comment = (who, tok, body = 'Looks good') => rows(who, `select public.comment_on_file_link($1, $2) as id`, [tok, body]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@nw.test', 'Maya Chen'], [THEO, 'theo@nw.test', 'Theo'], [JUN, 'jun@else.test', 'Jun']]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)`, [id, email, { full_name: name }]);
  }
}, 60_000);
afterAll(() => db.close());

describe('somebody with the link and no account', () => {
  let tok;
  beforeAll(async () => { tok = await share(MAYA, 'notes/w-1/plan', '# The plan'); });

  it('reads the file, its name and who shared it, and nothing that identifies them further', async () => {
    expect(tok).toMatch(/^[a-f0-9]{40}$/);
    const [v] = await view(tok);
    expect(v).toMatchObject({ name: 'plan.md', kind: 'markdown', type: 'text/markdown', body: '# The plan', version: 1, owner_name: 'Maya Chen', mine: false });
    expect(JSON.stringify(v)).not.toContain('maya@nw.test');
  });

  it('reads no table at all, and cannot share, comment or stop', async () => {
    expect(await refused(null, `select * from public.file_links`, [], 'anon')).toBe(true);
    expect(await refused(null, `select * from public.file_link_comments`, [], 'anon')).toBe(true);
    expect(await refused(null, `select public.share_file('x', 'a.md', 'markdown', 'text/markdown', 'hi', 1)`, [], 'anon')).toBe(true);
    expect(await refused(null, `select public.comment_on_file_link($1, 'hi')`, [tok], 'anon')).toBe(true);
    expect(await refused(null, `select public.stop_file_link($1)`, [tok], 'anon')).toBe(true);
    expect(await view(tok)).toHaveLength(1);
  });

  it('finds nothing behind a token that was never made', async () => {
    expect(await view('0'.repeat(40))).toEqual([]);
    expect((await anon(`select public.file_link_stopped($1) as s`, ['0'.repeat(40)]))[0].s).toBe(false);
  });
});

describe('sharing the same file again', () => {
  it('keeps the link and puts the newer copy in it', async () => {
    const first = await share(MAYA, 'notes/w-2/draft', 'v1 words', { v: 1 });
    const again = await share(MAYA, 'notes/w-2/draft', 'v2 words', { v: 2 });
    expect(again).toBe(first);
    expect((await view(first))[0]).toMatchObject({ body: 'v2 words', version: 2 });
  });
  it('gives a different file its own link', async () => {
    expect(await share(MAYA, 'notes/w-2/other')).not.toBe(await share(MAYA, 'notes/w-2/draft', 'v2 words', { v: 2 }));
  });
  it('by somebody else with the same file name is their own link', async () => {
    expect(await share(JUN, 'notes/w-2/draft', 'Jun words')).not.toBe(await share(MAYA, 'notes/w-2/draft', 'v2 words', { v: 2 }));
  });
});

describe('a signed-in stranger', () => {
  let tok;
  beforeAll(async () => { tok = await share(MAYA, 'notes/w-3/page', '<p>hi</p>', { name: 'page.html', kind: 'page', type: 'text/html' }); });

  it('reads none of the owner\'s rows directly, only the one link', async () => {
    expect(await rows(JUN, `select token from public.file_links where owner = $1`, [MAYA])).toEqual([]);
    expect(await view(tok, JUN)).toHaveLength(1);
    expect(await rows(JUN, `select * from public.my_file_link('notes/w-3/page')`)).toEqual([]);
  });
  it('cannot stop the owner\'s link', async () => {
    await as(JUN, `select public.stop_file_link($1)`, [tok]);
    expect(await view(tok)).toHaveLength(1);
  });
});

describe('comments', () => {
  let tok;
  beforeAll(async () => { tok = await share(MAYA, 'notes/w-4/plan'); });

  it('take a signed-in person\'s words, shown to everyone with the link by name', async () => {
    await comment(JUN, tok, '  Love this  ');
    const seen = await comments(tok);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ by_name: 'Jun', body: 'Love this', mine: false, by_owner: false });
    expect((await comments(tok, JUN))[0].mine).toBe(true);
  });
  it('say which one is the owner\'s', async () => {
    await comment(MAYA, tok, 'Thanks!');
    expect((await comments(tok)).map((c) => c.by_owner)).toEqual([false, true]);
  });
  it('are refused when empty', async () => {
    expect(await refused(JUN, `select public.comment_on_file_link($1, '   ')`, [tok])).toBe(true);
  });
  it('are counted for the owner, beside their link', async () => {
    const [mine] = await rows(MAYA, `select * from public.my_file_link('notes/w-4/plan')`);
    expect(mine).toMatchObject({ token: tok, version: 1, comments: 2 });
  });
  it('are taken back by whoever wrote them or by the owner, and by nobody else', async () => {
    const [{ id }] = await comment(JUN, tok, 'One more');
    await as(THEO, `select public.remove_file_link_comment($1)`, [id]);
    expect((await comments(tok)).map((c) => c.body)).toContain('One more');
    await as(MAYA, `select public.remove_file_link_comment($1)`, [id]);
    expect((await comments(tok)).map((c) => c.body)).not.toContain('One more');
  });
  it('stop at ten a minute from one person', async () => {
    const t = await share(MAYA, 'notes/w-4/busy');
    for (let i = 0; i < 10; i++) await comment(THEO, t, `c${i}`);
    expect(await refused(THEO, `select public.comment_on_file_link($1, 'eleven')`, [t])).toBe(true);
    expect(await comment(JUN, t, 'someone else still can')).toHaveLength(1);
  });
});

describe('a stopped link', () => {
  let tok;
  beforeAll(async () => {
    tok = await share(MAYA, 'notes/w-5/plan', 'secret plan');
    await comment(JUN, tok, 'Nice');
    await as(MAYA, `select public.stop_file_link($1)`, [tok]);
  });

  it('shows nothing, says it was stopped, and keeps no copy of the file', async () => {
    expect(await view(tok)).toEqual([]);
    expect(await comments(tok)).toEqual([]);
    expect((await anon(`select public.file_link_stopped($1) as s`, [tok]))[0].s).toBe(true);
    expect((await rows(MAYA, `select body from public.file_links where token = $1`, [tok]))[0].body).toBe('');
  });
  it('takes no comment', async () => {
    expect(await refused(JUN, `select public.comment_on_file_link($1, 'late')`, [tok])).toBe(true);
  });
  it('is not brought back by sharing the file again: that is a new link', async () => {
    const fresh = await share(MAYA, 'notes/w-5/plan', 'secret plan');
    expect(fresh).not.toBe(tok);
    expect(await view(tok)).toEqual([]);
  });
});

describe('what a link will hold', () => {
  it('refuses a kind it cannot draw, and a file over its size', async () => {
    expect(await refused(MAYA, `select public.share_file('a', 'a.mov', 'film', 'video/mp4', 'x', 1)`)).toBe(true);
    expect(await refused(MAYA, `select public.share_file('b', 'b.png', 'image', 'image/png', repeat('A', 8400001), 1)`)).toBe(true);
    expect(await share(MAYA, 'c', 'A'.repeat(8_000_000), { name: 'c.png', kind: 'image', type: 'image/png' })).toMatch(/^[a-f0-9]{40}$/);
  });
});

describe('deleting an account', () => {
  it('takes its links down with it', async () => {
    const tok = await share(THEO, 'notes/w-6/plan', 'Theo plan');
    await as(THEO, `select public.delete_my_account()`);
    expect(await view(tok)).toEqual([]);
  });
});
