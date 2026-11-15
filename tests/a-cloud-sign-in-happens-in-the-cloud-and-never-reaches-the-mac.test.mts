// A CLOUD SIGN-IN HAPPENS IN THE CLOUD, AND THE LOGIN NEVER REACHES THE MAC.
//
// What broke: the first cloud build copied the Mac's own Claude and Codex
// logins up to AWS, a token from the macOS keychain and a copy of
// ~/.codex/auth.json. Anthropic's terms forbid a developer to "collect,
// store, or intermediate Claude.ai credentials or session tokens"; they allow
// a platform to host Claude Code with each person signing in themselves. On
// 2026-10-14 the founder chose: one sign-in per account, done in the cloud
// through each vendor's own sign-in, kept between runs (docs/cloud/PLAN.md,
// "Sign-ins live in the cloud").
//
// So the sandbox runs `claude setup-token` and `codex login --device-auth`
// itself, tells the Mac only the link to open and the code to type, keeps
// the login by its own upload link, and puts it under a run's command
// without ever printing it. Driven against the real sandbox server with
// stand-ins for both vendors' commands (tests/fixtures/cloud/fake-vendor-cli).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox, pickBaseEnv, CODEX_REFRESH_PLACEHOLDER, REDACTED } from '../cloud/sandbox/server.mjs';
import { TOKEN } from './fixtures/cloud/fake-vendor-cli.mjs';

const FAKE = fileURLToPath(new URL('./fixtures/cloud/fake-vendor-cli.mjs', import.meta.url));
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const jwt = (exp, extra = {}) => ['e30', Buffer.from(JSON.stringify({ exp, ...extra })).toString('base64url'), 'sig'].join('.');

