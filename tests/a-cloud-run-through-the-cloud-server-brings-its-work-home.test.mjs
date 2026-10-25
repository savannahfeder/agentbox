// A CLOUD RUN THROUGH THE CLOUD SERVER BRINGS ITS WORK HOME.
//
// People with no AWS account of their own run in ours, through the cloud
// server (cloud/gateway/, w-6633e825a7). The Mac's run code (main/cloud/run.mjs)
// was written against two small interfaces, the session and the bucket; the
// server's client (main/cloud/managed.mjs) is a second pair of them. If any
// call the run makes is shaped differently through the server, the thread
// says it finished while its work stays in the cloud.
//
// Driven for real on one machine: the real sandbox server, a stand-in bucket
// over HTTP that tells the server when a done.json lands (as S3 will), the
// real cloud server behind HTTP, and the Mac's real client for it.
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
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { ROOMY_PLANS } from './fixtures/cloud-plans.mjs';
import { managedClients, LOGIN_NAME } from '../main/cloud/managed.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudRun, CLOUD_NO_ROOM } from '../main/cloud/run.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const PERSON = '33333333-3333-4333-8333-333333333333';
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let bucket; let bucketUrl; let objects; let gw; let server; let gatewayUrl; let mac; let sessions;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'managedrun-')));
  objects = new Map();
  sessions = [];
  bucket = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET' || req.method === 'HEAD') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(req.method === 'GET' ? b : undefined); }
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      objects.set(k, Buffer.concat(chunks));
      if (k.endsWith('/done.json')) await gw.objectCreated(k);
      res.writeHead(200); res.end();
    });
  });
  await new Promise((r) => bucket.listen(0, '127.0.0.1', r));
  bucketUrl = `http://127.0.0.1:${bucket.address().port}`;
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
  // The person's Claude sign-in, saved in the cloud under their own space.
  objects.set(`logins/u-${PERSON}/claude/L1.json`, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-123-cloud-signin-only' })));

  const link = async (k) => `${bucketUrl}/${encodeURIComponent(k)}`;
  gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        sessions.push(sessionId);
        const res = await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000) });
        return res.json();
      },
      async stop() {},
    },
    links: { get: link, put: link, head: link },
    removeObject: async (k) => { objects.delete(k); },
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'their-session' ? { id: PERSON } : null),
    plans: ROOMY_PLANS,
  });
  server = gatewayServer(gw);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  gatewayUrl = `http://127.0.0.1:${server.address().port}`;

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
  for (const s of [bucket, server]) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function cloudKey() {
  const res = await fetch(`${gatewayUrl}/v1/devices`, { method: 'POST', headers: { authorization: 'Bearer their-session', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mac', acceptedTerms: TERMS_VERSION }),signal: AbortSignal.timeout(5000) });
  return (await res.json()).key;
}

function launch({ transport, storage }) {
  const storeLog = path.join(tmp, 'store.log');
  const configDir = path.join(tmp, 'mac', 'claude-home');
  fs.mkdirSync(configDir, { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: storeLog } } } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"')) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'),
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'please do it' } }) + '\n');
  return { done, out: () => out, err: () => err, storeLog };
}

const resultOf = (out) => JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);

describe('a cloud run through the cloud server', () => {
  it('runs the agent on their own sign-in, lays its commit home, keeps everything in their own space, and ends their agent', async () => {
    const clients = managedClients({ url: gatewayUrl, key: await cloudKey() });
    const run = launch(clients);
    const code = await run.done;
    expect(code, run.err()).toBe(0);
    const result = resultOf(run.out());
    expect(result.said).toBe('noted on the Mac for w-1');
    // The sign-in reached the agent (redacted on the way home).
    expect(result.token).toBe('[cloud sign-in]');
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(fs.readFileSync(path.join(mac, 'cloud.txt'), 'utf8')).toBe('made in the cloud\n');
    // Every object and every session is theirs.
    expect([...objects.keys()].filter((k) => !k.startsWith(`runs/u-${PERSON}/`) && !k.startsWith(`logins/u-${PERSON}/`))).toEqual([]);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.startsWith(`u-${PERSON}-`))).toBe(true);
    // done.json landed, so the agent is no longer counted as running.
    const me = await clients.me();
    expect(me.running).toBe(0);
  });

  it('the Mac\'s client never asks the server for a sign-in, and names one instead of linking it', async () => {
    const { storage } = managedClients({ url: gatewayUrl, key: await cloudKey() });
    expect(await storage.getUrl(LOGIN.key)).toBe(`${LOGIN_NAME}${LOGIN.key}`);
    expect(await storage.putUrl(LOGIN.key)).toBe(`${LOGIN_NAME}${LOGIN.key}`);
    await expect(storage.get(LOGIN.key)).rejects.toThrow(/sign-in/);
    // It may look for one, and write and delete its own.
    expect(await storage.exists(LOGIN.key)).toBe(true);
    expect(await storage.exists('logins/claude/nobody.json')).toBe(false);
    await storage.put('runs/r9/x.txt', Buffer.from('hello'));
    expect(await storage.get('runs/r9/x.txt')).toEqual(Buffer.from('hello'));
    expect(await storage.get('runs/r9/missing')).toBe(null);
    await storage.del('runs/r9/x.txt');
    expect(objects.has(`runs/u-${PERSON}/r9/x.txt`)).toBe(false);
  });

  // A refusal for room (here the cloud paused; no plan or spent hours are the
  // same) ends as its own exit, so the thread runs on the Mac with no attempt
  // spent (tests/a-cloud-with-no-room-sends-threads-back-to-the-mac-and-says-why).
  it('a start the server has no room for ends as CLOUD_NO_ROOM and says why', async () => {
    const clients = managedClients({ url: gatewayUrl, key: await cloudKey() });
    await gw.admin({ do: 'pause' });
    const run = launch(clients);
    expect(await run.done).toBe(CLOUD_NO_ROOM);
    expect(run.err()).toMatch(/agentbox cloud: no room in the cloud \(paused\): The cloud is not starting new runs right now\./);
  });

  it('a key the server does not know is told it is signed out', async () => {
    const { transport } = managedClients({ url: gatewayUrl, key: 'abk_notakeynotakeynotakeynotakeynotakeynotakey' });
    expect(await transport.invoke('s1', { action: 'status' })).toMatchObject({ ok: false, error: 'signed-out' });
  });

  it('a server that never answers ends the call instead of holding the run', async () => {
    const silent = http.createServer(() => {});
    await new Promise((r) => silent.listen(0, '127.0.0.1', r));
    try {
      const { transport } = managedClients({ url: `http://127.0.0.1:${silent.address().port}`, key: 'abk_x', timeoutMs: 300 });
      const t0 = Date.now();
      await expect(transport.invoke('s1', { action: 'status' })).rejects.toThrow();
      expect(Date.now() - t0).toBeLessThan(5000);
    } finally { silent.closeAllConnections(); await new Promise((r) => silent.close(r)); }
  });
});
