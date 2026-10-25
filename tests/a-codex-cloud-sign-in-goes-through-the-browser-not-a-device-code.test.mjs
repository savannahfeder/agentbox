// A CODEX ACCOUNT IS ADDED TO THE CLOUD THROUGH CODEX'S BROWSER SIGN-IN, NOT A
// DEVICE CODE.
//
// What broke (2026-10-21): adding a Codex account to the cloud ran
// `codex login --device-auth`, and ChatGPT answered the code with "Enable
// device code sign-in for Codex ... in ChatGPT Security Settings". That
// setting is off unless someone turns it on, and a workspace admin can keep it
// off, so the sign-in could not finish.
//
// So a Mac that knows how asks the cloud for Codex's ordinary sign-in
// (`flow: 'browser'`). Measured on Codex 0.163.0: `codex login` with no
// browser prints an OpenAI link whose way back is
// http://127.0.0.1:1455/auth/callback and serves that address itself; a GET
// with the right state spends the code (PKCE: only that process can), answers
// 302 to /success with the id token in the link, and exits 0 once /success is
// fetched. The Mac listens on that address while she signs in, and passes the
// query, and only the query, to the cloud, which hands it to Codex there and
// follows the redirect itself. Driven against the real sandbox server with a
// stand-in for `codex` (tests/fixtures/cloud/fake-vendor-cli).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSandbox, pickBaseEnv } from '../cloud/sandbox/server.mjs';
import { startCloudSignIn, cloudLoginFor } from '../main/cloud/logins.mjs';

const FAKE = fileURLToPath(new URL('./fixtures/cloud/fake-vendor-cli.mjs', import.meta.url));