let tmp; let files; let fileServer; let base; let sandbox; let bin;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-signin-')));
  files = new Map();
  fileServer = http.createServer((req, res) => {
    if (req.method === 'GET') {
      const body = files.get(req.url);
      if (!body) { res.writeHead(404); return res.end(); }
      res.writeHead(200); return res.end(body);
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { files.set(req.url, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => fileServer.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${fileServer.address().port}`;
  // `claude` and `codex` on the sandbox's PATH are the stand-in.
  bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['claude', 'codex']) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${name} "$@"\n`, { mode: 0o755 });
  }
});

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  fileServer.closeAllConnections();
  await new Promise((r) => fileServer.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeSandbox({ mode = '', signinMs, codeAnswerMs, log, whoIs = async () => null } = {}) {
  sandbox = createSandbox({
    workRoot: path.join(tmp, 'vm-work'),
    pathRoot: path.join(tmp, 'vm'),
    bridgeSocket: path.join(tmp, 'bridge.sock'),
    baseEnv: { ...pickBaseEnv(process.env), PATH: `${bin}:${process.env.PATH}`, ...(mode ? { FAKE_VENDOR_MODE: mode } : {}) },
    terminal: (line) => ['sh', '-c', line], whoIs,
    ...(codeAnswerMs ? { codeAnswerMs } : {}),
    ...(log ? { log } : {}),
    uploadRetryMs: 10,
    ...(signinMs ? { signinMs } : {}),
  });
  return sandbox;
}

async function until(fn, what, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const allEvents = async () => (await sandbox.handle({ action: 'events', since: 0, maxBytes: 8 * 1024 * 1024 })).events;
const signinStates = async () => (await allEvents()).filter((e) => e.kind === 'signin');
const lastSignin = async () => (await signinStates()).at(-1);
const stdoutOf = (events) => events.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString('utf8')).join('');

describe('signing in to Claude in the cloud', () => {
  it('sends the Mac the sign-in link, takes the pasted code, and keeps the token by its own link only', async () => {
    makeSandbox();
    expect((await sandbox.handle({ action: 'signin', runId: 'si-1', engine: 'claude', saveUrl: `${base}/login-claude` })).ok).toBe(true);
    expect(sandbox.ping().status).toBe('HealthyBusy');
    const asks = await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    expect(asks.url).toBe('https://claude.com/cai/oauth/authorize?code=true&client_id=x&response_type=code&state=s');
    expect((await sandbox.handle({ action: 'signin-code', runId: 'si-1', code: '  good#code \n' })).ok).toBe(true);
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end.state, end.message).toBe('saved');
    expect(JSON.parse(files.get('/login-claude'))).toMatchObject({ engine: 'claude', token: TOKEN });
    // Nothing the Mac can read carries it: not an event, not the log.
    expect(JSON.stringify(await allEvents())).not.toContain('sk-ant-oat');
    expect(sandbox.ping().status).toBe('Healthy');
  });

  it('names the Claude account when Anthropic says which it is, and keeps it all the same when it will not', async () => {
    makeSandbox({ whoIs: async (token) => (token === TOKEN ? 'work@example.com' : null) });
    await sandbox.handle({ action: 'signin', runId: 'si-w', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signin-code', runId: 'si-w', code: 'good#code' });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end).toMatchObject({ state: 'saved', email: 'work@example.com' });

    await sandbox.close();
    files.delete('/login-claude');
    makeSandbox({ whoIs: async () => { throw new Error('offline'); } });
    await sandbox.handle({ action: 'signin', runId: 'si-x', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signin-code', runId: 'si-x', code: 'good#code' });
    const quiet = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(quiet).toMatchObject({ state: 'saved', email: null });
    expect(files.has('/login-claude')).toBe(true);
  });

  it('keeps nothing when the code is wrong, and says so', async () => {
    makeSandbox();
    await sandbox.handle({ action: 'signin', runId: 'si-2', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signin-code', runId: 'si-2', code: 'wrong' });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end.state).toBe('failed');
    expect(end.message).toMatch(/didn’t accept that code/);
    expect(files.has('/login-claude')).toBe(false);
  });

  // 2026-10-15: she pasted a code and sat on "Adding…" for over a minute.
  // Claude prints its refusal and waits ("Press Enter to retry"), and the
  // sandbox never read it, so the sign-in ran on to its 20-minute limit.
  // Measured against the real cloud the same day: still checking at 150 s.
  it('says at once when Claude does not take the code, and stops waiting on it', async () => {
    makeSandbox({ signinMs: 60_000 });
    await sandbox.handle({ action: 'signin', runId: 'si-r', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    const t0 = Date.now();
    await sandbox.handle({ action: 'signin-code', runId: 'si-r', code: 'stale#code' });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end).toMatchObject({ state: 'failed', message: expect.stringMatching(/didn’t accept that code/) });
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('gives up on a sign-in that goes quiet after the code', async () => {
    makeSandbox({ mode: 'claude-silent', codeAnswerMs: 300 });
    await sandbox.handle({ action: 'signin', runId: 'si-q', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signin-code', runId: 'si-q', code: 'good#code' });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end).toMatchObject({ state: 'failed', message: expect.stringMatching(/didn’t answer/) });
    expect(files.has('/login-claude')).toBe(false);
  });

  // 2026-10-15: a sign-in Claude took sat on "Adding" and the runtime's log
  // said nothing of where. Each step is noted now, with no secret in it.
  it('notes each step for the runtime\'s log, and never the login', async () => {
    const lines = [];
    makeSandbox({ log: (l) => lines.push(l) });
    await sandbox.handle({ action: 'signin', runId: 'si-l', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signin-code', runId: 'si-l', code: 'good#code' });
    await until(async () => (await lastSignin())?.state === 'saved', 'saved');
    const text = lines.join('\n');
    expect(text).toMatch(/code sent/);
    expect(text).toMatch(/token seen/);
    expect(text).toMatch(/check answered/);
    expect(text).toMatch(/kept/);
    expect(text).not.toMatch(/sk-ant|good#code|Q{20}/);
  });

  it('takes a login printed with a box edge right after it', async () => {
    makeSandbox({ mode: 'claude-boxed' });
    await sandbox.handle({ action: 'signin', runId: 'si-b', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signin-code', runId: 'si-b', code: 'good#code' });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end.state, end.message).toBe('saved');
    expect(JSON.parse(files.get('/login-claude')).token).toBe(TOKEN);
  });

  it('does not cut off the check that follows a good code', async () => {
    makeSandbox({ mode: 'claude-slow-check', codeAnswerMs: 250 });
    await sandbox.handle({ action: 'signin', runId: 'si-g', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signin-code', runId: 'si-g', code: 'good#code' });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end.state, end.message).toBe('saved');
  });

  it('keeps nothing when the token does not answer', async () => {
    makeSandbox({ mode: 'claude-refuses' });
    await sandbox.handle({ action: 'signin', runId: 'si-3', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signin-code', runId: 'si-3', code: 'good#code' });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end.state).toBe('failed');
    expect(end.message).toMatch(/refused/);
    expect(files.has('/login-claude')).toBe(false);
  });

  it('ends a sign-in nobody finishes, and one that is cancelled', async () => {
    makeSandbox({ signinMs: 300 });
    await sandbox.handle({ action: 'signin', runId: 'si-4', engine: 'claude', saveUrl: `${base}/login-claude` });
    const timedOut = await until(async () => { const s = await lastSignin(); return s?.state === 'failed' && s; }, 'the timeout');
    expect(timedOut.message).toMatch(/timed out/);
    expect(sandbox.ping().status).toBe('Healthy');

    await sandbox.close();
    makeSandbox();
    await sandbox.handle({ action: 'signin', runId: 'si-5', engine: 'claude', saveUrl: `${base}/login-claude` });
    await until(async () => (await signinStates()).find((e) => e.state === 'needs-code'), 'the link');
    await sandbox.handle({ action: 'signal', runId: 'si-5', signal: 'SIGTERM' });
    const cancelled = await until(async () => { const s = await lastSignin(); return s?.state === 'failed' && s; }, 'the cancel');
    expect(cancelled.message).toMatch(/cancelled/);
    expect(files.has('/login-claude')).toBe(false);
  });

  it('takes no input meant for a run, and no code for a Codex sign-in', async () => {
    makeSandbox();
    await sandbox.handle({ action: 'signin', runId: 'si-6', engine: 'codex', saveUrl: `${base}/login-codex` });
    expect(await sandbox.handle({ action: 'stdin', runId: 'si-6', data: Buffer.from('x').toString('base64') })).toMatchObject({ ok: false, error: 'not-a-run' });
    expect(await sandbox.handle({ action: 'signin-code', runId: 'si-6', code: 'x' })).toMatchObject({ ok: false });
    expect(await sandbox.handle({ action: 'signin', runId: 'si-7', engine: 'gemini', saveUrl: `${base}/x` })).toMatchObject({ ok: false });
  });
});

describe('signing in to Codex in the cloud', () => {
  it('sends the Mac the link and the one-time code, and keeps the whole login once she finishes', async () => {
    makeSandbox();
    await sandbox.handle({ action: 'signin', runId: 'sc-1', engine: 'codex', saveUrl: `${base}/login-codex` });
    const waiting = await until(async () => (await signinStates()).find((e) => e.state === 'waiting'), 'the code');
    expect(waiting).toMatchObject({ url: 'https://auth.openai.com/codex/device', code: 'WY6D-YCCOE' });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end.state, end.message).toBe('saved');
    expect(end.expiresAt).toBeGreaterThan(Date.now() + 200 * 3600 * 1000);
    const kept = JSON.parse(files.get('/login-codex'));
    expect(kept.engine).toBe('codex');
    expect(kept.auth.tokens.refresh_token).toBe('rt-real-refresh-token-0001');
    expect(JSON.stringify(await allEvents())).not.toContain('rt-real-refresh');
  });

  it('keeps nothing when she never finishes on OpenAI\'s page', async () => {
    makeSandbox({ mode: 'codex-abandoned' });
    await sandbox.handle({ action: 'signin', runId: 'sc-2', engine: 'codex', saveUrl: `${base}/login-codex` });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the end');
    expect(end.state).toBe('failed');
    expect(files.has('/login-codex')).toBe(false);
  });
});

// A run, with a login fetched by its own link.
function packedRepo() {
  const repo = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'a@example.com');
  git(repo, 'config', 'user.name', 'A');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'first');
  git(repo, 'checkout', '-q', '-b', 'agentbox/w-1');
  const bundle = path.join(tmp, 'in.bundle');
  git(repo, 'bundle', 'create', bundle, 'agentbox/w-1', 'main');
  files.set('/in.bundle', fs.readFileSync(bundle));
  return repo;
}

async function runWith(login, { env = {}, argv = [path.join(bin, 'claude'), 'run'], also } = {}) {
  const repo = packedRepo();
  const out = await sandbox.handle({
    action: 'start', runId: 'r-1', cwd: repo, branch: 'agentbox/w-1', bundleUrl: `${base}/in.bundle`,
    argv, env, login, ...(also ? { also } : {}),
    results: { bundleUrl: `${base}/out.bundle`, changesUrl: `${base}/changes.bundle`, eventsUrl: `${base}/events.jsonl`, doneUrl: `${base}/done.json`, bring: [] },
  });
  expect(out.ok, JSON.stringify(out)).toBe(true);
  // Results uploaded, or a run that never started.
  await until(async () => files.has('/done.json') || (await allEvents()).some((e) => e.kind === 'state' && e.state === 'failed'), 'the results');
  return allEvents();
}

describe('a run on a login kept in the cloud', () => {
  it('gives Claude Code its token and never lets the run print it, even split across two writes', async () => {
    makeSandbox();
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'claude', token: TOKEN })));
    const events = await runWith({ engine: 'claude', id: 'L1', url: `${base}/login` });
    const printed = stdoutOf(events);
    expect(printed).toContain(`"token":"${REDACTED}"`);
    expect(printed).toContain(`again ${REDACTED} done`);
    expect(JSON.stringify(events)).not.toContain('sk-ant-oat');
    expect(files.get('/events.jsonl').toString()).not.toContain('sk-ant-oat');
  });

  it('gives Codex a copy that cannot renew, marked fresh so it does not try', async () => {
    makeSandbox();
    const exp = Math.floor(Date.now() / 1000) + 100 * 3600;
    const access = jwt(exp);
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'codex', auth: { tokens: { id_token: jwt(exp), access_token: access, refresh_token: 'rt-real-refresh-token-0009' }, last_refresh: '2026-10-01T00:00:00Z' } })));
    const home = path.join(tmp, 'mac', 'codex-home');
    const events = await runWith({ engine: 'codex', id: 'L2', url: `${base}/login` }, { env: { CODEX_HOME: home }, argv: [path.join(bin, 'codex'), 'app-server'] });
    const placed = JSON.parse(fs.readFileSync(path.join(tmp, 'vm', home, 'auth.json'), 'utf8'));
    expect(placed.tokens.refresh_token).toBe(CODEX_REFRESH_PLACEHOLDER);
    expect(placed.tokens.access_token).toBe(access);
    expect(Date.now() - Date.parse(placed.last_refresh)).toBeLessThan(60_000);
    // What the run printed of its auth file has neither token in it.
    expect(JSON.stringify(events)).not.toContain('rt-real-refresh');
    expect(stdoutOf(events)).not.toContain(access);
  });

  it('starts nothing on a login it cannot fetch, and names the login', async () => {
    makeSandbox();
    const events = await runWith({ engine: 'claude', id: 'L3', url: `${base}/no-such-login` });
    expect(events.find((e) => e.kind === 'login')).toMatchObject({ state: 'missing', id: 'L3' });
    expect(events.some((e) => e.kind === 'stdout')).toBe(false);
  });

  it('starts nothing on a Codex login about to run out, and says it needs renewing', async () => {
    makeSandbox();
    const soon = Math.floor(Date.now() / 1000) + 10 * 60;
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'codex', auth: { tokens: { access_token: jwt(soon), refresh_token: 'rt-x-0000000000000000' } } })));
    const events = await runWith({ engine: 'codex', id: 'L4', url: `${base}/login` }, { env: { CODEX_HOME: path.join(tmp, 'mac', 'ch') }, argv: [path.join(bin, 'codex'), 'app-server'] });
    expect(events.find((e) => e.kind === 'login')).toMatchObject({ state: 'expired', id: 'L4' });
    expect(events.some((e) => e.kind === 'stdout')).toBe(false);
  });

  it('asks the login itself when a Claude run fails, and says it was refused only when it was', async () => {
    makeSandbox({ mode: 'claude-refuses' });
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'claude', token: TOKEN })));
    const failing = [process.execPath, '-e', 'process.exit(1)'];
    const refused = await runWith({ engine: 'claude', id: 'L5', url: `${base}/login` }, { argv: failing });
    expect(refused.find((e) => e.kind === 'login')).toMatchObject({ state: 'refused', id: 'L5' });

    await sandbox.close();
    files.delete('/done.json');
    fs.rmSync(path.join(tmp, 'mac'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'vm'), { recursive: true, force: true });
    makeSandbox();
    const fine = await runWith({ engine: 'claude', id: 'L6', url: `${base}/login` }, { argv: failing });
    expect(fine.some((e) => e.kind === 'login')).toBe(false);
  });
});

// Codex's review of the code, 2026-10-14: the findings each case below
// guards are named in its title.
// A CLAUDE RUN CAN ASK CODEX, AS IT CAN ON THE MAC (2026-10-23). A Claude
// thread in the cloud told to get Codex's opinion found Codex signed out,
// with a Codex account connected, because each run was handed only its own
// engine's login. Now a Claude run also carries the Codex one.
describe('a Claude run that carries the Codex login', () => {
  const codexAt = () => path.join(tmp, 'vm', process.env.HOME || '/root', '.codex', 'auth.json');
  const codexLogin = (hours) => {
    const exp = Math.floor(Date.now() / 1000) + hours * 3600;
    const access = jwt(exp, { codex: 'carried' });
    files.set('/codex-login', Buffer.from(JSON.stringify({ engine: 'codex', auth: { tokens: { id_token: jwt(exp), access_token: access, refresh_token: 'rt-real-refresh-token-0042' }, last_refresh: '2026-10-01T00:00:00Z' } })));
    return access;
  };
  const claudeLogin = () => files.set('/login', Buffer.from(JSON.stringify({ engine: 'claude', token: TOKEN })));
  const also = [{ engine: 'codex', id: 'C1', url: '' }];
  const carry = () => [{ ...also[0], url: `${base}/codex-login` }];

  it('finds Codex signed in where `codex` looks, on a copy that cannot renew, and never prints it', async () => {
    makeSandbox();
    claudeLogin();
    const access = codexLogin(100);
    const events = await runWith({ engine: 'claude', id: 'L1', url: `${base}/login` }, { also: carry() });
    const placed = JSON.parse(fs.readFileSync(codexAt(), 'utf8'));
    expect(placed.tokens.access_token).toBe(access);
    expect(placed.tokens.refresh_token).toBe(CODEX_REFRESH_PLACEHOLDER);
    expect(Date.now() - Date.parse(placed.last_refresh)).toBeLessThan(60_000);
    expect(stdoutOf(events)).not.toBe('');
    expect(JSON.stringify(events)).not.toContain(access);
    expect(JSON.stringify(events)).not.toContain('rt-real-refresh');
  });

  it.each([
    ['is gone', () => {}],
    ['is nearly spent', () => codexLogin(0.25)],
  ])('still starts the Claude run when the Codex login %s, with Codex signed out', async (_, setUp) => {
    makeSandbox();
    claudeLogin();
    setUp();
    const events = await runWith({ engine: 'claude', id: 'L1', url: `${base}/login` }, { also: carry() });
    expect(fs.existsSync(codexAt())).toBe(false);
    expect(stdoutOf(events)).not.toBe('');
    expect(events.some((e) => e.kind === 'login')).toBe(false);
  });

  it('is refused for anything but a Codex login carried by a Claude run', async () => {
    makeSandbox();
    const start = (extra) => sandbox.handle({ action: 'start', runId: 'r-x', cwd: tmp, branch: 'b', argv: ['true'], ...extra });
    const refused = { ok: false, error: 'bad-start', message: expect.stringMatching(/Codex login/) };
    expect(await start({ login: { engine: 'claude', url: `${base}/login` }, also: [{ engine: 'claude', url: `${base}/login` }] })).toMatchObject(refused);
    expect(await start({ login: { engine: 'codex', url: `${base}/login` }, also: carry() })).toMatchObject(refused);
    expect(await start({ login: { engine: 'claude', url: `${base}/login` }, also: [{ engine: 'codex' }] })).toMatchObject(refused);
  });
});

describe('what the review found', () => {
  it('does not send a Codex code read before its last letter arrived (finding 9)', async () => {
    makeSandbox({ mode: 'codex-split' });
    await sandbox.handle({ action: 'signin', runId: 'sp-1', engine: 'codex', saveUrl: `${base}/login-codex` });
    const waiting = await until(async () => (await signinStates()).find((e) => e.state === 'waiting'), 'the code');
    expect(waiting.code).toBe('WY6D-YCCOE');
  });

  it('takes a login out of the files a run changed, and keeps commits that carry it in the cloud (finding 1)', async () => {
    makeSandbox({ mode: 'write-token' });
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'claude', token: TOKEN })));
    await runWith({ engine: 'claude', id: 'L7', url: `${base}/login` }, { argv: [path.join(bin, 'claude'), 'run'] });
    const done = JSON.parse(files.get('/done.json'));
    expect(done.uncommitted).toBe(true);
    for (const [k, body] of files) if (k !== '/login' && body) expect(body.toString('latin1'), k).not.toContain(TOKEN);
    expect(fs.readFileSync(path.join(tmp, 'vm', tmp, 'mac', 'repo', 'debug.txt'), 'utf8')).toBe(`token=${REDACTED}\n`);

    await sandbox.close();
    for (const k of [...files.keys()]) if (k !== '/login') files.delete(k);
    fs.rmSync(path.join(tmp, 'mac'), { recursive: true, force: true });
    fs.rmSync(path.join(tmp, 'vm'), { recursive: true, force: true });
    makeSandbox({ mode: 'write-token' });
    const events = await runWith({ engine: 'claude', id: 'L8', url: `${base}/login` }, { env: { FAKE_COMMIT: '1' }, argv: [path.join(bin, 'claude'), 'run'] });
    const kept = JSON.parse(files.get('/done.json'));
    expect(kept.withheld).toMatch(/left in the cloud/);
    expect(kept.commits).toBe(0);
    expect(files.has('/out.bundle')).toBe(false);
    expect(events.some((e) => e.kind === 'error' && /left in the cloud/.test(e.message))).toBe(true);
    for (const [k, body] of files) if (k !== '/login' && body) expect(body.toString('latin1'), k).not.toContain(TOKEN);
  });

  it('does not call a Claude login refused when the check could not reach Claude (finding 5)', async () => {
    makeSandbox({ mode: 'claude-offline' });
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'claude', token: TOKEN })));
    const events = await runWith({ engine: 'claude', id: 'L9', url: `${base}/login` }, { argv: [process.execPath, '-e', 'process.exit(1)'] });
    expect(events.some((e) => e.kind === 'login')).toBe(false);
  });

  it('does not call a Codex login signed out when renewing it met a network error or could not fetch it (finding 5)', async () => {
    makeSandbox({ mode: 'codex-offline' });
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'codex', auth: { tokens: { access_token: jwt(1), refresh_token: 'rt-real-refresh-token-0001' } } })));
    await sandbox.handle({ action: 'renew', runId: 'rn-3', engine: 'codex', loginUrl: `${base}/login`, saveUrl: `${base}/login-new` });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the renewal');
    expect(end.state).toBe('failed');
    expect(end.signedOut).toBeUndefined();

    await sandbox.close();
    makeSandbox();
    await sandbox.handle({ action: 'renew', runId: 'rn-4', engine: 'codex', loginUrl: `${base}/nowhere`, saveUrl: `${base}/login-new` });
    const unreachable = await until(async () => { const s = await lastSignin(); return s?.state === 'failed' && s; }, 'the renewal');
    expect(unreachable.signedOut).toBeUndefined();
  });
});

