// NOBODY CAN FILL THE CLOUD BUCKET PAST A CAP.
//
// What was wrong (2026-10-22, before Agentbox Cloud opened to strangers): the
// cloud server signed a plain S3 PutObject for any key under the caller's
// `runs/` whenever a Mac asked (`POST /v1/link`, op put), for up to 12 hours,
// and asked nothing about the caller's plan. A presigned link takes any
// number of uploads until it expires, each up to S3's 5 GB, and one call
// mints one more link for one more key. Anyone who signed up, with no card,
// could upload at their own line speed for free: 1 Gbit/s held for the 7 days
// `runs/` keeps objects is about 75 TB, about $1,700 a month of S3 at
// $0.023/GB-month, ten times that from a 10 Gbit/s machine. A `start` could
// also carry `saveUrl`, and the server swapped it for a link that writes
// under `logins/`, which never expires.
//
// Measured by reading cloud/gateway/gateway.mjs and main/cloud/aws.mjs (no
// size, no plan check, LINK_MAX_SECONDS 12 h). Now: no plan, no link that
// writes; a sign-in is saved only by a sign-in; and the sweep lists the
// `runs/` of whoever was handed such a link, refuses new ones at the cap,
// and deletes the newest past twice the cap. The Mac reads a refusal as "no
// room in the cloud", as it does a refused start, before it uploads anything.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { managedClients } from '../main/cloud/managed.mjs';
import { cloudRun, CLOUD_NO_ROOM, refusedForRoom } from '../main/cloud/run.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MIN = 60_000;
const HOUR = 60 * MIN;

function setup({ storageBytes } = {}) {
  let t = Date.UTC(2026, 9, 22, 12);
  const sent = [];
  const objects = memoryObjects();
  const listed = [];
  const sizes = objects.sizes;
  objects.sizes = async (prefix, opts) => { listed.push(prefix); return sizes(prefix, opts); };
  const gw = createGateway({
    agentcore: { async invoke(sessionId, payload) { sent.push({ sessionId, payload }); return { ok: true }; }, async stop() {} },
    links: { get: async (k) => `https://bucket.test/${k}?read`, put: async (k) => `https://bucket.test/${k}?write`, head: async (k) => `https://bucket.test/${k}?look` },
    removeObject: async (k) => objects.del(k),
    objects,
    whoIs: async (token) => ({ 'session-of-a': { id: A }, 'session-of-b': { id: B } })[token] ?? null,
    now: () => t,
    ...(storageBytes ? { storageBytes } : {}),
  });
  const call = async (method, p, { key, body } = {}) => gw.handle({ method, path: p, headers: key ? { authorization: `Bearer ${key}` } : {}, body: body ? JSON.stringify(body) : '' });
  const keyFor = async (session) => (await call('POST', '/v1/devices', { key: session, body: { name: 'Mac', acceptedTerms: TERMS_VERSION } })).body.key;
  const put = (key, k = 'runs/r1/out.bundle') => call('POST', '/v1/link', { key, body: { op: 'put', key: k } });
  return { gw, objects, sent, listed, call, keyFor, put, later: (ms) => { t += ms; } };
}

