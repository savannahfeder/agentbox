// A COMMENT ON A SHARED LINK KEEPS ITS PLACE IN THE FILE.
//
// Asked for 2026-11-10: comments on a link page were "much worse than in
// Agentbox", where a note pins a moment in a film or a spot on a picture. A
// link comment was its words and nothing else. Now it may name a place, the
// same shapes a note in the app takes (shared/artifact-marks.mts cleanPlace),
// and 20261111000000_a_link_comment_names_its_place.sql keeps and returns it.
// Every migration runs here in PGlite, as the other link tests do.
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
const JUN = '44444444-4444-4444-4444-444444444444';

let db;
let tok;
async function as(person, sql, params = [], role = 'authenticated') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rows = async (person, sql, params, role) => (await as(person, sql, params, role)).rows;
const refused = async (person, sql, params) => { try { await as(person, sql, params); return false; } catch { return true; } };
const comment = (words, place) => rows(JUN, 'select public.comment_on_file_link($1, $2, $3) as id', [tok, words, place === undefined ? null : JSON.stringify(place)]);

beforeAll(async () => {
  db = new PGlite(await emptyDatabase());
  await db.exec(STAND_IN);
  await db.exec(migration);
  await db.exec(GRANTS);
  for (const [id, email, name] of [[MAYA, 'maya@nw.test', 'Maya Chen'], [JUN, 'jun@else.test', 'Jun']]) {
    await db.query('insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)', [id, email, { full_name: name }]);
  }
  tok = (await rows(MAYA, 'select public.share_file($1, $2, $3, $4, $5, $6, $7) as t', ['launch/w-1/cut.mp4', 'cut.mp4', 'video', 'video/mp4', `{"pieces":1,"size":10,"hash":"${'a'.repeat(40)}"}`, 1, 'a'.repeat(40)]))[0].t;
}, 60_000);
afterAll(() => db.close());

describe('a place', () => {
  it('a moment in a film, and a spot on its frame, comes back to anyone reading and to the owner', async () => {
    await comment('Cut here', { kind: 'time', s: 24.5 });
    await comment('This logo is soft', { kind: 'time', s: 31, x: 0.4, y: 0.6 });
    const read = await rows(null, 'select body, place from public.file_link_comments_of($1)', [tok], 'anon');
    expect(read).toEqual([{ body: 'Cut here', place: { kind: 'time', s: 24.5 } }, { body: 'This logo is soft', place: { kind: 'time', s: 31, x: 0.4, y: 0.6 } }]);
    const told = await rows(MAYA, 'select body, place from public.new_comments_on_my_links($1)', [new Date(0)]);
    expect(told.map((r) => r.place)).toEqual([{ kind: 'time', s: 24.5 }, { kind: 'time', s: 31, x: 0.4, y: 0.6 }]);
  });

  it('a spot on a picture, a page and quoted words are kept too', async () => {
    for (const place of [{ kind: 'pin', x: 0.1, y: 0.9 }, { kind: 'page', n: 3 }, { kind: 'quote', text: 'ship on Tuesday' }]) {
      const [{ id }] = await comment('ok', place);
      const [{ place: kept }] = await rows(MAYA, 'select place from public.file_link_comments where id = $1', [id]).catch(async () => db.query('select place from public.file_link_comments where id = $1', [id]).then((r) => r.rows));
      expect(kept).toEqual(place);
    }
  });

  it('none is a comment on the whole file, and the old two-word call still works', async () => {
    await comment('Love it');
    expect((await rows(JUN, 'select public.comment_on_file_link($1, $2) as id', [tok, 'Still works']))[0].id).toBeTruthy();
    const read = await rows(null, 'select body, place from public.file_link_comments_of($1)', [tok], 'anon');
    expect(read.filter((r) => ['Love it', 'Still works'].includes(r.body)).map((r) => r.place)).toEqual([null, null]);
  });
});

describe('what is refused', () => {
  it('a place of no known shape, out of the frame, or too big', async () => {
    for (const place of [{ kind: 'map' }, { kind: 'pin', x: 1.5, y: 0.2 }, { kind: 'time', s: -1 }, { kind: 'time', s: 'soon' }, { kind: 'page', n: 0 }, { kind: 'quote', text: '' }, { kind: 'quote', text: 'x'.repeat(501) }, [1, 2], 'time']) {
      expect(await refused(JUN, 'select public.comment_on_file_link($1, $2, $3)', [tok, 'hi', JSON.stringify(place)]), JSON.stringify(place)).toBe(true);
    }
  });
  it('anyone not signed in, with a place or without', async () => {
    expect(await refused(null, 'select public.comment_on_file_link($1, $2, $3)', [tok, 'hi', JSON.stringify({ kind: 'time', s: 1 })])).toBe(true);
  });
});
