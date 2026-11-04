#!/usr/bin/env node
// A STAND-IN AGENTBOX CLOUD, FOR A COPY THAT CANNOT REACH THE REAL ONE.
//
//   STUB_CLOUD_INSTANCE=<instance dir> STUB_CLOUD_HOME=<copy's home> node stub-cloud-server.mjs
//
// The real cloud server (cloud/gateway/gateway.mjs) on a local port, with an
// in-memory bucket served over HTTP for its links, and a real sandbox
// (cloud/sandbox/server.mjs) per cloud session, each in its own folder under
// <instance>/cloud-vm so a run never writes over the copy's own task folder.
// The agent there is the stand-in Claude (scripts/lib/stub-claude-worker.mjs).
// It signs the copy in: the cloud's address, a device key, one Claude account
// in the cloud and what the image can do, all in the copy's own ~/.agentbox.
// Writes <instance>/stub-cloud.json once it is listening.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
// Named in the environment, not the command line, so a restart of the copy
// (which stops every process naming its folder) leaves the cloud running.
const { STUB_CLOUD_INSTANCE: instance, STUB_CLOUD_HOME: home } = process.env;
if (!instance || !home) { console.error('usage: STUB_CLOUD_INSTANCE=<dir> STUB_CLOUD_HOME=<copy home> stub-cloud-server.mjs'); process.exit(2); }

const { createGateway } = await import(path.join(REPO, 'cloud', 'gateway', 'gateway.mjs'));
const { TERMS_VERSION } = await import(path.join(REPO, 'cloud', 'gateway', 'terms.mjs'));
const { PLANS } = await import(path.join(REPO, 'cloud', 'gateway', 'plans.mjs'));
const { createSandbox, pickBaseEnv } = await import(path.join(REPO, 'cloud', 'sandbox', 'server.mjs'));
const { recordCloudLogin, loginObjectKey } = await import(path.join(REPO, 'main', 'cloud', 'logins.mjs'));
const { noteImageCaps } = await import(path.join(REPO, 'main', 'cloud', 'config.mjs'));

const PERSON = '5a5a5a5a-1111-4111-8111-111111111111';
const vmRoot = path.join(instance, 'cloud-vm');
fs.mkdirSync(vmRoot, { recursive: true });
// `claude` in the sandbox is the stand-in, with the copy's plan.
const bin = path.join(instance, 'cloud-bin');
fs.mkdirSync(bin, { recursive: true });
fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(REPO, 'scripts', 'lib', 'stub-claude-worker.mjs')}" "$@"\n`, { mode: 0o755 });