let tmp; let home; let files; let fileServer; let base; let sandbox; let bin; let held;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-browser-')));
  home = path.join(tmp, 'home');
  files = new Map();
  held = [];
  fileServer = http.createServer((req, res) => {
    if (req.method === 'GET') { const b = files.get(req.url); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { files.set(req.url, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => fileServer.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${fileServer.address().port}`;
  bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${name} "$@"\n`, { mode: 0o755 });
});

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  for (const s of held) await new Promise((r) => s.close(r));
  fileServer.closeAllConnections();
  await new Promise((r) => fileServer.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeSandbox(mode = '') {
  sandbox = createSandbox({
    workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock'),
    baseEnv: { ...pickBaseEnv(process.env), PATH: `${bin}:${process.env.PATH}`, ...(mode ? { FAKE_VENDOR_MODE: mode } : {}) },
    terminal: (line) => ['sh', '-c', line], whoIs: async () => null, uploadRetryMs: 10,
  });
}

const until = async (fn, what, ms = 15_000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 20)); }
};
const allEvents = async () => (await sandbox.handle({ action: 'events', since: 0, maxBytes: 8 * 1024 * 1024 })).events;
const signins = async () => (await allEvents()).filter((e) => e.kind === 'signin');
const ended = async () => { const s = (await signins()).at(-1); return ['saved', 'failed'].includes(s?.state) && s; };
const stateIn = (url) => new URL(url).searchParams.get('state');
const freePort = async () => {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
};
const listening = (port) => new Promise((res) => {
  const c = net.connect(port, '127.0.0.1');
  c.on('connect', () => { c.destroy(); res(true); });
  c.on('error', () => res(false));
});
const browser = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  return { status: res.status, text: await res.text() };
};
const authorizeUrl = (port, state = 'S1') => `https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}/auth/callback`)}&state=${state}`;

describe('the cloud\'s side', () => {
  it('runs Codex\'s own browser sign-in and hands the browser\'s return to it, telling the Mac nothing of the login', async () => {
    makeSandbox();
    expect((await sandbox.handle({ action: 'signin', runId: 'cb-1', engine: 'codex', flow: 'browser', saveUrl: `${base}/login-codex` })).ok).toBe(true);
    const waiting = await until(async () => (await signins()).find((e) => e.state === 'waiting'), 'the link');
    expect(waiting.url).toMatch(/^https:\/\/auth\.openai\.com\/oauth\/authorize\?/);
    expect(waiting.code ?? null).toBe(null);
    const answer = await sandbox.handle({ action: 'signin-callback', runId: 'cb-1', query: `code=good-code&state=${stateIn(waiting.url)}` });
    expect(answer).toEqual({ ok: true });
    const end = await until(ended, 'the end');
    expect(end.state, end.message).toBe('saved');
    expect(end.expiresAt).toBeGreaterThan(Date.now() + 200 * 3600_000);
    const kept = JSON.parse(files.get('/login-codex'));
    expect(kept).toMatchObject({ engine: 'codex', auth: { tokens: { refresh_token: 'rt-real-refresh-token-0001' } } });
    // The success link carries the id token: followed in the cloud, never repeated.
    const said = JSON.stringify(await allEvents());
    expect(said).not.toContain('rt-real-refresh');
    expect(said).not.toContain(kept.auth.tokens.id_token);
    expect(said).not.toContain('/success');
  });

  it('still signs in by device code for a Mac that does not ask for the browser', async () => {
    makeSandbox();
    await sandbox.handle({ action: 'signin', runId: 'cb-2', engine: 'codex', saveUrl: `${base}/login-codex` });
    const waiting = await until(async () => (await signins()).find((e) => e.state === 'waiting'), 'the code');
    expect(waiting).toMatchObject({ url: 'https://auth.openai.com/codex/device', code: 'WY6D-YCCOE' });
    expect(await sandbox.handle({ action: 'signin-callback', runId: 'cb-2', query: 'code=good-code&state=x' })).toMatchObject({ ok: false });
  });

  it('refuses a return from another sign-in and keeps waiting for this one', async () => {
    makeSandbox();
    await sandbox.handle({ action: 'signin', runId: 'cb-3', engine: 'codex', flow: 'browser', saveUrl: `${base}/login-codex` });
    const waiting = await until(async () => (await signins()).find((e) => e.state === 'waiting'), 'the link');
    expect(await sandbox.handle({ action: 'signin-callback', runId: 'cb-3', query: 'code=good-code&state=someone-elses' })).toMatchObject({ ok: false, error: 'wrong-sign-in' });
    expect(await ended()).toBe(false);
    expect(await sandbox.handle({ action: 'signin-callback', runId: 'cb-3', query: `code=good-code&state=${stateIn(waiting.url)}` })).toEqual({ ok: true });
    expect((await until(ended, 'the end')).state).toBe('saved');
  });

  it('ends the sign-in, keeps nothing, and says so when OpenAI refuses the code', async () => {
    makeSandbox();
    await sandbox.handle({ action: 'signin', runId: 'cb-4', engine: 'codex', flow: 'browser', saveUrl: `${base}/login-codex` });
    const waiting = await until(async () => (await signins()).find((e) => e.state === 'waiting'), 'the link');
    expect(await sandbox.handle({ action: 'signin-callback', runId: 'cb-4', query: `code=stale&state=${stateIn(waiting.url)}` })).toMatchObject({ ok: false });
    const end = await until(ended, 'the end');
    expect(end.state).toBe('failed');
    expect(end.message).toMatch(/OpenAI didn’t accept that sign-in/);
    expect(files.has('/login-codex')).toBe(false);
  });

  it('takes a return only for a browser sign-in, and only as a query', async () => {
    makeSandbox();
    expect(await sandbox.handle({ action: 'signin', runId: 'cb-5', engine: 'claude', flow: 'browser', saveUrl: `${base}/x` })).toMatchObject({ ok: false, error: 'bad-start' });
    expect(await sandbox.handle({ action: 'signin', runId: 'cb-5', engine: 'codex', flow: 'phone', saveUrl: `${base}/x` })).toMatchObject({ ok: false, error: 'bad-start' });
    await sandbox.handle({ action: 'signin', runId: 'cb-6', engine: 'claude', saveUrl: `${base}/x` });
    expect(await sandbox.handle({ action: 'signin-callback', runId: 'cb-6', query: 'code=a&state=b' })).toMatchObject({ ok: false });
    await sandbox.handle({ action: 'signal', runId: 'cb-6', signal: 'SIGTERM' });
    await until(ended, 'the cancel');

    await sandbox.close();
    makeSandbox();
    await sandbox.handle({ action: 'signin', runId: 'cb-7', engine: 'codex', flow: 'browser', saveUrl: `${base}/login-codex` });
    await until(async () => (await signins()).find((e) => e.state === 'waiting'), 'the link');
    for (const query of ['', 'code=a#frag', 'code=a\r\nHost: x', 'code=a b', `code=${'a'.repeat(9000)}`]) {
      expect(await sandbox.handle({ action: 'signin-callback', runId: 'cb-7', query }), JSON.stringify(query.slice(0, 20))).toMatchObject({ ok: false, error: 'bad-callback' });
    }
    expect(await ended()).toBe(false);
  });
});

// A stand-in for the cloud on the Mac's side: says what a test tells it to,
// and writes down what it was asked.
function scripted() {
  const sent = [];
  const events = [];
  let answer = async () => ({ ok: true });
  const say = (e) => events.push({ kind: 'signin', ...e, seq: events.length + 1 });
  const transport = {
    async invoke(_sid, p) {
      sent.push(p);
      if (p.action === 'signin') return { ok: true, seq: 0 };
      if (p.action === 'events') { await new Promise((r) => setTimeout(r, 10)); return { ok: true, events: events.filter((e) => e.seq > p.since) }; }
      if (p.action === 'signin-callback') return answer(p);
      if (p.action === 'signal') { say({ state: 'failed', message: 'The sign-in was cancelled.' }); return { ok: true }; }
      return { ok: false };
    },
    async stop() {},
  };
  return { transport, sent, say, answerWith: (fn) => { answer = fn; } };
}
const storage = {
  async putUrl(k) { return `${base}/${encodeURIComponent(k)}`; },
  async getUrl(k) { return `${base}/${encodeURIComponent(k)}`; },
  async del() {},
};

describe('this computer\'s side', () => {
  it('asks the cloud for the browser sign-in, takes the way back here, and passes on its query alone', async () => {
    const port = await freePort();
    const cloud = scripted();
    const s = startCloudSignIn({ transport: cloud.transport, storage, engine: 'codex', dir: 'acct-a1', home, pollWaitMs: 10 });
    await until(() => cloud.sent.find((p) => p.action === 'signin'), 'the start');
    expect(cloud.sent[0]).toMatchObject({ action: 'signin', engine: 'codex', flow: 'browser' });
    cloud.say({ state: 'waiting', url: authorizeUrl(port), code: null });
    await until(() => s.status().state === 'waiting', 'the link');
    expect(s.status()).toMatchObject({ url: authorizeUrl(port), code: null });
    // Listening before the page is shown, so the way back is there first.
    expect(await listening(port)).toBe(true);
    // Only the way back: not a local `codex login` asking it to stop.
    expect((await browser(`http://127.0.0.1:${port}/cancel`)).status).toBe(404);
    expect((await browser(`http://127.0.0.1:${port}/favicon.ico`)).status).toBe(404);

    cloud.answerWith(async () => { setTimeout(() => cloud.say({ state: 'saved', expiresAt: Date.now() + 240 * 3600_000, email: null }), 30); return { ok: true }; });
    const page = await browser(`http://127.0.0.1:${port}/auth/callback?code=c-1&state=S1`);
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/Signed in to Codex/);
    expect(cloud.sent.filter((p) => p.action === 'signin-callback')).toEqual([{ action: 'signin-callback', runId: cloud.sent[0].runId, query: 'code=c-1&state=S1' }]);
    const end = await s.done;
    expect(end.state, end.message).toBe('saved');
    expect(cloudLoginFor('codex', 'acct-a1', { home })).toMatchObject({ engine: 'codex' });
    expect(await listening(port)).toBe(false);
  });

  it('lets the port go once the cloud has the way back, so another Codex account can be added while this one is checked', async () => {
    const port = await freePort();
    const cloud = scripted();
    const s = startCloudSignIn({ transport: cloud.transport, storage, engine: 'codex', dir: 'acct-a6', home, pollWaitMs: 10 });
    await until(() => cloud.sent.find((p) => p.action === 'signin'), 'the start');
    cloud.say({ state: 'waiting', url: authorizeUrl(port), code: null });
    await until(() => s.status().state === 'waiting', 'the link');
    expect((await browser(`http://127.0.0.1:${port}/auth/callback?code=c-1&state=S1`)).text).toMatch(/Signed in to Codex/);
    expect(s.status().state).toBe('checking');
    expect(await listening(port)).toBe(false);

    const next = scripted();
    const another = startCloudSignIn({ transport: next.transport, storage, engine: 'codex', dir: 'acct-a7', home, pollWaitMs: 10 });
    await until(() => next.sent.find((p) => p.action === 'signin'), 'the start');
    next.say({ state: 'waiting', url: authorizeUrl(port), code: null });
    await until(() => another.status().state === 'waiting', 'the second link');
    await Promise.all([s.cancel(), another.cancel()]);
    await Promise.all([s.done, another.done]);
  });

  it('asks for no browser sign-in for Claude', async () => {
    const cloud = scripted();
    const s = startCloudSignIn({ transport: cloud.transport, storage, engine: 'claude', dir: 'acct-c1', home, pollWaitMs: 10 });
    await until(() => cloud.sent.find((p) => p.action === 'signin'), 'the start');
    expect(cloud.sent[0].flow).toBeUndefined();
    await s.cancel();
    await s.done;
  });

  it('keeps waiting, and tells the browser, when the cloud did not take the way back', async () => {
    const port = await freePort();
    const cloud = scripted();
    const s = startCloudSignIn({ transport: cloud.transport, storage, engine: 'codex', dir: 'acct-a2', home, pollWaitMs: 10 });
    await until(() => cloud.sent.find((p) => p.action === 'signin'), 'the start');
    cloud.say({ state: 'waiting', url: authorizeUrl(port), code: null });
    await until(() => s.status().state === 'waiting', 'the link');
    cloud.answerWith(async () => ({ ok: false, error: 'wrong-sign-in' }));
    const page = await browser(`http://127.0.0.1:${port}/auth/callback?code=c-1&state=old`);
    expect(page.text).toMatch(/didn’t finish/);
    expect(s.status().state).toBe('waiting');
    expect(await listening(port)).toBe(true);
    await s.cancel();
    await s.done;
    expect(await listening(port)).toBe(false);
  });

  it('lets the port go when the cloud gives up on the sign-in', async () => {
    const port = await freePort();
    const cloud = scripted();
    const s = startCloudSignIn({ transport: cloud.transport, storage, engine: 'codex', dir: 'acct-a3', home, pollWaitMs: 10 });
    await until(() => cloud.sent.find((p) => p.action === 'signin'), 'the start');
    cloud.say({ state: 'waiting', url: authorizeUrl(port), code: null });
    await until(() => s.status().state === 'waiting', 'the link');
    cloud.say({ state: 'failed', message: 'The sign-in timed out. Try again.' });
    expect((await s.done).state).toBe('failed');
    expect(await listening(port)).toBe(false);
  });

  it('shows the code and opens no port for a cloud that still signs in by device code', async () => {
    const cloud = scripted();
    const s = startCloudSignIn({ transport: cloud.transport, storage, engine: 'codex', dir: 'acct-a4', home, pollWaitMs: 10 });
    await until(() => cloud.sent.find((p) => p.action === 'signin'), 'the start');
    cloud.say({ state: 'waiting', url: 'https://auth.openai.com/codex/device', code: 'WY6D-YCCOE' });
    await until(() => s.status().state === 'waiting', 'the code');
    expect(s.status()).toMatchObject({ url: 'https://auth.openai.com/codex/device', code: 'WY6D-YCCOE' });
    await s.cancel();
    await s.done;
  });

  it('says so, and stops the cloud\'s side, when something on this computer holds the port', async () => {
    const port = await freePort();
    const other = net.createServer();
    await new Promise((r) => other.listen(port, '127.0.0.1', r));
    held.push(other);
    const cloud = scripted();
    const s = startCloudSignIn({ transport: cloud.transport, storage, engine: 'codex', dir: 'acct-a5', home, pollWaitMs: 10 });
    await until(() => cloud.sent.find((p) => p.action === 'signin'), 'the start');
    cloud.say({ state: 'waiting', url: authorizeUrl(port), code: null });
    const end = await s.done;
    expect(end.state).toBe('failed');
    expect(end.message).toMatch(/Another Codex sign-in is open on this computer/);
    expect(cloud.sent.some((p) => p.action === 'signal')).toBe(true);
  });
});

