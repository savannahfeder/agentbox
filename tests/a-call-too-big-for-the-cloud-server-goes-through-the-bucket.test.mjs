// A CALL TOO BIG FOR THE CLOUD SERVER GOES THROUGH THE BUCKET.
//
// Found by review, 2026-10-20 (w-6633e825a7). Lambda takes at most 6 MB in a
// request and gives back at most 6 MB, while the sandbox takes 100 MB and
// pages up to 8 MB of a run's output at a time. A long prompt, a big tool
// answer or a run that prints a lot worked on the owner's own AWS account and
// failed through the server, and the Mac retries those calls for ever. So a
// call or an answer over 4 MB goes through the person's own space in the
// bucket, and the server only passes its name. Anything the server still
// refuses is an answer the Mac stops on, never one it retries.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { ROOMY_PLANS } from './fixtures/cloud-plans.mjs';
import { managedClients } from '../main/cloud/managed.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const ACCEPTED = JSON.stringify({ acceptedTerms: TERMS_VERSION });

const P = '44444444-4444-4444-8444-444444444444';
const MB = 1024 * 1024;
let bucket; let bucketUrl; let store; let server; let url; let gw; let reached; let bodies; let answers; let answerSize; let ledger;

beforeEach(async () => {
  store = new Map();
  reached = [];
  bodies = [];
  answers = [];
  answerSize = 10;
  ledger = memoryObjects();
  bucket = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET' || req.method === 'HEAD') {
      const b = store.get(k);
      if (!b) { res.writeHead(k.startsWith('forbidden/') ? 403 : 404); return res.end(); }
      res.writeHead(200); return res.end(req.method === 'GET' ? b : undefined);
    }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { store.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => bucket.listen(0, '127.0.0.1', r));
  bucketUrl = `http://127.0.0.1:${bucket.address().port}`;
  const link = async (k) => `${bucketUrl}/${encodeURIComponent(k)}`;
  // The relay's objects are the bucket's own; the ledger keeps its own.
  const objects = {
    get: async (k) => (k.startsWith('ledger/') ? ledger.get(k) : store.has(k) ? { body: store.get(k).toString('utf8'), etag: 'x' } : null),
    head: async (k) => (k.startsWith('ledger/') ? ledger.head(k) : store.has(k) ? { size: store.get(k).length } : null),
    list: async (p) => ledger.list(p),
    put: async (k, b, o) => (k.startsWith('ledger/') ? ledger.put(k, b, o) : store.set(k, Buffer.from(b))),
    del: async (k) => (k.startsWith('ledger/') ? ledger.del(k) : store.delete(k)),
  };
  gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) { reached.push(payload); return { ok: true, events: [{ kind: 'stdout', data: 'x'.repeat(answerSize) }] }; },
      async stop() {},
    },
    links: { get: link, put: link, head: link },
    removeObject: async (k) => { store.delete(k); },
    objects,
    whoIs: async (t) => (t === 'their-session' ? { id: P } : null),
    plans: ROOMY_PLANS,
  });
  const handle = gw.handle;
  gw.handle = async (req) => {
    bodies.push(Buffer.byteLength(req.body || ''));
    const out = await handle(req);
    answers.push(Buffer.byteLength(JSON.stringify(out.body)));
    return out;
  };
  server = gatewayServer(gw);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  for (const s of [bucket, server]) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
});

async function client() {
  const res = await fetch(`${url}/v1/devices`, { method: 'POST', headers: { authorization: 'Bearer their-session' }, body: ACCEPTED, signal: AbortSignal.timeout(5000) });
  const c = managedClients({ url, key: (await res.json()).key });
  await c.transport.invoke('run-1', { action: 'start', runId: 'r1' });
  reached.length = 0;
  bodies.length = 0;
  return c;
}

describe('a call bigger than the server takes', () => {
  it('reaches the sandbox whole, the server sees only its name, and nothing is left behind', async () => {
    const { transport } = await client();
    const data = Buffer.alloc(7 * MB, 7).toString('base64');
    expect((await transport.invoke('run-1', { action: 'stdin', runId: 'r1', data })).ok).toBe(true);
    expect(reached).toHaveLength(1);
    expect(reached[0].data).toBe(data);
    expect(Math.max(...bodies)).toBeLessThan(MB);
    expect([...store.keys()].filter((k) => k.includes('/calls/'))).toEqual([]);
  });

  it('just under the line goes straight through the server', async () => {
    const { transport } = await client();
    await transport.invoke('run-1', { action: 'stdin', runId: 'r1', data: 'y'.repeat(3 * MB) });
    expect(Math.max(...bodies)).toBeGreaterThan(3 * MB);
    expect(reached[0].data).toHaveLength(3 * MB);
  });
});

