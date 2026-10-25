// THE PHONE CAN STOP, RUN, SEND NOW, REOPEN AND SCHEDULE A THREAD.
//
// What broke (found reading the code, 2026-10-19): on the hosted phone Stop
// said to stop it on the computer; Run now and changing a schedule threw, Send
// now failed in silence, and Reopen was hidden. Her Mac has a handler for each
// (main/ipc.mjs); the phone's commands were only reply, new, snooze and close.
// And a send whose answer was lost on a poor network, sent again, arrived
// twice, because only the database chose a command's id.
//
// Now the database takes five more kinds of command, each checked by her Mac
// and done by the window's own handler, and the phone names each command
// itself, so the same command sent twice is one. A database not yet updated
// says so in words, and every older command still goes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { commandFor, phoneSlug } from '../renderer/src/cloud-bridge';
import { cloudClient } from '../renderer/src/cloud-rest';
import { checkCommand } from '../shared/phone-snapshot.mjs';
import { applyThrough } from '../main/phone-inbox.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const OWNER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';

describe('what the phone leaves for her Mac', () => {
  it('a stop, run now, send now, reopen and a new moment, each for its thread', () => {
    const on = (kind, payload = {}) => ({ device: DEV, project: 'alpha', item: 'w-1', kind, payload });
    expect(commandFor('zero:stop-session', { product: A, id: 'w-1' })).toEqual(on('stop'));
    expect(commandFor('zero:run-now', { product: A, id: 'w-1' })).toEqual(on('run-now'));
    expect(commandFor('zero:send-now', { product: A, id: 'w-1' })).toEqual(on('send-now'));
    expect(commandFor('zero:reopen', { product: A, id: 'w-1' })).toEqual(on('reopen'));
    expect(commandFor('zero:schedule', { product: A, id: 'w-1', runAt: 1_800_000_000_000 })).toEqual(on('schedule', { runAt: 1_800_000_000_000 }));
    expect(commandFor('zero:schedule', { product: A, id: 'w-1', runAt: 0 })).toEqual(on('schedule', { runAt: 0 }));
    expect(commandFor('zero:schedule', { product: A, id: 'w-1', runAt: 'soon' })).toBeNull();
  });
});

describe('what her Mac takes', () => {
  const opts = { projects: ['alpha'], hasItem: (p, id) => id === 'w-1' };
  const c = (kind, payload = {}, item = 'w-1') => ({ project: 'alpha', item, kind, payload });
  it('each for a thread on her phone, and a schedule with a moment', () => {
    for (const kind of ['stop', 'run-now', 'send-now', 'reopen']) {
      expect(checkCommand(c(kind), opts)).toBe(null);
      expect(checkCommand(c(kind, {}, 'w-9'), opts)).toBe('that thread is not on your phone');
    }
    expect(checkCommand(c('schedule', { runAt: 5 }), opts)).toBe(null);
    expect(checkCommand(c('schedule', { runAt: -1 }), opts)).toBe('a schedule needs a time');
    expect(checkCommand(c('delete'), opts)).toBe('not something the phone may do');
  });

  it('done by the window\'s own handlers', async () => {
    const calls = [];
    const channels = new Map(['zero:stop-session', 'zero:run-now', 'zero:send-now', 'zero:reopen', 'zero:schedule'].map((ch) => [ch, async (_e, args) => { calls.push([ch, args]); return { ok: true }; }]));
    const apply = applyThrough(channels);
    for (const [kind, payload] of [['stop', {}], ['run-now', {}], ['send-now', {}], ['reopen', {}], ['schedule', { runAt: 7 }]]) await apply({ id: 'c', kind, project: 'alpha', item: 'w-1', payload });
    expect(calls).toEqual([
      ['zero:stop-session', { product: 'alpha', id: 'w-1' }],
      ['zero:run-now', { product: 'alpha', id: 'w-1' }],
      ['zero:send-now', { product: 'alpha', id: 'w-1' }],
      ['zero:reopen', { product: 'alpha', id: 'w-1' }],
      ['zero:schedule', { product: 'alpha', id: 'w-1', runAt: 7 }],
    ]);
  });

  it('a run-now the Mac turns down says why', async () => {
    const apply = applyThrough(new Map([['zero:run-now', async () => ({ ok: false, reason: 'at-limit' })]]));
    await expect(apply({ id: 'c', kind: 'run-now', project: 'alpha', item: 'w-1', payload: {} })).rejects.toThrow(/at-limit|limit/);
  });
});