describe('the whole way round', () => {
  it('adds the account once she signs in on OpenAI\'s page, with the login never on this computer', async () => {
    makeSandbox();
    // The cloud and this computer are one machine here, so the cloud's Codex
    // and the Mac's listener cannot share a port: the Mac is shown another.
    const macPort = await freePort();
    let cloudLink = null;
    const transport = {
      async invoke(_sid, p) {
        const out = await sandbox.handle(p);
        for (const e of out.events || []) {
          if (e.kind === 'signin' && e.state === 'waiting' && e.url) {
            cloudLink = e.url;
            const u = new URL(e.url);
            u.searchParams.set('redirect_uri', `http://127.0.0.1:${macPort}/auth/callback`);
            e.url = u.toString();
          }
        }
        return out;
      },
      async stop() {},
    };
    const reads = [];
    const watched = { ...storage, async get(k) { reads.push(k); return null; } };
    const s = startCloudSignIn({ transport, storage: watched, engine: 'codex', dir: 'acct-w1', home, pollWaitMs: 50 });
    await until(() => s.status().state === 'waiting', 'the link');
    const page = await browser(`http://127.0.0.1:${macPort}/auth/callback?code=good-code&state=${stateIn(cloudLink)}`);
    expect(page.text).toMatch(/Signed in to Codex/);
    const end = await s.done;
    expect(end.state, end.message).toBe('saved');
    const rec = cloudLoginFor('codex', 'acct-w1', { home });
    expect(rec.expiresAt).toBeGreaterThan(Date.now() + 200 * 3600_000);
    expect(files.has(`/${encodeURIComponent(`logins/codex/${rec.id}.json`)}`)).toBe(true);
    expect(reads).toEqual([]);
    expect(JSON.stringify(s.status())).not.toMatch(/rt-real|e30\./);
    expect(await listening(macPort)).toBe(false);
  });
});
