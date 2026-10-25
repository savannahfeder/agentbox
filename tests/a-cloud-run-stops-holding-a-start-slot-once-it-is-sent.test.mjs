// A CLOUD RUN STOPS HOLDING A START SLOT ONCE THIS MAC HAS SENT IT.
//
// What broke (2026-10-20): with Everything on, 5 of 12 threads in progress had
// no agent on them, and a reply took 184 s to start working. Measured from
// inside that reply's cloud machine: AWS brought the machine up 165 s after the
// reply, and the agent was running 6 s later. Read off the code: only two
// cloud runs may be starting at once, because ten packing together once hung
// the Mac, and each kept its slot until its agent was running. That covers the
// wait for AWS and the cloud machine too, while the Mac holds nothing for it,
// so threads went up two by two, a minute or more each.
//
// Now a run holds its slot only while this Mac packs and sends it: the relay
// prints one line once the cloud accepts its start, and the next run starts
// packing then. When the agent begins, the run's log says how long each part
// took, so the next slow start shows where its time went.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { cloudRun } from '../main/cloud/run.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { CLOUD_SENT, sentLine, readSent } from '../shared/cloud-start.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const sentLines = (text) => String(text).split('\n').filter((l) => l.startsWith(CLOUD_SENT));

describe('the line a cloud run prints once its start is accepted', () => {
  it('carries how long the Mac packed and the cloud took, and is read back from any chunk', () => {
    expect(readSent(sentLine({ packMs: 1200.4, startMs: 3400 }))).toEqual({ packMs: 1200, startMs: 3400 });
    expect(readSent(`agentbox cloud: something\n${sentLine({ packMs: 5, startMs: 6 })}`)).toEqual({ packMs: 5, startMs: 6 });
    expect(readSent('agentbox cloud: the cloud run could not start: busy')).toBe(null);
    expect(readSent(`${CLOUD_SENT} packed soon`)).toBe(null);
    expect(readSent(null)).toBe(null);
  });

  it('is never read as why a run failed', () => {
    const sup = supervisor();
    sup._noteCloudOutcome({ cloud: true, sessionId: null, result: null, tail: [`stderr: ${sentLine({ packMs: 1, startMs: 2 })}`] }, 1);
    expect(sup._cloudHealthNow().lastError).not.toMatch(/packed|sent/);
  });

  it('is never quoted on a thread the app stopped starting', () => {
    const sup = supervisor();
    const written = [];
    sup.store.recordSessionResult = (...a) => written.push(a);
    const item = { id: 'w-1', product: 'p' };
    for (let i = 0; i < 6; i += 1) {
      sup._noteHowTheRunStarted(item, { cloud: true, startedAt: Date.now(), sessionId: null, result: null, tail: ['stderr: agentbox cloud: the sign-in was refused', `stderr: ${sentLine({ packMs: 1, startMs: 2 })}`] });
    }
    expect(written).toHaveLength(1);
    expect(written[0][2].result).toMatch(/the sign-in was refused/);
    expect(written[0][2].result).not.toMatch(/packed/);
  });
});

