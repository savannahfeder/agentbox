// FEEDBACK IS KEPT WHERE AN AGENT CAN READ IT (w-52761c8004, 2026-11-12).
//
// Asked for: an agent to look through what people send with the Feedback card
// and say what needs fixing. It could not: the server function only emailed
// each one to a secret inbox, and kept nothing. The founder had to screenshot
// the email into the thread. Now the function also keeps each one in a private
// table (service role only), with whether its email went, and
// `npm run feedback` reads them back with the Supabase sign-in that already
// applies migrations.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { listSql, fileSql, describeFeedback, readArgs } from '../scripts/lib/feedback-reading.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const MAIL = { FEEDBACK_TO: 'to', FEEDBACK_FROM: 'from', RESEND_API_KEY: 'key' };
const STORE = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'service' };

describe('the feedback function keeps what it is sent', () => {
  let handler;
  let env = {};
  const calls = [];
  let answer = (url) => new Response(url.includes('resend') ? '{"id":"1"}' : '7', { status: 200 });
  beforeAll(async () => {
    vi.stubGlobal('Deno', { serve: (fn) => { handler = fn; }, env: { get: (k) => env[k] } });
    vi.stubGlobal('fetch', vi.fn(async (url, init) => { calls.push({ url: String(url), init }); return answer(String(url)); }));
    await import('../cloud/supabase/functions/feedback/index.ts');
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => {
    calls.length = 0;
    env = { ...MAIL, ...STORE };
    answer = (url) => new Response(url.includes('resend') ? '{"id":"1"}' : '7', { status: 200 });
  });

  const post = (body) => new Request('https://fn.example/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const sent = { text: ' drop anywhere please ', files: [{ name: 'shot.png', type: 'image/png', data: 'AAAABBBB' }], app: { version: '0.1.22', os: 'darwin 25.6.0', install: 'abcdef1234' } };
  const kept = () => calls.find((c) => c.url.endsWith('/rest/v1/rpc/keep_feedback'));

  it('mails it and keeps it, words, app, install and files included', async () => {
    const res = await handler(post(sent));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls.filter((c) => c.url.includes('resend'))).toHaveLength(1);
    const keep = kept();
    expect(keep.url).toBe('https://db.example/rest/v1/rpc/keep_feedback');
    expect(keep.init.headers.apikey).toBe('service');
    expect(keep.init.headers.authorization).toBe('Bearer service');
    expect(JSON.parse(keep.init.body)).toEqual({
      the_words: 'drop anywhere please',
      the_version: '0.1.22',
      the_os: 'darwin 25.6.0',
      the_install: 'abcdef1234',
      was_mailed: true,
      why_not_mailed: null,
      the_files: [{ name: 'shot.png', type: 'image/png', bytes: 6, data: 'AAAABBBB' }],
    });
  });

  it('every call it makes has a deadline', async () => {
    await handler(post(sent));
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(c.init.signal, c.url).toBeInstanceOf(AbortSignal);
  });

  it('keeps it when the mail is refused, with the reason and no address in it', async () => {
    answer = (url) => url.includes('resend')
      ? new Response('{"name":"validation_error","message":"You can only send to someone@example.com"}', { status: 403 })
      : new Response('7', { status: 200 });
    const res = await handler(post(sent));
    expect(res.status).toBe(200);
    const row = JSON.parse(kept().init.body);
    expect(row.was_mailed).toBe(false);
    expect(row.why_not_mailed).toMatch(/validation_error/);
    expect(row.why_not_mailed).not.toMatch(/@/);
  });

  it('keeps it when mail is not set up at all, and says so on the row', async () => {
    env = { ...STORE };
    const res = await handler(post(sent));
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.url.includes('resend'))).toBe(false);
    expect(JSON.parse(kept().init.body)).toMatchObject({ was_mailed: false, why_not_mailed: 'mail is not set up' });
  });

  it('still answers ok when the mail went but keeping failed', async () => {
    answer = (url) => url.includes('resend') ? new Response('{"id":"1"}', { status: 200 }) : new Response('{"message":"relation does not exist"}', { status: 404 });
    const res = await handler(post(sent));
    expect(res.status).toBe(200);
  });

  it('refuses when it could neither mail nor keep it', async () => {
    answer = () => new Response('{"message":"down"}', { status: 500 });
    const res = await handler(post(sent));
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBe(false);
  });

  it('says it is not set up when it has nowhere to mail or keep it', async () => {
    env = {};
    const res = await handler(post(sent));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('keeps nothing that was refused for being empty', async () => {
    const res = await handler(post({ text: '  ', files: [] }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('the table it is kept in', () => {
  const dir = 'cloud/supabase/migrations';
  const file = fs.readdirSync(path.join(root, dir)).find((f) => /feedback_is_kept/.test(f));
  const sql = file ? read(path.join(dir, file)) : '';
  it('exists as a migration', () => {
    expect(file).toBeTruthy();
  });
  it('nobody signed in or out can read or write it; only the server can', () => {
    for (const table of ['public.feedback', 'public.feedback_files']) {
      expect(sql).toContain(`alter table ${table} enable row level security;`);
      expect(sql).toContain(`revoke all on ${table} from anon, authenticated;`);
    }
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/revoke all on function public\.keep_feedback\([^)]*\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.keep_feedback\([^)]*\) to service_role;/);
  });
  it('can be applied twice without harm', () => {
    expect(sql).toMatch(/create table if not exists public\.feedback \(/);
    expect(sql).toMatch(/create table if not exists public\.feedback_files \(/);
    expect(sql).toMatch(/create or replace function public\.keep_feedback/);
  });
});

describe('reading it back', () => {
  it('lists the newest first, 20 unless asked, and never more than 500', () => {
    expect(listSql({})).toMatch(/order by f\.sent_at desc limit 20;/);
    expect(listSql({ limit: 5 })).toMatch(/limit 5;/);
    expect(listSql({ limit: 100000 })).toMatch(/limit 500;/);
    expect(listSql({ limit: 0 })).toMatch(/limit 1;/);
    expect(listSql({ limit: 'x; drop table people' })).toMatch(/limit 20;/);
  });
  it('lists the files by name and size, not their contents', () => {
    expect(listSql({})).not.toMatch(/x\.data/);
  });
  it('takes a since date and nothing that is not one', () => {
    expect(listSql({ since: '2026-11-01' })).toContain("f.sent_at >= '2026-11-01'");
    expect(() => listSql({ since: "2026-11-01'; drop table people; --" })).toThrow(/YYYY-MM-DD/);
  });
  it('fetches one file at a time, by numbers only', () => {
    expect(fileSql(7, 0)).toBe('select name, type, data from public.feedback_files where feedback_id = 7 and position = 0;');
    expect(() => fileSql('7 or 1=1', 0)).toThrow();
    expect(() => fileSql(7, -1)).toThrow();
  });
  it('reads its arguments', () => {
    expect(readArgs([])).toEqual({ limit: 20, since: null, files: null, json: false });
    expect(readArgs(['--limit', '5', '--since', '2026-11-01', '--files', 'out', '--json'])).toEqual({ limit: 5, since: '2026-11-01', files: 'out', json: true });
  });
  it('shows the words, where it came from, the files, and an email that did not go', () => {
    const text = describeFeedback({
      id: 7, sent_at: '2026-11-11T10:00:00Z', words: 'drop anywhere please', app_version: '0.1.22', os: 'darwin 25.6.0',
      install: 'abcdef1234', mailed: false, mail_error: 'validation_error: nope', files: [{ position: 0, name: 'shot.png', type: 'image/png', bytes: 2048 }],
    });
    expect(text).toContain('#7');
    expect(text).toContain('2026-11-11');
    expect(text).toContain('drop anywhere please');
    expect(text).toContain('Agentbox 0.1.22 · darwin 25.6.0 · install abcdef12');
    expect(text).toContain('shot.png (2 KB)');
    expect(text).toMatch(/email did not go: validation_error: nope/);
    expect(describeFeedback({ id: 8, sent_at: '2026-11-11T10:00:00Z', words: 'ok', mailed: true, files: [] })).not.toMatch(/email/);
  });
  it('is one command', () => {
    expect(JSON.parse(read('package.json')).scripts.feedback).toBe('node scripts/run.mjs scripts/read-feedback.mjs');
  });
});
