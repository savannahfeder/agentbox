// A PHONE REPLY CARRIES ON IN THE CLOUD WITH THE COMPUTER SHUT: THE CONTRACT.
//
// On 2026-10-24 the founder read the phone's first screen ("What you write
// here goes to your computer, which hands it to the coding agent") and said
// that is not how it is meant to work: "you have your computer in your
// backpack and you're riding the bus. Everything should work from your mobile
// app with your computer completely closed." Until then a reply from the phone
// waited in phone_commands until the computer woke.
//
// Now the computer leaves each phone thread's next turn ready in the cloud (a
// kit), the cloud server starts a reply the computer has not claimed within a
// minute from it and claims the command `cloud:<run id>`, writes the agent's
// answer into the phone's copy of the thread, and the computer joins the run
// when it wakes. This file holds the parts all three share
// (shared/cloud-kit.mjs, shared/phone-snapshot.mjs withCloudTurn) and the
// database's rule that only the server names a cloud claim, run against every
// migration in PGlite.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  REPLY_MARK, KIT_VERSION, CLOUD_TAKES_AFTER_MS, cloudClaim, runOfClaim, cloudSessionId, kitKey, serverRunKey,
  replyFrame, replyPrompt, cloudUserLine, checkKit, startPayload, lastAnswerIn,
} from '../shared/cloud-kit.mjs';
import { withCloudTurn, threadSnapshot } from '../shared/phone-snapshot.mjs';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const kit = (over = {}) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: NOW - 60_000, device: 'a1b2c3d4e5f6', project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: 'abc123',
  argv: ['claude', '--resume', 's-1', '--output-format', 'stream-json'], env: { ZERO_ITEM: 'w-1' },
  bundleKey: 'runs/kits/a1b2c3d4e5f6/alpha/w-1/in.bundle',
  files: [{ path: '/tmp/settings.json', key: 'runs/kits/a1b2c3d4e5f6/alpha/w-1/files/1' }],
  homeFiles: [{ rel: '.claude/CLAUDE.md', key: 'runs/kits/a1b2c3d4e5f6/alpha/w-1/home/CLAUDE.md' }],
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1' },
  bringDirs: [{ name: 'projects.tgz', dir: '/Users/me/.claude/projects/-Users-me-dev-alpha' }],
  frame: { before: 'The founder has replied.\n\nWhat they said:\n\n', after: '\n\n# Boundaries' },
  ...over,
});

describe('the names all three agree on', () => {
  it('a cloud claim names its run, and nothing else is one', () => {
    expect(runOfClaim(cloudClaim('run-1'))).toBe('run-1');
    for (const not of [null, '', 'cloud:', 'mac', 'cloud:../x', 'cloud:a b']) expect(runOfClaim(not)).toBeNull();
  });
  it('a run the server starts is asked for by the name the computer would give it', () => {
    expect(cloudSessionId('w-9f9c2570e2', 'r1')).toBe('agentbox-w-9f9c2570e2-r1');
  });
  it('a kit and a server run live in the person\'s own runs, and a strange name cannot climb out', () => {
    expect(kitKey('a1b2c3d4e5f6', 'alpha', 'w-1')).toBe('runs/kits/a1b2c3d4e5f6/alpha/w-1.json');
    for (const odd of ['..', '../..', '.']) expect(kitKey(odd, 'a/b', odd).split('/')).not.toContain('..');
    expect(kitKey('x', 'a/b', 'w 1')).toBe('runs/kits/x/a_b/w_1.json');
    expect(serverRunKey('r1')).toBe('runs/server/r1.json');
  });
  it('the cloud takes a reply the computer leaves for a minute', () => {
    expect(CLOUD_TAKES_AFTER_MS).toBe(60_000);
  });
});

describe('the reply in the turn\'s prompt', () => {
  it('is found once, and the reply goes exactly there', () => {
    const frame = replyFrame(`said:\n\n${REPLY_MARK}\n\nend`);
    expect(replyPrompt(frame, 'yes, ship it')).toBe('said:\n\nyes, ship it\n\nend');
  });
  it('a prompt with no place, or two, has no frame', () => {
    expect(replyFrame('no mark here')).toBeNull();
    expect(replyFrame(`${REPLY_MARK} and ${REPLY_MARK}`)).toBeNull();
  });
  it('goes to the agent as the computer writes a message, with the cloud\'s note on top', () => {
    const line = cloudUserLine('yes', { note: '# You are in the cloud', uuid: 'u-1' });
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({ type: 'user', uuid: 'u-1', message: { role: 'user', content: '# You are in the cloud\n\nyes' }, parent_tool_use_id: null, session_id: '' });
  });
});