describe('an answer bigger than the server gives', () => {
  it('comes back whole, and nothing is left behind', async () => {
    const { transport } = await client();
    answerSize = 7 * MB;
    answers.length = 0;
    const page = await transport.invoke('run-1', { action: 'events', runId: 'r1', since: 0 });
    expect(page.events[0].data).toHaveLength(7 * MB);
    expect(Math.max(...answers)).toBeLessThan(MB);
    expect([...store.keys()].filter((k) => k.includes('/calls/'))).toEqual([]);
  });
});

describe('what the server will not take', () => {
  it('a call named from outside the person\'s own calls is refused', async () => {
    await client();
    store.set(`runs/u-${P}/r1/in.bundle`, Buffer.from('{"action":"stdin"}'));
    store.set('runs/u-55555555-5555-4555-8555-555555555555/calls/x.json', Buffer.from('{"action":"stdin"}'));
    const key = (await (await fetch(`${url}/v1/devices`, { method: 'POST', headers: { authorization: 'Bearer their-session' }, body: ACCEPTED, signal: AbortSignal.timeout(5000) })).json()).key;
    for (const payloadKey of ['runs/r1/in.bundle', 'runs/u-55555555-5555-4555-8555-555555555555/calls/x.json', 'logins/claude/L1.json', 'runs/calls/../r1/in.bundle']) {
      const r = await gw.handle({ method: 'POST', path: '/v1/invoke', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ sessionId: 'run-1', payloadKey }) });
      expect(r.status, payloadKey).toBe(400);
    }
    expect(reached).toEqual([]);
  });

  it('a body over the limit is refused by its bytes, not its characters', async () => {
    const r = await gw.handle({ method: 'POST', path: '/v1/invoke', headers: {}, body: JSON.stringify({ x: '€'.repeat(2.2 * MB) }) });
    expect(r.status).toBe(413);
  });
});

describe('a refusal the Mac gets back', () => {
  const refusing = async (status, error) => {
    const s = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error, message: 'no' })); }); });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    return { s, c: managedClients({ url: `http://127.0.0.1:${s.address().port}`, key: 'abk_x' }) };
  };

  it('is an answer, so a poll that is refused ends rather than asking for ever', async () => {
    const { s, c } = await refusing(400, 'bad-request');
    try {
      expect(await c.transport.invoke('s', { action: 'events', runId: 'r' })).toMatchObject({ ok: false, error: 'no-run' });
      expect(await c.transport.invoke('s', { action: 'stdin', runId: 'r' })).toMatchObject({ ok: false, error: 'bad-request' });
    } finally { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
  });

  // Second review, 2026-10-20: a 401 was thrown, and run.mjs polls for ever
  // on a throw, so a revoked key asked every 30 s for good.
  it('a key the server no longer knows, or a person turned off, is an answer too', async () => {
    for (const [status, error] of [[401, 'signed-out'], [403, 'disabled']]) {
      const { s, c } = await refusing(status, error);
      try {
        expect(await c.transport.invoke('s', { action: 'events' })).toMatchObject({ ok: false, error: 'no-run' });
        expect(await c.transport.invoke('s', { action: 'start' })).toMatchObject({ ok: false, error });
      } finally { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
    }
  });

  // Lambda answers 429 when every function is busy: that passes.
  it('a throttle or a server failure is thrown, so it is tried again', async () => {
    for (const status of [429, 500, 502]) {
      const { s, c } = await refusing(status, 'busy');
      try {
        await expect(c.transport.invoke('s', { action: 'events' })).rejects.toMatchObject({ status });
      } finally { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
    }
  });
});

describe('looking for an object', () => {
  it('missing is false, and a refusal is an error rather than "missing"', async () => {
    const link = (k) => `${bucketUrl}/${encodeURIComponent(k)}`;
    const s = http.createServer((req, res) => {
      let b = ''; req.on('data', (c) => { b += c; });
      req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ url: link(JSON.parse(b).key) })); });
    });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    try {
      const { storage } = managedClients({ url: `http://127.0.0.1:${s.address().port}`, key: 'abk_x' });
      store.set('here', Buffer.from('1'));
      expect(await storage.exists('here')).toBe(true);
      expect(await storage.exists('gone')).toBe(false);
      await expect(storage.exists('forbidden/x')).rejects.toThrow(/403/);
    } finally { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
  });
});
