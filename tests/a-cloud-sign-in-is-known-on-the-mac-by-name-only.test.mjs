// A CLOUD SIGN-IN IS KNOWN ON THE MAC BY NAME ONLY.
//
// The Mac's half of docs/cloud/PLAN.md, "Sign-ins live in the cloud" (the
// founder's decision, 2026-10-14: one sign-in per account, made in the cloud
// through each vendor's own sign-in, kept between runs). The Mac keeps a note
// per account in ~/.agentbox/cloud-logins.json and never reads a login. What
// each case here guards came out of Codex's review of the plan that day:
//
//   - an old run reporting trouble must not undo a new sign-in (finding 10);
//   - a Codex login is renewed before it runs out, never two renewals at once
//     on one refresh token, even across an app restart (findings 5, 8);
//   - a Codex sign-in made with another ChatGPT account is refused (13);
//   - what a newer sign-in replaced is deleted, but not under a run that was
//     just handed its link (14);
//   - a run whose login was refused brings its work home and says so with its
//     own exit code, which strikes no account on the Mac (9).
//
// Driven against the real sandbox server in process, with stand-ins for both
// vendors' commands (tests/fixtures/cloud/fake-vendor-cli).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox, pickBaseEnv } from '../cloud/sandbox/server.mjs';
import {
  cloudLoginFor, recordCloudLogin, markCloudLogin, cloudLoginState, mayRunOn, startCloudSignIn,
  renewCloudCodexLogin, sweepRetiredLogins, loginObjectKey, readCloudLogins, forgetOldCloudTokens,
  listCloudLogins, pickCloudLogin, removeCloudLogin,
  CODEX_RENEW_BEFORE_MS, CODEX_RUN_NEEDS_MS,
} from '../main/cloud/logins.mjs';
import { cloudRun, LOGIN_TROUBLE } from '../main/cloud/run.mjs';
import { loginsCarriedBy } from '../main/cloud/run-cli.mjs';

const FAKE = fileURLToPath(new URL('./fixtures/cloud/fake-vendor-cli.mjs', import.meta.url));
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const jwt = (exp, extra = {}) => ['e30', Buffer.from(JSON.stringify({ exp, ...extra })).toString('base64url'), 'sig'].join('.');
const H = 3600_000;