describe('a kit the server trusts', () => {
  it('a whole, fresh Claude Code kit passes', () => {
    expect(checkKit(kit(), { now: NOW })).toBeNull();
  });
  it('an old one, another engine, a Codex one with no thread to open, or one with no sign-in or no copy of the folder does not', () => {
    expect(checkKit(kit({ madeAt: NOW - 7 * 24 * 3600_000 }), { now: NOW })).toMatch(/too old/);
    expect(checkKit(kit({ engine: 'opencode' }), { now: NOW })).toMatch(/Claude Code and Codex/);
    expect(checkKit(kit({ engine: 'codex' }), { now: NOW })).toMatch(/Codex kit/);
    expect(checkKit(kit({ login: null }), { now: NOW })).toMatch(/sign-in/);
    expect(checkKit(kit({ bundleKey: null }), { now: NOW })).toMatch(/copy of the folder/);
  });
  it('a key outside the person\'s runs, or a sign-in named as a run\'s file, is refused', () => {
    expect(checkKit(kit({ files: [{ path: '/tmp/x', key: 'logins/claude/acct-1' }] }), { now: NOW })).toMatch(/bad file/);
    expect(checkKit(kit({ bundleKey: 'runs/../logins/x' }), { now: NOW })).toMatch(/bad bundle/);
    expect(checkKit(kit({ login: { engine: 'claude', key: 'runs/x' } }), { now: NOW })).toMatch(/sign-in/);
  });
});

describe('the start the server sends', () => {
  it('is the computer\'s start, with links made for this run and the sign-in by name', async () => {
    const p = await startPayload(kit(), {
      runId: 'r1', getUrl: async (k) => `get:${k}`, putUrl: async (k) => `put:${k}`, loginName: (k) => `agentbox-login:${k}`,
    });
    expect(p).toMatchObject({ action: 'start', runId: 'r1', cwd: kit().cwd, branch: 'agentbox/w-1', bundleUrl: `get:${kit().bundleKey}`, argv: kit().argv, tails: true });
    expect(p.files).toEqual([{ path: '/tmp/settings.json', url: 'get:runs/kits/a1b2c3d4e5f6/alpha/w-1/files/1' }]);
    expect(p.login).toEqual({ engine: 'claude', id: 'acct-1', url: 'agentbox-login:logins/claude/acct-1' });
    expect(p.results.doneUrl).toBe('put:runs/r1/done.json');
    expect(p.results.bring).toEqual([{ dir: kit().bringDirs[0].dir, url: 'put:runs/r1/projects.tgz' }]);
    expect(p.offline).toMatchObject({ endTurn: 'claude-stream-json' });
  });
});

describe('what the agent answered', () => {
  const ev = (seq, text) => JSON.stringify({ seq, kind: 'stdout', data: Buffer.from(text).toString('base64') });
  it('is the text of its last result, across output split anywhere', () => {
    const out = `${JSON.stringify({ type: 'assistant' })}\n${JSON.stringify({ type: 'result', result: 'Done. Shipped it.', is_error: false })}\n`;
    const log = [ev(1, out.slice(0, 20)), ev(2, out.slice(20)), JSON.stringify({ seq: 3, kind: 'stderr', data: '' })].join('\n');
    expect(lastAnswerIn(log)).toEqual({ text: 'Done. Shipped it.', isError: false });
  });
  it('is nothing when the run never answered', () => {
    expect(lastAnswerIn(ev(1, '{"type":"assistant"}\n'))).toBeNull();
  });
});

describe('the phone\'s copy after a cloud turn', () => {
  const snap = threadSnapshot({ id: 'w-1', title: 'Ship it', status: 'blocked', result: 'Ready?', updatedAt: NOW - 3600_000 }, [
    { ts: NOW - 3600_000, source: 'agent', patch: { result: 'Ready?' } },
  ]);
  it('holds her reply, the agent\'s answer and the row waiting on her again', () => {
    const next = withCloudTurn(snap, { reply: 'yes', answer: 'Shipped.', repliedAt: NOW - 120_000, answeredAt: NOW });
    expect(next.item).toMatchObject({ answer: 'yes', result: 'Shipped.', status: 'blocked', updatedAt: NOW });
    expect(next.history.slice(-3).map((l) => [l.source, l.patch])).toEqual([
      ['founder', { answer: 'yes', status: 'open' }], ['agent', { result: 'Shipped.' }], ['system', { status: 'blocked' }],
    ]);
    expect(next.item.wrote.result).toEqual({ ts: NOW, source: 'agent' });
  });
  it('keeps under the line limit by letting the oldest lines go', () => {
    const next = withCloudTurn(snap, { reply: 'a', answer: 'b', repliedAt: 1, answeredAt: 2 }, { lines: 3, textChars: 100, bytes: 900_000 });
    expect(next.history).toHaveLength(3);
    expect(next.olderLines).toBe(1);
  });
  it('hides a key the agent quoted', () => {
    const next = withCloudTurn(snap, { reply: 'ok', answer: 'used sk-ant-abcdefghijklmnopqrstuvwxyz0123', repliedAt: 1, answeredAt: 2 });
    expect(next.item.result).not.toMatch(/sk-ant-abcdefghij/);
  });
  it('is nothing for something that is not a copy', () => {
    expect(withCloudTurn(null, { reply: 'a', answer: 'b', repliedAt: 1, answeredAt: 2 })).toBeNull();
  });
});