describe('renewing a Codex login', () => {
  it('renews it from the real login and keeps the renewed one', async () => {
    makeSandbox();
    const exp = Math.floor(Date.now() / 1000) + 40 * 3600;
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'codex', auth: { tokens: { access_token: jwt(exp), refresh_token: 'rt-real-refresh-token-0001' }, last_refresh: new Date().toISOString() } })));
    await sandbox.handle({ action: 'renew', runId: 'rn-1', engine: 'codex', loginUrl: `${base}/login`, saveUrl: `${base}/login-new` });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the renewal');
    expect(end.state, end.message).toBe('saved');
    expect(end.expiresAt).toBeGreaterThan(exp * 1000);
    expect(JSON.parse(files.get('/login-new')).auth.tokens.refresh_token).toBe('rt-real-refresh-token-0002');
    expect(JSON.stringify(await allEvents())).not.toContain('rt-real-refresh');
  });

  it('says the login needs a new sign-in when Codex cannot renew it, and keeps nothing', async () => {
    makeSandbox({ mode: 'codex-cannot-renew' });
    files.set('/login', Buffer.from(JSON.stringify({ engine: 'codex', auth: { tokens: { access_token: jwt(1), refresh_token: 'rt-real-refresh-token-0001' } } })));
    await sandbox.handle({ action: 'renew', runId: 'rn-2', engine: 'codex', loginUrl: `${base}/login`, saveUrl: `${base}/login-new` });
    const end = await until(async () => { const s = await lastSignin(); return ['saved', 'failed'].includes(s?.state) && s; }, 'the renewal');
    expect(end).toMatchObject({ state: 'failed', signedOut: true });
    expect(files.has('/login-new')).toBe(false);
  });
});