describe('the database', () => {
  let db;
  const migrations = fs.readdirSync(path.join(root, 'cloud/supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => fs.readFileSync(path.join(root, 'cloud/supabase/migrations', f), 'utf8')).join('\n');
  async function as(person, sql, params = []) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${person}', false); set role authenticated;`);
    try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
  }
  const refused = async (person, sql, params) => { try { await as(person, sql, params); return false; } catch { return true; } };
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated; create role anon; create role service_role; create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated;`);
    await db.exec(migrations);
    await db.exec('grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;');
    for (const id of [OWNER, STRANGER]) await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `${id}@example.com`]);
  }, 60_000);
  afterAll(() => db.close());

  it('takes the new kinds, and still refuses any other', async () => {
    for (const kind of ['stop', 'run-now', 'send-now', 'reopen', 'schedule', 'approve']) {
      expect(await refused(OWNER, `insert into public.phone_commands (device, project, item, kind) values ($1, 'alpha', 'w-1', $2)`, [DEV, kind]), kind).toBe(false);
    }
    expect(await refused(OWNER, `insert into public.phone_commands (device, project, item, kind) values ($1, 'alpha', 'w-1', 'delete')`, [DEV])).toBe(true);
  });

  it('lets the phone name a command, so the same one sent twice is one', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const send = `insert into public.phone_commands (id, device, project, item, kind, payload) values ($1, $2, 'alpha', 'w-1', 'reply', '{"text":"yes"}') on conflict (id) do nothing returning id`;
    expect((await as(OWNER, send, [id, DEV])).rows).toEqual([{ id }]);
    expect((await as(OWNER, send, [id, DEV])).rows).toEqual([]);
    expect((await as(OWNER, 'select count(*)::int as n from public.phone_commands where id = $1', [id])).rows).toEqual([{ n: 1 }]);
    // Somebody else's id is not theirs to take, nor to learn of.
    expect((await as(STRANGER, send, [id, DEV])).rows).toEqual([]);
    expect((await as(STRANGER, 'select count(*)::int as n from public.phone_commands', [])).rows).toEqual([{ n: 0 }]);
  });
});

describe('the phone sending one', () => {
  const store = () => { const m = new Map([['agentbox-cloud-session', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600_000, user: { id: OWNER } })]]); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  const answer = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body });

  it('names it, and a second send of the same is answered as the first', async () => {
    const sent = [];
    const client = cloudClient({ url: 'https://x.example', anonKey: 'k' }, { storage: store(), fetchImpl: async (url, init) => { sent.push({ url, prefer: init.headers.prefer, body: JSON.parse(init.body) }); return answer(201, sent.length === 1 ? [{ id: sent[0].body.id, kind: 'reply' }] : []); } });
    const row = { device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes' } };
    const first = await client.insertCommand(row);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[0].url).toMatch(/phone_commands\?on_conflict=id$/);
    expect(sent[0].prefer).toMatch(/resolution=ignore-duplicates/);
    const again = await client.insertCommand({ ...row, id: first.id });
    expect(again.id).toBe(first.id);
  });

  it('on a database not yet updated, sends without a name, and says so plainly for a kind it does not take', async () => {
    let n = 0;
    const fetchImpl = async (url, init) => {
      n += 1;
      const body = JSON.parse(init.body);
      if ('id' in body) return answer(403, { code: '42501', message: 'permission denied for table phone_commands' });
      if (body.kind === 'stop') return answer(400, { code: '23514', message: 'new row for relation "phone_commands" violates check constraint "phone_commands_kind_check"' });
      return answer(201, [{ id: 'db-made', ...body }]);
    };
    const client = cloudClient({ url: 'https://x.example', anonKey: 'k' }, { storage: store(), fetchImpl });
    expect((await client.insertCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'y' } })).id).toBe('db-made');
    await expect(client.insertCommand({ device: DEV, project: 'alpha', item: 'w-1', kind: 'stop', payload: {} })).rejects.toThrow('Your phone cannot do this yet: its online database needs an update.');
    expect(client.signedIn()).toBe(true);
    expect(n).toBeGreaterThan(0);
  });
});