describe('the relay', () => {
  let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac;

  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-sent-')));
    objects = new Map();
    s3 = http.createServer((req, res) => {
      const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
      if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
      const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
    });
    await new Promise((r) => s3.listen(0, '127.0.0.1', r));
    s3Url = `http://127.0.0.1:${s3.address().port}`;
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
    sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
    mac = path.join(tmp, 'mac', 'repo');
    fs.mkdirSync(mac, { recursive: true });
    git(mac, 'init', '-q', '-b', 'main');
    git(mac, 'config', 'user.email', 'dev@example.com');
    git(mac, 'config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
    git(mac, 'add', '.');
    git(mac, 'commit', '-q', '-m', 'first');
    git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
  });

  afterEach(async () => {
    await sandbox?.close();
    s3.closeAllConnections();
    await new Promise((r) => s3.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const sandboxTransport = {
    async invoke(_sessionId, payload) {
      const res = await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000) });
      return res.json();
    },
    async stop() {},
  };
  const storage = () => ({
    async put(k, body) { objects.set(k, Buffer.from(body)); },
    async get(k) { return objects.get(k) ?? null; },
    async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
    async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  });

  function launch(transport) {
    const configDir = path.join(tmp, 'mac', 'claude-home');
    fs.mkdirSync(configDir, { recursive: true });
    const mcpFile = path.join(tmp, 'mac', 'mcp.json');
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const seen = { out: '', err: '', sentBeforeOutput: null };
    stdout.on('data', (d) => {
      seen.sentBeforeOutput ??= sentLines(seen.err).length === 1;
      seen.out += d;
      if (seen.out.includes('"type":"result"')) stdin.end();
    });
    stderr.on('data', (d) => { seen.err += d; });
    const done = cloudRun({
      argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
      env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac') },
      cwd: mac, transport, storage: storage(), login: LOGIN,
      stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
      homeDir: path.join(tmp, 'home'),
    });
    stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'please do it' } }) + '\n');
    return { done, seen };
  }

  it('says so once, after the cloud accepted the start and before the agent says anything', async () => {
    objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-123-cloud-signin-only' })));
    const run = launch(sandboxTransport);
    expect(await run.done, run.seen.err).toBe(0);
    expect(sentLines(run.seen.err)).toHaveLength(1);
    const times = readSent(run.seen.err);
    expect(times.packMs).toBeGreaterThanOrEqual(0);
    expect(times.startMs).toBeGreaterThanOrEqual(0);
    expect(run.seen.sentBeforeOutput).toBe(true);
  });

  it('says nothing of the kind when the cloud refuses the start', async () => {
    const refusing = { async invoke(_s, p) { return p.action === 'start' ? { ok: false, error: 'bad-start', message: 'refused' } : { ok: true }; }, async stop() {} };
    const run = launch(refusing);
    expect(await run.done).not.toBe(0);
    expect(sentLines(run.seen.err)).toHaveLength(0);
  });
});

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
function supervisor() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-slot-'));
  dirs.push(root);
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [], isDue: () => true },
    root,
  );
  sup._cloudReady = () => true;
  sup._cloudSignedInAtAll = (engine = 'claude') => sup.engineChoices().some((e) => e.id === engine);
  return sup;
}
const add = (sup, id, extra) => sup.sessions.set(id, { itemId: id, engine: 'claude', cloud: true, startedAt: Date.now(), child: { kill() {} }, tail: [], ...extra });

describe('the app', () => {
  it('counts a cloud run against the two starting at once only until it is sent', () => {
    const sup = supervisor();
    add(sup, 'w-1', {});
    add(sup, 'w-2', {});
    expect(sup._cloudSlotFor('claude')).toBe(false);
    sup._noteCloudSent(sup.sessions.get('w-1'), `agentbox cloud: packing\n${sentLine({ packMs: 9000, startMs: 4000 })}`);
    expect(sup._cloudStarting()).toBe(1);
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });

  it('keeps counting a run that has printed anything else', () => {
    const sup = supervisor();
    add(sup, 'w-1', {});
    add(sup, 'w-2', {});
    sup._noteCloudSent(sup.sessions.get('w-1'), 'agentbox cloud: an earlier cloud run in this folder is still going\n');
    sup._noteCloudSent(sup.sessions.get('w-2'), `${CLOUD_SENT} packed`);
    expect(sup._cloudStarting()).toBe(2);
  });

  it('reads nothing from a run on this Mac', () => {
    const sup = supervisor();
    const here = { itemId: 'w-3', cloud: false, tail: [] };
    sup._noteCloudSent(here, sentLine({ packMs: 1, startMs: 1 }));
    expect(here.cloudSentAt).toBeUndefined();
  });

  it('says how long each part of the start took once the agent begins', () => {
    const sup = supervisor();
    const t0 = Date.UTC(2026, 9, 20, 19, 0, 0);
    const item = { id: 'w-1', wrote: { answer: { ts: t0 - 90_000, source: 'founder' }, problem: { ts: t0 - 1000, source: 'agent' } } };
    const session = { cloud: true, startedAt: t0, cloudSentAt: t0 + 21_000, cloudTimes: { packMs: 15_000, startMs: 6_000 } };
    expect(sup._cloudStartLine(session, item, t0 + 27_000)).toBe(
      'cloud start: began 117 s after the newest message; 90 s before packing, 15 s packing and sending here, 6 s for the cloud to take it, 6 s for the agent to begin',
    );
  });

  it('says what it knows when the run never said it was sent', () => {
    const sup = supervisor();
    const t0 = Date.UTC(2026, 9, 20, 19, 0, 0);
    expect(sup._cloudStartLine({ cloud: true, startedAt: t0 }, { id: 'w-1' }, t0 + 40_000)).toBe('cloud start: 40 s from starting the relay to the agent beginning');
  });

  it('is read where the relay\'s output arrives, and said where the agent\'s id does', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/child\.stderr\.on\('data', \(d\) => \{[\s\S]{0,200}this\._noteCloudSent\(session, /);
    const id = src.indexOf('if (session.sessionId && !session.idRemembered)');
    const said = src.indexOf('this._cloudStartLine(session, item)');
    expect(said).toBeGreaterThan(id);
    expect(said - id).toBeLessThan(600);
  });
});