describe('the database: only the server names a cloud claim', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'cloud/supabase/migrations');
  const migrations = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const STAND_IN = `
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated; create role anon; create role service_role bypassrls;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;
  const ME = '11111111-1111-1111-1111-111111111111';
  let db;
  const as = async (role, sql) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${role === 'authenticated' ? ME : ''}', false); set role ${role};`);
    try { return await db.query(sql); } finally { await db.exec('reset role;'); }
  };
  let id;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(STAND_IN);
    await db.exec(migrations);
    await db.exec(`
      grant usage on schema auth to authenticated, anon, service_role;
      grant execute on function auth.uid() to authenticated, anon, service_role;
      insert into auth.users (id, email, email_confirmed_at) values ('${ME}', 'me@example.com', now());
      insert into public.phone_projects (owner, device, project, name) values ('${ME}', 'a1b2c3d4e5f6', 'alpha', 'Alpha');
    `);
    id = (await as('authenticated', `insert into public.phone_commands (device, project, item, kind, payload) values ('a1b2c3d4e5f6', 'alpha', 'w-1', 'reply', '{"text":"yes"}') returning id`)).rows[0].id;
  });
  afterEach(() => db.close());

  it('a new command is never born claimed by the cloud', async () => {
    expect((await db.query(`select claimed_by from public.phone_commands where id = '${id}'`)).rows[0].claimed_by).toBeNull();
  });
  it('the server claims a command for its run', async () => {
    await as('service_role', `update public.phone_commands set claimed_at = now(), claimed_by = 'cloud:r1' where id = '${id}' and claimed_at is null`);
    expect((await db.query(`select claimed_by from public.phone_commands where id = '${id}'`)).rows[0].claimed_by).toBe('cloud:r1');
  });
  it('a computer that claims first wins, and the server\'s claim then changes nothing', async () => {
    await as('authenticated', `update public.phone_commands set claimed_at = now() where id = '${id}'`);
    const out = await as('service_role', `update public.phone_commands set claimed_at = now(), claimed_by = 'cloud:r1' where id = '${id}' and claimed_at is null returning id`);
    expect(out.rows).toHaveLength(0);
  });
  it('someone signed in cannot name a cloud claim', async () => {
    await expect(as('authenticated', `update public.phone_commands set claimed_at = now(), claimed_by = 'cloud:r1' where id = '${id}'`)).rejects.toThrow();
  });
  it('who claimed is never changed after the claim', async () => {
    await as('service_role', `update public.phone_commands set claimed_at = now(), claimed_by = 'cloud:r1' where id = '${id}'`);
    await expect(as('service_role', `update public.phone_commands set claimed_by = 'cloud:r2' where id = '${id}'`)).rejects.toThrow(/claimed/);
  });
  it('a cloud claim whose run could not start is given back for the computer', async () => {
    await as('service_role', `update public.phone_commands set claimed_at = now(), claimed_by = 'cloud:r1' where id = '${id}'`);
    await as('service_role', `update public.phone_commands set claimed_at = null, claimed_by = null where id = '${id}' and claimed_by = 'cloud:r1'`);
    const row = (await db.query(`select claimed_at, claimed_by from public.phone_commands where id = '${id}'`)).rows[0];
    expect(row).toEqual({ claimed_at: null, claimed_by: null });
  });
  it('nobody gives back the computer\'s own claim, and someone signed in gives back none', async () => {
    await as('authenticated', `update public.phone_commands set claimed_at = now() where id = '${id}'`);
    await expect(as('service_role', `update public.phone_commands set claimed_at = null where id = '${id}'`)).rejects.toThrow(/claimed/);
    const other = (await as('authenticated', `insert into public.phone_commands (device, project, item, kind, payload) values ('a1b2c3d4e5f6', 'alpha', 'w-1', 'reply', '{}') returning id`)).rows[0].id;
    await as('service_role', `update public.phone_commands set claimed_at = now(), claimed_by = 'cloud:r2' where id = '${other}'`);
    await expect(as('authenticated', `update public.phone_commands set claimed_at = null where id = '${other}'`)).rejects.toThrow();
  });
  it('the computer still marks a cloud-claimed command taken', async () => {
    await as('service_role', `update public.phone_commands set claimed_at = now(), claimed_by = 'cloud:r1' where id = '${id}'`);
    await as('authenticated', `update public.phone_commands set taken_at = now(), outcome = 'done' where id = '${id}'`);
    expect((await db.query(`select outcome from public.phone_commands where id = '${id}'`)).rows[0].outcome).toBe('done');
  });
  it('a computer says whether it leaves its threads ready for the cloud', async () => {
    await as('authenticated', `update public.phone_projects set cloud = true where owner = '${ME}'`);
    expect((await db.query('select cloud from public.phone_projects')).rows[0].cloud).toBe(true);
  });
});