// The bucket, on disk and byte for byte, so a run's bundles survive and a
// restart of the copy (which restarts this) keeps every saved key.
const bucket = path.join(instance, 'cloud-bucket');
fs.mkdirSync(bucket, { recursive: true });
const fileOf = (k) => path.join(bucket, encodeURIComponent(k));
const etagOf = (b) => crypto.createHash('sha1').update(b).digest('hex');
const conflict = () => Object.assign(new Error('changed meanwhile'), { conflict: true });
const read = (k) => { try { return fs.readFileSync(fileOf(k)); } catch { return null; } };
const objects = {
  async get(k) { const b = read(k); return b ? { body: b, etag: etagOf(b) } : null; },
  async head(k) { const b = read(k); return b ? { size: b.length } : null; },
  async put(k, body, { ifMatch, ifNoneMatch } = {}) {
    const cur = read(k);
    if (ifNoneMatch === '*' && cur) throw conflict();
    if (ifMatch && (!cur || etagOf(cur) !== ifMatch)) throw conflict();
    const tmp = `${fileOf(k)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
    fs.renameSync(tmp, fileOf(k));
  },
  async del(k) { fs.rmSync(fileOf(k), { force: true }); },
  async list(prefix) { return fs.readdirSync(bucket).map(decodeURIComponent).filter((k) => k.startsWith(prefix) && !k.endsWith('.tmp')); },
  async sizes(prefix, { max = Infinity } = {}) {
    const keys = (await objects.list(prefix)).sort();
    return { items: keys.slice(0, max).map((key) => { const st = fs.statSync(fileOf(key)); return { key, size: st.size, at: st.mtimeMs }; }), truncated: keys.length > max };
  },
};
let base = '';
const link = (k) => `${base}/o/${encodeURIComponent(k)}`;
const sandboxes = new Map();
function sandboxFor(sid) {
  if (!sandboxes.has(sid)) {
    const dir = path.join(vmRoot, sid.replace(/[^A-Za-z0-9-]/g, '').slice(-60));
    sandboxes.set(sid, createSandbox({
      workRoot: path.join(dir, 'work'), pathRoot: path.join(dir, 'root'), bridgeSocket: path.join(dir, 'bridge.sock'),
      baseEnv: { ...pickBaseEnv(process.env), PATH: `${bin}:${process.env.PATH}`, ...(process.env.STUB_CLAUDE_PLAN ? { STUB_CLAUDE_PLAN: process.env.STUB_CLAUDE_PLAN } : {}), STUB_PERSON_HOME: home },
      terminal: (line) => ['sh', '-c', line], whoIs: async () => null, uploadRetryMs: 200,
    }));
  }
  return sandboxes.get(sid);
}
let gw;
gw = createGateway({
  agentcore: {
    invoke: async (sid, payload) => sandboxFor(sid).handle(payload),
    async stop(sid) { const s = sandboxes.get(sid); sandboxes.delete(sid); await s?.close?.(); },
  },
  links: { get: async (k) => link(k), put: async (k) => link(k), head: async (k) => link(k) },
  removeObject: async (k) => objects.del(k),
  objects,
  whoIs: async (t) => (t === 'stand-in' ? { id: PERSON } : null),
  plans: { ...PLANS, standin: { agents: 6, hoursPerMonth: 1000 } },
  log: (m) => console.log(m),
});

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/o/')) {
      const k = decodeURIComponent(url.pathname.slice(3));
      if (req.method === 'PUT') {
        await objects.put(k, body);
        res.writeHead(200).end();
        if (/\/done\.json$/.test(k)) gw.objectCreated(k).catch(() => {});
        return;
      }
      const o = await objects.get(k);
      if (!o) return res.writeHead(404).end();
      res.writeHead(200, { 'content-length': Buffer.byteLength(o.body) });
      return res.end(req.method === 'HEAD' ? undefined : o.body);
    }
    const out = await gw.handle({ method: req.method, path: url.pathname, headers: req.headers, body: body.toString('utf8') });
    res.writeHead(out.status, { 'content-type': 'application/json' }).end(JSON.stringify(out.body ?? {}));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'stand-in', message: String(err?.message ?? err) }));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
base = `http://127.0.0.1:${server.address().port}`;

// Sign the copy in, as Agentbox Cloud's sign-in page would: once, so a restart keeps its key.
const dot = path.join(home, '.agentbox');
const had = fs.existsSync(path.join(dot, 'cloud-key'));
const made = had ? null : await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer stand-in' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION, name: 'stand-in copy' }) });
await gw.admin({ do: 'plan', person: PERSON, plan: 'standin' });
fs.mkdirSync(dot, { recursive: true });
fs.writeFileSync(path.join(dot, 'cloud.json'), JSON.stringify({ gateway: base }, null, 2));
if (made) {
  fs.writeFileSync(path.join(dot, 'cloud-key'), `${made.body.key}\n`, { mode: 0o600 });
  await objects.put(`logins/u-${PERSON}/${loginObjectKey('claude', 'L1').slice('logins/'.length)}`, JSON.stringify({ engine: 'claude', token: `sk-ant-stand-in-${'Q'.repeat(40)}` }));
  recordCloudLogin('claude', 'acct-standin', { id: 'L1', email: 'cloud@example.com' }, { home });
}
const caps = ['offline', 'setup', 'kept', 'base', 'plain', 'hold', 'resources', 'keys'];
noteImageCaps({ gateway: base }, caps, {}, home);
fs.writeFileSync(path.join(instance, 'stub-cloud.json'), JSON.stringify({ url: base, pid: process.pid }));
console.log(`stand-in cloud on ${base}`);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { for (const s of sandboxes.values()) await s.close?.().catch(() => {}); process.exit(0); });