describe('who is handed a link that writes', () => {
  it('nobody without a plan, while one that reads still works, so a lapsed plan brings its last results home', async () => {
    const { gw, call, keyFor, put } = setup();
    const a = await keyFor('session-of-a');
    const refused = await put(a);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: 'plan' });
    expect(refused.body.message).toMatch(/plan/);
    for (const op of ['get', 'head']) expect((await call('POST', '/v1/link', { key: a, body: { op, key: 'runs/r1/out.bundle' } })).status).toBe(200);
    await gw.admin({ do: 'plan', person: A, plan: 'pro' });
    expect((await put(a)).body.url).toBe(`https://bucket.test/runs/u-${A}/r1/out.bundle?write`);
  });

  it('a sign-in is saved only by a sign-in or its renewal, never by a run', async () => {
    const { gw, call, keyFor, sent } = setup();
    const a = await keyFor('session-of-a');
    await gw.admin({ do: 'plan', person: A, plan: 'pro' });
    const name = 'agentbox-login:logins/claude/L2.json';
    const run = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 's1', payload: { action: 'start', runId: 'r1', saveUrl: name } } });
    expect(run.status).toBe(400);
    const other = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 's1', payload: { action: 'events', runId: 'r1', saveUrl: name } } });
    expect(other.status).toBe(400);
    expect(sent).toEqual([]);
    for (const action of ['signin', 'renew']) {
      const r = await call('POST', '/v1/invoke', { key: a, body: { sessionId: `s-${action}`, payload: { action, runId: `r-${action}`, engine: 'claude', saveUrl: name } } });
      expect(r.status, action).toBe(200);
    }
    expect(sent.map((s) => s.payload.saveUrl)).toEqual([`https://bucket.test/logins/u-${A}/claude/L2.json?write`, `https://bucket.test/logins/u-${A}/claude/L2.json?write`]);
  });

  it('handing out links costs the ledger at most one write an hour', async () => {
    const { gw, objects, keyFor, put, later } = setup();
    const a = await keyFor('session-of-a');
    await gw.admin({ do: 'plan', person: A, plan: 'pro' });
    const writes = [];
    const write = objects.put;
    objects.put = async (k, ...rest) => { if (k === `ledger/people/${A}.json`) writes.push(k); return write(k, ...rest); };
    for (let i = 0; i < 50; i += 1) { expect((await put(a, `runs/r${i}/out.bundle`)).status).toBe(200); later(MIN); }
    expect(writes).toHaveLength(1);
    later(11 * MIN);
    await put(a);
    expect(writes).toHaveLength(2);
  });
});

describe('what one person may keep in the bucket', () => {
  let s;
  let a;
  const fill = async (k, bytes) => s.objects.put(`runs/u-${A}/${k}`, 'x'.repeat(bytes));
  beforeEach(async () => {
    s = setup({ storageBytes: 1000 });
    a = await s.keyFor('session-of-a');
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    expect((await s.put(a)).status).toBe(200);
  });

  it('one byte under the cap is room; at the cap no new link writes, and the refusal says why', async () => {
    await fill('r1/in.bundle', 999);
    await s.gw.sweep();
    expect((await s.put(a)).status).toBe(200);
    await fill('r1/out.bundle', 1);
    s.later(15 * MIN);
    await s.gw.sweep();
    const full = await s.put(a);
    expect(full.status).toBe(403);
    expect(full.body.error).toBe('storage');
    expect(full.body.message).toMatch(/full/);
    // What is there still comes home.
    expect((await s.call('POST', '/v1/link', { key: a, body: { op: 'get', key: 'runs/r1/out.bundle' } })).status).toBe(200);
  });

  it('nothing is deleted up to twice the cap; past it the newest go, back down to twice the cap', async () => {
    await fill('old/in.bundle', 1200);
    await fill('mid/in.bundle', 800);
    await s.gw.sweep();
    expect([...s.objects.dump().keys()].filter((k) => k.startsWith('runs/'))).toHaveLength(2);
    await fill('new/a', 300);
    await fill('new/b', 300);
    s.later(15 * MIN);
    await s.gw.sweep();
    const kept = [...s.objects.dump().keys()].filter((k) => k.startsWith('runs/')).sort();
    expect(kept).toEqual([`runs/u-${A}/mid/in.bundle`, `runs/u-${A}/old/in.bundle`]);
  });

  it('another person\'s objects are neither counted nor deleted', async () => {
    await s.objects.put(`runs/u-${B}/r1/in.bundle`, 'x'.repeat(5000));
    await fill('r1/in.bundle', 10);
    await s.gw.sweep();
    expect((await s.put(a)).status).toBe(200);
    expect(s.objects.dump().has(`runs/u-${B}/r1/in.bundle`)).toBe(true);
    expect(s.listed).not.toContain(`runs/u-${B}/`);
  });

  it('a person is listed no more often than every 15 minutes, and not at all once their links have run out', async () => {
    await s.gw.sweep();
    await s.gw.sweep();
    expect(s.listed).toEqual([`runs/u-${A}/`]);
    s.later(14 * MIN);
    await s.gw.sweep();
    expect(s.listed).toHaveLength(1);
    s.later(MIN);
    await s.gw.sweep();
    expect(s.listed).toHaveLength(2);
    // Past the last link's 12 hours and one more look, nothing can have come in.
    s.later(14 * HOUR);
    await s.gw.sweep();
    s.later(15 * MIN);
    await s.gw.sweep();
    expect(s.listed).toHaveLength(3);
  });

  it('a full person is looked at again until what is there has gone, and then is handed links again', async () => {
    await fill('r1/in.bundle', 1000);
    await s.gw.sweep();
    expect((await s.put(a)).status).toBe(403);
    s.later(20 * HOUR);
    await s.gw.sweep();
    expect((await s.put(a)).status).toBe(403);
    // The bucket's 7-day rule takes it.
    await s.objects.del(`runs/u-${A}/r1/in.bundle`);
    s.later(15 * MIN);
    await s.gw.sweep();
    expect((await s.put(a)).status).toBe(200);
  });
});