let tmp; let home; let objects; let s3; let s3Url; let sandbox; let bin; let reads;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-logins-')));
  home = path.join(tmp, 'home');
  objects = new Map();
  reads = [];
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${name} "$@"\n`, { mode: 0o755 });
});

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeSandbox(mode = '') {
  sandbox = createSandbox({
    workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock'),
    baseEnv: { ...pickBaseEnv(process.env), PATH: `${bin}:${process.env.PATH}`, ...(mode ? { FAKE_VENDOR_MODE: mode } : {}) },
    terminal: (line) => ['sh', '-c', line], whoIs: async () => null, uploadRetryMs: 10,
  });
}
const stopped = [];
const transport = {
  invoke: (_sid, payload) => sandbox.handle(payload),
  async stop(sid) { stopped.push(sid); },
};
const storage = {
  async put(k, body) { objects.set(k, Buffer.from(body)); },
  async get(k) { reads.push(k); return objects.get(k) ?? null; },
  async del(k) { objects.delete(k); },
  async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
};
const until = async (fn, what, ms = 15_000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 20)); }
};

describe('the note the Mac keeps', () => {
  it('names the login and holds no secret', () => {
    recordCloudLogin('claude', '/Users/x/.claude-2', { id: 'L1', savedAt: 5 }, { home });
    const text = fs.readFileSync(path.join(home, '.agentbox', 'cloud-logins.json'), 'utf8');
    expect(cloudLoginFor('claude', '/Users/x/.claude-2', { home })).toMatchObject({ id: 'L1', savedAt: 5, broken: null });
    expect(text).not.toMatch(/token|sk-ant|refresh/i);
    expect((fs.statSync(path.join(home, '.agentbox', 'cloud-logins.json')).mode & 0o777).toString(8)).toBe('600');
  });

  it('lets trouble from an old run mark only the login it ran on, never a newer sign-in', () => {
    recordCloudLogin('claude', '/a', { id: 'old' }, { home });
    recordCloudLogin('claude', '/a', { id: 'new' }, { home });
    expect(markCloudLogin('claude', '/a', 'old', { broken: 'refused' }, { home })).toBe(false);
    expect(cloudLoginState(cloudLoginFor('claude', '/a', { home }))).toBe('ready');
    expect(markCloudLogin('claude', '/a', 'new', { broken: 'refused' }, { home })).toBe(true);
    expect(cloudLoginState(cloudLoginFor('claude', '/a', { home }))).toBe('broken');
    // A new sign-in clears it.
    recordCloudLogin('claude', '/a', { id: 'newer' }, { home });
    expect(cloudLoginState(cloudLoginFor('claude', '/a', { home }))).toBe('ready');
  });

  it('reads a Codex login\'s expiry: ready, renewal due, or not runnable until renewed', () => {
    const now = 1_800_000_000_000;
    const codex = (left) => ({ engine: 'codex', id: 'C', expiresAt: now + left });
    expect(cloudLoginState(null)).toBe('none');
    expect(cloudLoginState(codex(CODEX_RENEW_BEFORE_MS + H), { now })).toBe('ready');
    expect(cloudLoginState(codex(CODEX_RENEW_BEFORE_MS - H), { now })).toBe('stale');
    expect(cloudLoginState(codex(CODEX_RUN_NEEDS_MS + 60_000), { now })).toBe('stale');
    expect(cloudLoginState(codex(CODEX_RUN_NEEDS_MS - 60_000), { now })).toBe('renew');
    expect(cloudLoginState(codex(-H), { now })).toBe('renew');
    expect(mayRunOn('stale')).toBe(true);
    expect(mayRunOn('renew')).toBe(false);
    // Claude's lasts a year and never needs renewing.
    expect(cloudLoginState({ engine: 'claude', id: 'X', expiresAt: null }, { now })).toBe('ready');
  });

  it('deletes what a newer sign-in replaced only after its grace, and never the current one', async () => {
    const t0 = 1_800_000_000_000;
    objects.set(loginObjectKey('claude', 'a'), Buffer.from('x'));
    objects.set(loginObjectKey('claude', 'b'), Buffer.from('y'));
    recordCloudLogin('claude', '/acct', { id: 'a' }, { home, now: t0 });
    recordCloudLogin('claude', '/acct', { id: 'b' }, { home, now: t0 });
    await sweepRetiredLogins('claude', '/acct', { storage, home, now: t0 + 5 * 60_000 });
    expect(objects.has(loginObjectKey('claude', 'a'))).toBe(true);
    await sweepRetiredLogins('claude', '/acct', { storage, home, now: t0 + 2 * H });
    expect(objects.has(loginObjectKey('claude', 'a'))).toBe(false);
    expect(objects.has(loginObjectKey('claude', 'b'))).toBe(true);
    expect(cloudLoginFor('claude', '/acct', { home }).retired).toEqual([]);
  });
});

// The accounts are hers to choose (2026-10-14). Runs used to be spread over
// them; one account carries them now (w-dac993a554).
describe('the cloud accounts she added', () => {
  it('send every run of an engine to its first account, and nothing to the second', () => {
    recordCloudLogin('claude', 'acct-a', { id: 'A', savedAt: 1 }, { home });
    recordCloudLogin('claude', 'acct-b', { id: 'B', savedAt: 2 }, { home });
    recordCloudLogin('codex', 'acct-c', { id: 'C', savedAt: 3, expiresAt: Date.now() + 200 * H }, { home });
    const picks = [1, 2, 3, 4].map((i) => pickCloudLogin('claude', { home, now: 1_000 + i }).key);
    expect(picks).toEqual(['acct-a', 'acct-a', 'acct-a', 'acct-a']);
    expect(pickCloudLogin('codex', { home }).key).toBe('acct-c');
    // A login that has stopped working is not an account; the next one is.
    markCloudLogin('claude', 'acct-a', 'A', { broken: 'refused' }, { home });
    expect(pickCloudLogin('claude', { home, now: 9_000 }).key).toBe('acct-b');
    expect(listCloudLogins('claude', { home }).map((r) => r.key)).toEqual(['acct-a', 'acct-b']);
  });

  it('pick nothing when none of the engine\'s accounts can run', () => {
    expect(pickCloudLogin('claude', { home })).toBe(null);
    recordCloudLogin('codex', 'acct-x', { id: 'X', expiresAt: Date.now() + H }, { home });
    expect(pickCloudLogin('codex', { home })).toBe(null);
  });

  it('take a removed account and every object it left out of the cloud', async () => {
    objects.set(loginObjectKey('claude', 'A1'), Buffer.from('x'));
    objects.set(loginObjectKey('claude', 'A2'), Buffer.from('y'));
    recordCloudLogin('claude', 'acct-a', { id: 'A1' }, { home });
    recordCloudLogin('claude', 'acct-a', { id: 'A2' }, { home });
    expect(await removeCloudLogin('claude', 'acct-a', { storage, home })).toBe(true);
    expect(listCloudLogins('claude', { home })).toEqual([]);
    expect(objects.has(loginObjectKey('claude', 'A1'))).toBe(false);
    expect(objects.has(loginObjectKey('claude', 'A2'))).toBe(false);
  });
});

describe('the cloud menu\'s sign-in', () => {
  // 2026-10-15: "It's been over a minute and it's still saying Adding."
  // However the cloud's side goes, this Mac stops waiting on a check that
  // never ends, says so, and stops the session.
  it('stops waiting on a check that never ends, says so, and stops the cloud session', async () => {
    makeSandbox('claude-silent');
    const s = startCloudSignIn({ transport, storage, engine: 'claude', dir: '/Users/x/.claude-q', home, pollWaitMs: 50, checkMs: 1500 });
    await until(() => s.status().state === 'needs-code', 'the link');
    await s.code('good#code');
    expect(s.status().state).toBe('checking');
    const end = await until(() => s.status().state === 'failed' && s.status(), 'the give-up', 5000);
    expect(end.message).toMatch(/didn’t finish signing in/);
    expect(cloudLoginFor('claude', '/Users/x/.claude-q', { home })).toBe(null);
  });

  it('does not give up on one that finishes in time', async () => {
    makeSandbox();
    const s = startCloudSignIn({ transport, storage, engine: 'claude', dir: '/Users/x/.claude-t', home, pollWaitMs: 50, checkMs: 10_000 });
    await until(() => s.status().state === 'needs-code', 'the link');
    await s.code('good#code');
    const end = await s.done;
    expect(end.state, end.message).toBe('saved');
  });

  it('relays Claude\'s link and her code, and records the new login once the cloud kept it', async () => {
    makeSandbox();
    const changes = [];
    const s = startCloudSignIn({ transport, storage, engine: 'claude', dir: '/Users/x/.claude', home, pollWaitMs: 50, onChange: (st) => changes.push(st.state) });
    await until(() => s.status().state === 'needs-code', 'the link');
    expect(s.status().url).toMatch(/^https:\/\/claude\.com\/cai\/oauth\/authorize\?/);
    expect(await s.code('good#code')).toBe(true);
    const end = await s.done;
    expect(end.state, end.message).toBe('saved');
    const rec = cloudLoginFor('claude', '/Users/x/.claude', { home });
    expect(objects.has(loginObjectKey('claude', rec.id))).toBe(true);
    expect(changes).toEqual(expect.arrayContaining(['needs-code', 'checking', 'saved']));
    // The Mac never read the login, and let the session go.
    expect(reads.some((k) => k.startsWith('logins/'))).toBe(false);
    expect(stopped.length).toBeGreaterThan(0);
    expect(JSON.stringify(s.status())).not.toContain('sk-ant');
  });

  // The cloud and the Mac are one machine here, so the cloud's Codex and the
  // Mac's listener cannot share a port: the Mac is shown one of its own, and
  // the "browser" comes back there with the code the stand-in takes.
  async function viaBrowser({ saved = (e) => e } = {}) {
    const free = net.createServer();
    await new Promise((r) => free.listen(0, '127.0.0.1', r));
    const macPort = free.address().port;
    await new Promise((r) => free.close(r));
    let state = null;
    const t = { ...transport, invoke: async (sid, p) => {
      const out = await sandbox.handle(p);
      for (const e of out.events || []) {
        if (e.kind === 'signin' && e.state === 'waiting' && e.url) {
          const u = new URL(e.url);
          state = u.searchParams.get('state');
          u.searchParams.set('redirect_uri', `http://127.0.0.1:${macPort}/auth/callback`);
          e.url = u.toString();
        }
        if (e.kind === 'signin' && e.state === 'saved') saved(e);
      }
      return out;
    } };
    const signIn = async (s) => {
      await until(() => s.status().state === 'waiting' && state, 'the link');
      await fetch(`http://127.0.0.1:${macPort}/auth/callback?code=good-code&state=${state}`, { signal: AbortSignal.timeout(10_000) });
    };
    return { transport: t, signIn };
  }

  it('signs Codex in through the browser, and refuses a sign-in with another ChatGPT account', async () => {
    makeSandbox();
    const one = await viaBrowser();
    const s = startCloudSignIn({ transport: one.transport, storage, engine: 'codex', dir: '/Users/x/.codex', home, pollWaitMs: 50 });
    await one.signIn(s);
    const end = await s.done;
    expect(end.state).toBe('saved');
    expect(cloudLoginFor('codex', '/Users/x/.codex', { home }).expiresAt).toBeGreaterThan(Date.now() + 200 * H);

    // Another account: the sandbox reports an email that is not this folder's.
    // The stand-in's id token carries no email, so make it say one.
    await sandbox.close();
    makeSandbox();
    const lying = await viaBrowser({ saved: (e) => { e.email = 'someone-else@example.com'; } });
    const other = startCloudSignIn({ transport: lying.transport, storage, engine: 'codex', dir: '/Users/y/.codex', home, expectEmail: 'me@example.com', pollWaitMs: 50 });
    await lying.signIn(other);
    const refused = await other.done;
    expect(refused.state).toBe('failed');
    expect(refused.message).toMatch(/someone-else@example\.com.*me@example\.com/);
    expect(cloudLoginFor('codex', '/Users/y/.codex', { home })).toBe(null);
  });

  it('says why when the cloud refuses, and records nothing', async () => {
    makeSandbox();
    const s = startCloudSignIn({ transport, storage, engine: 'claude', dir: '/Users/x/.claude', home, pollWaitMs: 50 });
    await until(() => s.status().state === 'needs-code', 'the link');
    await s.code('wrong');
    const end = await s.done;
    expect(end.state).toBe('failed');
    expect(end.message).toMatch(/didn’t accept that code/);
    expect(cloudLoginFor('claude', '/Users/x/.claude', { home })).toBe(null);
  });
});