describe('the Mac, refused a link that writes', () => {
  it('says there is no room in the cloud, for that reason, and that alone', () => {
    expect(refusedForRoom({ ok: false, error: 'storage', message: 'Your cloud storage is full.' })).toEqual({ code: CLOUD_NO_ROOM, line: 'no room in the cloud (storage): Your cloud storage is full.' });
  });

  let tmp; let bucket; let server; let uploads;
  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcap-')));
    uploads = [];
    bucket = http.createServer((req, res) => {
      if (req.method === 'PUT') uploads.push(req.url);
      req.resume();
      req.on('end', () => { res.writeHead(req.method === 'PUT' ? 200 : 404); res.end(); });
    });
    await new Promise((r) => bucket.listen(0, '127.0.0.1', r));
  });
  afterEach(async () => {
    for (const x of [bucket, server]) { if (!x) continue; x.closeAllConnections(); await new Promise((r) => x.close(r)); }
    server = null;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('a Mac with no plan ends its run as no room, before it has uploaded anything', async () => {
    const at = `http://127.0.0.1:${bucket.address().port}`;
    const link = async (k) => `${at}/${encodeURIComponent(k)}`;
    const gw = createGateway({
      agentcore: { async invoke() { throw new Error('no start should reach the cloud'); }, async stop() {} },
      links: { get: link, put: link, head: link },
      removeObject: async () => {},
      objects: memoryObjects(),
      whoIs: async (t) => (t === 'their-session' ? { id: A } : null),
    });
    server = gatewayServer(gw);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    const made = await fetch(`${url}/v1/devices`, { method: 'POST', headers: { authorization: 'Bearer their-session', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mac', acceptedTerms: TERMS_VERSION }), signal: AbortSignal.timeout(5000) });
    const { transport, storage } = managedClients({ url, key: (await made.json()).key });

    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'dev@example.com');
    git('config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
    git('add', '.');
    git('commit', '-q', '-m', 'first');
    git('checkout', '-q', '-b', 'agentbox/w-1');
    const stdin = new PassThrough();
    const stderr = new PassThrough();
    let said = '';
    stderr.on('data', (d) => { said += d; });
    const code = await cloudRun({
      argv: ['-p'], env: { ...process.env, ZERO_ITEM: 'w-1', CLAUDE_CONFIG_DIR: path.join(tmp, 'claude') },
      cwd: repo, transport, storage, login: { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' },
      stdin, stdout: new PassThrough(), stderr, watchParent: false, signals: new EventEmitter(), homeDir: path.join(tmp, 'home'),
    });
    expect(code, said).toBe(CLOUD_NO_ROOM);
    expect(said).toMatch(/no room in the cloud \(plan\): Choose a cloud plan/);
    expect(uploads).toEqual([]);
  });
});