describe('renewing a Codex login', () => {
  const seed = (hoursLeft) => {
    const exp = Math.floor((Date.now() + hoursLeft * H) / 1000);
    objects.set(loginObjectKey('codex', 'C1'), Buffer.from(JSON.stringify({ engine: 'codex', auth: { tokens: { access_token: jwt(exp), refresh_token: 'rt-real-refresh-token-0001' }, last_refresh: new Date().toISOString() } })));
    recordCloudLogin('codex', '/Users/x/.codex', { id: 'C1', expiresAt: exp * 1000, email: 'me@example.com' }, { home });
  };

  it('renews it into a new object and makes that the current one', async () => {
    makeSandbox();
    seed(30);
    expect(await renewCloudCodexLogin({ transport, storage, dir: '/Users/x/.codex', home, pollWaitMs: 50 })).toBe('renewed');
    const rec = cloudLoginFor('codex', '/Users/x/.codex', { home });
    expect(rec.id).not.toBe('C1');
    expect(cloudLoginState(rec)).toBe('ready');
    expect(rec.email).toBe('me@example.com');
    expect(rec.retired.map((r) => r.id)).toEqual(['C1']);
    expect(reads.some((k) => k.startsWith('logins/'))).toBe(false);
  });

  it('starts no second renewal while one is under way, even after a restart', async () => {
    makeSandbox();
    seed(30);
    markCloudLogin('codex', '/Users/x/.codex', 'C1', { renewing: Date.now() - 60_000 }, { home });
    expect(await renewCloudCodexLogin({ transport, storage, dir: '/Users/x/.codex', home })).toBe('busy');
    // One that started long ago and never said how it ended is over.
    markCloudLogin('codex', '/Users/x/.codex', 'C1', { renewing: Date.now() - 30 * 60_000 }, { home });
    expect(await renewCloudCodexLogin({ transport, storage, dir: '/Users/x/.codex', home, pollWaitMs: 50 })).toBe('renewed');
  });

  it('marks the login as needing a new sign-in when Codex cannot renew it', async () => {
    makeSandbox('codex-cannot-renew');
    seed(-1);
    expect(await renewCloudCodexLogin({ transport, storage, dir: '/Users/x/.codex', home, pollWaitMs: 50 })).toBe('signed-out');
    expect(cloudLoginState(cloudLoginFor('codex', '/Users/x/.codex', { home }))).toBe('broken');
  });
});

// Codex's review of the code, 2026-10-14.
describe('what the review found', () => {
  it('writes the note under a lock, and takes over one a dead process left (finding 2)', () => {
    recordCloudLogin('claude', '/a', { id: 'new' }, { home });
    const lock = path.join(home, '.agentbox', 'cloud-logins.json.lock');
    expect(fs.existsSync(lock)).toBe(false);
    fs.writeFileSync(lock, '');
    const old = (Date.now() - 60_000) / 1000;
    fs.utimesSync(lock, old, old);
    expect(markCloudLogin('claude', '/a', 'new', { broken: 'refused' }, { home })).toBe(true);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('adopts a renewal that finished while the app was away, instead of spending the old refresh token (finding 3)', async () => {
    recordCloudLogin('codex', '/c', { id: 'C1', expiresAt: Date.now() + 10 * H, email: 'me@example.com' }, { home });
    markCloudLogin('codex', '/c', 'C1', { renewing: { at: Date.now() - 30 * 60_000, id: 'C2' } }, { home });
    objects.set(loginObjectKey('codex', 'C2'), Buffer.from('{}'));
    const started = [];
    const watching = { invoke: async (sid, p) => { started.push(p.action); return { ok: true }; }, stop: async () => {} };
    const storeWithExists = { ...storage, exists: async (k) => objects.has(k) };
    expect(await renewCloudCodexLogin({ transport: watching, storage: storeWithExists, dir: '/c', home })).toBe('renewed');
    expect(started).toEqual([]);
    expect(cloudLoginFor('codex', '/c', { home })).toMatchObject({ id: 'C2', email: 'me@example.com', renewing: null });
    expect(cloudLoginState(cloudLoginFor('codex', '/c', { home }))).toBe('ready');
  });

  it('starts nothing when she cancels before the cloud answered (finding 6)', async () => {
    const asked = [];
    let release;
    const slowStorage = { ...storage, putUrl: () => new Promise((r) => { release = () => r(`${s3Url}/x`); }) };
    const watching = { invoke: async (sid, p) => { asked.push(p.action); return { ok: true, events: [] }; }, stop: async () => {} };
    const s = startCloudSignIn({ transport: watching, storage: slowStorage, engine: 'claude', dir: '/x', home, pollWaitMs: 10 });
    await s.cancel();
    release();
    await s.done;
    expect(asked).not.toContain('signin');
    expect(cloudLoginFor('claude', '/x', { home })).toBe(null);
  });

  it('lets her paste the code again when it never reached the sign-in (finding 7)', async () => {
    makeSandbox();
    const flaky = { ...transport, invoke: async (sid, p) => { if (p.action === 'signin-code') throw new Error('network'); return sandbox.handle(p); } };
    const s = startCloudSignIn({ transport: flaky, storage, engine: 'claude', dir: '/x', home, pollWaitMs: 50 });
    await until(() => s.status().state === 'needs-code', 'the link');
    expect(await s.code('good#code')).toBe(false);
    expect(s.status()).toMatchObject({ state: 'needs-code', message: expect.stringMatching(/Paste it again/) });
    await s.cancel();
    await s.done;
  });

  it('hears a login failure from an earlier run it brings home, so no account here is struck for it (finding 4)', async () => {
    makeSandbox();
    const mac = path.join(tmp, 'mac', 'repo2');
    fs.mkdirSync(mac, { recursive: true });
    git(mac, 'init', '-q', '-b', 'main');
    git(mac, 'config', 'user.email', 'dev@example.com');
    git(mac, 'config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
    git(mac, 'add', '.');
    git(mac, 'commit', '-q', '-m', 'first');
    git(mac, 'checkout', '-q', '-b', 'agentbox/w-2');
    const { writeMarker } = await import('../main/cloud/marker.mjs');
    writeMarker(mac, { runId: 'r-earlier', sessionId: 'agentbox-w-2-r-earlier-xxxxxxxxxxxxxxxx', branch: 'agentbox/w-2', startSha: git(mac, 'rev-parse', 'HEAD'), pid: null, state: 'running', engine: 'claude', bringDirs: [] });
    objects.set('runs/r-earlier/done.json', Buffer.from(JSON.stringify({ ok: true, commits: 0, uncommitted: false, brought: [], exitCode: 1 })));
    objects.set('runs/r-earlier/events.jsonl', Buffer.from(`${JSON.stringify({ seq: 1, kind: 'login', state: 'refused', engine: 'claude', id: 'L-old' })}\n`));
    const trouble = [];
    const stdin = new PassThrough(); stdin.end();
    const code = await cloudRun({ importOnly: true, argv: [], env: process.env, cwd: mac, transport, storage, onLoginTrouble: (t) => trouble.push(t), stdin, stdout: new PassThrough(), stderr: new PassThrough(), watchParent: false, homeDir: home, resultsWaitMs: 2000 });
    expect(code).toBe(0);
    expect(trouble).toEqual([{ state: 'refused', id: 'L-old' }]);
  });
});

// A Claude run carries the Codex login too, so the agent can ask Codex in the
// cloud as it can on the Mac (2026-10-23); by name, like its own.
describe('the Codex login a Claude run carries', () => {
  it('goes by its link, and the Mac never reads it', async () => {
    makeSandbox();
    const mac = path.join(tmp, 'mac', 'repo');
    fs.mkdirSync(mac, { recursive: true });
    git(mac, 'init', '-q', '-b', 'main');
    git(mac, 'config', 'user.email', 'dev@example.com');
    git(mac, 'config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
    git(mac, 'add', '.');
    git(mac, 'commit', '-q', '-m', 'first');
    git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
    objects.set(loginObjectKey('codex', 'C9'), Buffer.from('{}'));
    const sent = [];
    const stdin = new PassThrough(); stdin.end();
    await cloudRun({
      argv: ['-p'], env: { ...process.env, ZERO_ITEM: 'w-1', CLAUDE_CONFIG_DIR: path.join(tmp, 'mac', 'claude-home') },
      cwd: mac, storage,
      transport: { ...transport, invoke: (sid, p) => { sent.push(p); return sandbox.handle(p); } },
      login: { engine: 'claude', id: 'gone', key: loginObjectKey('claude', 'gone') },
      also: [{ engine: 'codex', id: 'C9', key: loginObjectKey('codex', 'C9') }],
      stdin, stdout: new PassThrough(), stderr: new PassThrough(), remoteCommand: path.join(bin, 'claude'),
      pollWaitMs: 50, resultsWaitMs: 5000, watchParent: false, homeDir: home,
    });
    const start = sent.find((p) => p.action === 'start');
    expect(start.also).toEqual([{ engine: 'codex', id: 'C9', url: await storage.getUrl(loginObjectKey('codex', 'C9')) }]);
    expect(reads.some((k) => k.startsWith('logins/'))).toBe(false);
  });

  const carried = (engine, opts = {}) => loginsCarriedBy(engine, { home, ...opts });
  const C = (id) => [{ engine: 'codex', id, key: loginObjectKey('codex', id) }];

  it('is carried by a Claude run only, and only when there is a Codex login', () => {
    expect(carried('claude')).toEqual([]);
    recordCloudLogin('codex', 'mine', { id: 'C1', expiresAt: Date.now() + 200 * H }, { home });
    expect(carried('claude')).toEqual(C('C1'));
    expect(carried('codex')).toEqual([]);
  });

  // The one Codex account a Codex run would use (w-dac993a554): not while it
  // waits on a renewal, and never a second account in its place.
  it('is the account a Codex run would use, once it can run', () => {
    recordCloudLogin('codex', 'mine', { id: 'C-old', savedAt: 1_000, expiresAt: Date.now() + 2 * H }, { home });
    recordCloudLogin('codex', 'other', { id: 'C-other', savedAt: 2_000, expiresAt: Date.now() + 200 * H }, { home });
    expect(carried('claude')).toEqual([]);
    recordCloudLogin('codex', 'mine', { id: 'C-new', savedAt: 1_000, expiresAt: Date.now() + 200 * H }, { home });
    expect(carried('claude')).toEqual(C('C-new'));
  });

  it('keeps to the accounts a run is limited to', () => {
    recordCloudLogin('codex', 'mine', { id: 'C1', savedAt: 1_000, expiresAt: Date.now() + 200 * H }, { home });
    recordCloudLogin('codex', 'test', { id: 'C2', savedAt: 2_000, expiresAt: Date.now() + 200 * H }, { home });
    expect(carried('claude', { only: ['test'] })).toEqual(C('C2'));
    expect(carried('claude', { only: ['nobody'] })).toEqual([]);
  });
});

describe('a run whose cloud sign-in is gone', () => {
  it('starts nothing, names the login, and exits with its own code', async () => {
    makeSandbox();
    const mac = path.join(tmp, 'mac', 'repo');
    fs.mkdirSync(mac, { recursive: true });
    git(mac, 'init', '-q', '-b', 'main');
    git(mac, 'config', 'user.email', 'dev@example.com');
    git(mac, 'config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
    git(mac, 'add', '.');
    git(mac, 'commit', '-q', '-m', 'first');
    git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
    const stdin = new PassThrough(); stdin.end();
    const trouble = [];
    const code = await cloudRun({
      argv: ['-p'], env: { ...process.env, ZERO_ITEM: 'w-1', CLAUDE_CONFIG_DIR: path.join(tmp, 'mac', 'claude-home') },
      cwd: mac, transport, storage, login: { engine: 'claude', id: 'gone', key: loginObjectKey('claude', 'gone') },
      onLoginTrouble: (t) => trouble.push(t),
      stdin, stdout: new PassThrough(), stderr: new PassThrough(), remoteCommand: path.join(bin, 'claude'),
      pollWaitMs: 50, resultsWaitMs: 5000, watchParent: false, homeDir: home,
    });
    expect(code).toBe(LOGIN_TROUBLE);
    expect(trouble).toEqual([{ state: 'missing', id: 'gone' }]);
  });

  it('starts nothing for an account that never signed in for the cloud', async () => {
    makeSandbox();
    const stdin = new PassThrough(); stdin.end();
    const code = await cloudRun({ argv: [], env: process.env, cwd: tmp, transport, storage, login: null, stdin, stdout: new PassThrough(), stderr: new PassThrough(), watchParent: false, homeDir: home });
    expect(code).toBe(LOGIN_TROUBLE);
  });
});

describe('the first build\'s own tokens', () => {
  it('are deleted from the keychain and the file, and nothing else is touched', () => {
    fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
    fs.writeFileSync(path.join(home, '.agentbox', 'cloud-tokens.json'), '{"/a":"x"}');
    recordCloudLogin('claude', '/a', { id: 'keep' }, { home });
    const calls = [];
    let left = 2;
    forgetOldCloudTokens({ home, platform: 'darwin', service: 'Agentbox cloud: Claude sign-in', exec: (cmd, args) => { calls.push([cmd, ...args]); if (left-- <= 0) throw new Error('none left'); } });
    expect(fs.existsSync(path.join(home, '.agentbox', 'cloud-tokens.json'))).toBe(false);
    expect(calls.every((c) => c.join(' ') === 'security delete-generic-password -s Agentbox cloud: Claude sign-in')).toBe(true);
    expect(calls.length).toBe(3);
    expect(readCloudLogins({ home })['claude:/a'].id).toBe('keep');
  });
});
