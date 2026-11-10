#!/usr/bin/env node
// HOW MANY CLOUD RUNS AT ONCE THE CLOUD HOLDS, before every launch.
//
// Each run goes the way a thread's does: the app's own run code
// (main/cloud/run.mts cloudRun) packs a small repository, starts it through the
// cloud server with the app's own client (main/cloud/managed.mts), reads its
// output, and brings it home. The command is fixed (`sh`, no model), so a run
// costs only its machine. Starts are paced as the app paces them, 8 at a time,
// unless --starting says otherwise.
//
//   node scripts/cloud-load-test.mjs --standin [--steps 10,25,50,100,200] [--chaos]
//       The real cloud server and the real sandbox on this machine, one sandbox
//       per session as AWS gives each its own machine, over a bucket with S3's
//       delays. --chaos drops calls before and after the server did them, kills
//       and restarts the server mid-step, and delivers every done.json twice.
//       --concurrency is the function's ceiling on calls at once (default 200,
//       as deployed); a call past it is refused 429, as Lambda does.
//
//   Either takes --chatty: the command prints a line a second, as an agent's
//   stream does, so its output is read as often as an agent's is.
//
//   node scripts/cloud-load-test.mjs --live [--steps 10] [--seconds 90]
//       The real cloud on AWS. Needs an admin AWS sign-in (`aws login`): it
//       makes a throwaway Max account for the test, then disables it after.
//
// Prints one line per step and a table at the end: agents asked for, the most
// running at once, finished, lost, doubled, slowest start, agent-hours, cost.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { managedClients } from '../main/cloud/managed.mts';
import { cloudRun, IMPORT_FAILED } from '../main/cloud/run.mts';
import { readSent } from '../shared/cloud-start.mts';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mts';

// The measured cost of an agent-hour (cloud/gateway/plans.mjs, scripts/cloud-usage.mjs).
export const DOLLARS_PER_AGENT_HOUR = 0.07;
const LOGIN = { engine: 'claude', id: 'load-test', key: 'logins/claude/load-test.json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = (a, b) => a + Math.random() * (b - a);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The fixed command: says it began, waits, says it ended. Each line names its run. */
export const commandFor = (tag, seconds, { chatty = false } = {}) => ['-c', chatty
  // A line a second, as an agent's stream comes, so its output is read as often.
  ? `echo lt-start-${tag}; i=0; while [ $i -lt ${seconds} ]; do echo tick $i; sleep 1; i=$((i+1)); done; echo lt-end-${tag}`
  : `echo lt-start-${tag}; sleep ${seconds}; echo lt-end-${tag}`];

/** What one step's runs came to. */
export function tallyStep(n, runs) {
  // Started twice: the sandbox took a fresh start of it twice, or, where that cannot be seen, its output says so.
  const twice = (r) => (r.sandboxStarts != null ? r.sandboxStarts > 1 : r.starts > 1);
  const done = runs.filter((r) => r.code === 0 && r.ends >= 1 && !twice(r));
  const doubled = runs.filter(twice);
  const startMs = runs.map((r) => r.startMs).filter((x) => x != null).sort((a, b) => a - b);
  // The most commands running at the same moment, from when each said it began to when it ended.
  const edges = runs.flatMap((r) => (r.ranFrom != null ? [[r.ranFrom, 1], [r.ranTo ?? r.endedAt ?? Infinity, -1]] : [])).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let peak = 0; let now = 0;
  for (const [, d] of edges) { now += d; peak = Math.max(peak, now); }
  const agentSeconds = runs.reduce((s, r) => s + Math.max(0, ((r.endedAt ?? r.begunAt) - r.begunAt) / 1000), 0);
  return {
    n, peak, finished: done.length, lost: runs.filter((r) => !done.includes(r) && !twice(r)).length, doubled: doubled.length,
    slowestStartS: startMs.length ? +(startMs.at(-1) / 1000).toFixed(1) : null,
    medianStartS: startMs.length ? +(startMs[startMs.length >> 1] / 1000).toFixed(1) : null,
    agentHours: +(agentSeconds / 3600).toFixed(2), dollars: +(agentSeconds / 3600 * DOLLARS_PER_AGENT_HOUR).toFixed(2),
    // Runs that stopped early and were brought home by the app's next pass, as the supervisor's would.
    broughtHomeLater: runs.filter((r) => done.includes(r) && r.attempts > 1).length,
    why: [...new Set(runs.filter((r) => !done.includes(r)).map((r) => r.why).filter(Boolean))].slice(0, 5),
  };
}

// The app tries a thread whose cloud work is not home again, and holds it
// after six starts in ten minutes (main/supervisor.mts), so a run gets five more.
const MORE_PASSES = 5;
const PASS_GAP_MS = 10_000;

/** One run, as a thread's would go, through `clients`, with the app's own passes to bring it home. */
async function oneRun({ clients, tag, seconds, chatty, dir, sandboxStarts, r }) {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'load-test@example.com');
  git(repo, 'config', 'user.name', 'Load test');
  fs.writeFileSync(path.join(repo, 'a.txt'), `${tag}\n`);
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'first');
  git(repo, 'checkout', '-q', '-b', `agentbox/${tag}`);
  const configDir = path.join(dir, 'claude-home');
  fs.mkdirSync(configDir, { recursive: true });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  Object.assign(r, { tag, begunAt: Date.now(), starts: 0, ends: 0, code: null, startMs: null, ranFrom: null, ranTo: null, sentAt: null, endedAt: null, why: null, attempts: 0, threw: null });
  let out = ''; let err = '';
  stdout.on('data', (d) => {
    out += d;
    r.starts = out.split(`lt-start-${tag}`).length - 1;
    r.ends = out.split(`lt-end-${tag}`).length - 1;
    if (r.starts && r.ranFrom == null) { r.ranFrom = Date.now(); r.startMs = r.ranFrom - r.begunAt; }
    if (r.ends && r.ranTo == null) r.ranTo = Date.now();
  });
  stderr.on('data', (d) => { err += d; if (r.sentAt == null && readSent(err)) r.sentAt = Date.now(); });
  // As the app goes: work not home (exit 75, as a throw becomes) is brought
  // home by a pass of its own; a thread whose command never began is started
  // again, its answer handed over again.
  let bringHome = false;
  for (let pass = 0; pass <= MORE_PASSES; pass += 1) {
    if (pass) await sleep(PASS_GAP_MS);
    r.attempts += 1;
    const stdin = new PassThrough();
    stdin.end();
    const importOnly = bringHome;
    try {
      r.code = await cloudRun({
        argv: importOnly ? [] : commandFor(tag, seconds, { chatty }), remoteCommand: 'sh', importOnly,
        env: { ...process.env, ZERO_ITEM: tag, ZERO_PRODUCT: 'load-test', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(dir, 'agentbox') },
        cwd: repo, ...clients, login: LOGIN, stdin, stdout, stderr,
        // Each pass is its own process in the app, gone once it ends; here they share one.
        pid: spawnSync('true').pid,
        watchParent: false, signals: new EventEmitter(), homeDir: path.join(dir, 'home'), pollWaitMs: 20_000, resultsWaitMs: 60_000,
      });
      r.threw = null;
    } catch (e) {
      r.code = -1;
      r.threw = `${e?.message || e} ${String(e?.stack || '').split('\n').find((l) => /main\/cloud\//.test(l))?.trim() || ''}`;
      (r.threws ??= []).push(`pass ${pass}: ${e?.stack || e}`);
    }
    if (r.code === IMPORT_FAILED || r.threw) { bringHome = true; continue; }
    const neverBegan = !r.starts && !sandboxStarts?.get(tag);
    if (importOnly && r.code === 0 && !r.ends && neverBegan) { bringHome = false; continue; }
    break;
  }
  r.endedAt = Date.now();
  r.sent = readSent(err);
  r.sandboxStarts = sandboxStarts?.get(tag);
  if (r.code !== 0 || r.ends < 1) {
    if (process.env.LT_DEBUG) { fs.mkdirSync(process.env.LT_DEBUG, { recursive: true }); fs.writeFileSync(path.join(process.env.LT_DEBUG, `${tag}.log`), `code ${r.code} attempts ${r.attempts} sandbox starts ${sandboxStarts?.get(tag)}\n${(r.threws || []).join('\n')}\n--- stdout\n${out}\n--- stderr\n${err}`); }
    r.why = r.threw || (err.split('\n').filter((l) => /cloud|could not|refused|error/i.test(l)).at(-1) || `exit ${r.code}, started ${r.starts}, ended ${r.ends}`).slice(0, 200);
  }
  return r;
}

/** `n` runs, `starting` of them starting at once, each holding its machine `seconds`. */
export async function runStep({ n, seconds, chatty = false, starting, clients, tmp, sandboxStarts, during = async () => {}, say = () => {} }) {
  const stepDir = fs.mkdtempSync(path.join(tmp, `step-${n}-`));
  const runs = [];
  let next = 0;
  let starts = 0;
  let sentOrDone = 0;
  const all = [];
  const progress = setInterval(() => say(`  ${n}: ${runs.filter((r) => r.ranFrom && !r.ranTo).length} running, ${runs.filter((r) => r.endedAt).length} ended`), 15_000);
  // A start holds its place until the cloud took it (or it ended), as the app's starts do.
  await new Promise((resolveAll) => {
    const launch = () => {
      while (next < n && starts - sentOrDone < starting) {
        const i = next++;
        starts += 1;
        const tag = `lt-${n}-${i}-${crypto.randomBytes(3).toString('hex')}`;
        const dir = path.join(stepDir, String(i));
        let freed = false;
        const free = () => { if (!freed) { freed = true; sentOrDone += 1; launch(); } };
        const r = {};
        runs[i] = r;
        const p = oneRun({ clients, tag, seconds, chatty, dir, sandboxStarts, r }).then(() => { free(); return r; });
        const watch = setInterval(() => { if (r.sentAt || r.endedAt) { clearInterval(watch); free(); } }, 200);
        p.finally(() => clearInterval(watch));
        all.push(p);
      }
      if (next >= n) resolveAll();
    };
    launch();
  });
  const duringDone = during();
  const results = await Promise.all(all);
  await duringDone;
  clearInterval(progress);
  fs.rmSync(stepDir, { recursive: true, force: true });
  return { tally: tallyStep(n, results), runs: results };
}

// THE STAND-IN CLOUD: the real server over a bucket with S3's delays, the real
// sandbox, one per session, and AgentCore's cold start as a wait.
// `concurrency` is the function's reserved concurrency (scripts/cloud-gateway-setup.mjs): a call past it is
// refused 429, as Lambda refuses it.
export async function standinCloud({ tmp, chaos = false, concurrency = 200, hostCount = 5, coldStartMs = [1000, 4000], log = () => {} }) {
  const person = '55555555-5555-4555-8555-555555555555';
  const mem = memoryObjects();
  const ledger = { ...mem, get: async (k) => { await sleep(between(15, 40)); return mem.get(k); }, put: async (k, b, o) => { await sleep(between(25, 70)); return mem.put(k, b, o); } };
  const files = new Map();
  files.set(`logins/u-${person}/claude/load-test.json`, Buffer.from(JSON.stringify({ engine: 'claude', token: 'load-test-token-not-a-real-one' })));
  const sandboxStarts = new Map();
  let gw;
  const notices = [];
  const bucket = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET' || req.method === 'HEAD') { const b = files.get(k); res.writeHead(b ? 200 : 404); return res.end(req.method === 'GET' ? b : undefined); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      files.set(k, Buffer.concat(chunks));
      res.writeHead(200); res.end();
      // S3 tells the function after the write, and may tell it twice.
      if (k.endsWith('/done.json')) {
        const tell = () => notices.push(gw.objectCreated(k).catch((e) => log(`done.json notice failed: ${e.message}`)));
        setTimeout(tell, between(50, 500));
        if (chaos) setTimeout(tell, between(100, 3000));
      }
    });
  });
  await new Promise((r) => bucket.listen(0, '127.0.0.1', r));
  const bucketUrl = `http://127.0.0.1:${bucket.address().port}`;
  const link = async (k) => `${bucketUrl}/${encodeURIComponent(k)}`;
  // A machine a session is on: sessions are spread over a few processes, as
  // one process may hold only 1024 files open.
  const hosts = await Promise.all(Array.from({ length: hostCount }, () => sandboxHost(tmp, coldStartMs)));
  const hostOf = (sid) => hosts[crypto.createHash('sha1').update(sid).digest()[0] % hosts.length];
  const ask = async (sid, body) => {
    const res = await fetch(`${hostOf(sid).url}/`, { method: 'POST', body: JSON.stringify({ sid, ...body }), headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(60_000) });
    return res.json();
  };
  const agentcore = {
    async invoke(sid, payload) {
      const out = await ask(sid, { payload });
      if (payload.action === 'start' && out.ok && !out.already) {
        const tag = /lt-start-(\S+);/.exec(payload.argv?.join(' ') || '')?.[1];
        if (tag) sandboxStarts.set(tag, (sandboxStarts.get(tag) || 0) + 1);
      }
      return out;
    },
    async stop(sid) { await ask(sid, { stop: true }); },
  };
  const makeGateway = () => createGateway({
    agentcore, links: { get: link, put: link, head: link }, removeObject: async (k) => { files.delete(k); }, objects: ledger,
    whoIs: async (t) => (t === 'load-test-session' ? { id: person } : null), log,
  });
  gw = makeGateway();
  await gw.admin({ do: 'plan', person, plan: 'max' });
  // The function URL. With chaos a call is sometimes dropped before the server
  // sees it, or after it did the work and before the answer left.
  const dropped = { before: 0, after: 0 };
  const calls = { total: 0, throttled: 0, peakInFlight: 0, inFlight: 0, since: Date.now() };
  let down = false;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      calls.total += 1;
      if (calls.inFlight >= concurrency) { calls.throttled += 1; res.writeHead(429, { 'content-type': 'application/json' }); return res.end('{"message":"Rate Exceeded."}'); }
      if (down || (chaos && Math.random() < 0.03)) { dropped.before += 1; return res.destroy(); }
      calls.inFlight += 1;
      calls.peakInFlight = Math.max(calls.peakInFlight, calls.inFlight);
      const u = new URL(req.url, 'http://x');
      const out = await gw.handle({ method: req.method, path: u.pathname + u.search, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }).finally(() => { calls.inFlight -= 1; });
      if (chaos && Math.random() < 0.03) { dropped.after += 1; return res.destroy(); }
      res.writeHead(out.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const made = await fetch(`${url}/v1/devices`, { method: 'POST', headers: { authorization: 'Bearer load-test-session', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'load test', acceptedTerms: TERMS_VERSION }), signal: AbortSignal.timeout(10_000) });
  const { key } = await made.json();
  return {
    url, key, sandboxStarts, dropped,
    /** Calls to the function since the last reading, and the most at once. */
    callsTaken() {
      const out = { perSecond: +(calls.total / ((Date.now() - calls.since) / 1000)).toFixed(1), throttled: calls.throttled, peakInFlight: calls.peakInFlight };
      Object.assign(calls, { total: 0, throttled: 0, peakInFlight: calls.inFlight, since: Date.now() });
      return out;
    },
    // The server dies for `ms` and comes back as a new one, as a Lambda instance does.
    async restart(ms = 3000) { down = true; await sleep(ms); gw = makeGateway(); down = false; },
    async settle() { await Promise.all(notices); await gw.sweep(); },
    async live() { return Object.keys(JSON.parse((await mem.get(`ledger/people/${person}.json`)).body).live).length; },
    async machines() { return (await Promise.all(hosts.map(async (h) => (await (await fetch(`${h.url}/`, { method: 'POST', body: '{"count":true}', signal: AbortSignal.timeout(10_000) })).json()).machines))).reduce((a, b) => a + b, 0); },
    async close() {
      for (const h of hosts) h.child.kill('SIGTERM');
      for (const s of [bucket, server]) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
    },
  };
}

/** A process holding sandboxes, one per session, made on a session's first call after a cold start. */
async function sandboxHost(tmp, coldStartMs) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--sandbox-host', tmp, JSON.stringify(coldStartMs)], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; const m = /port (\d+)/.exec(buf); if (m) resolve(Number(m[1])); });
    child.on('exit', (code) => reject(new Error(`a sandbox host ended (${code})`)));
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function hostSandboxes(tmp, coldStartMs) {
  const sandboxes = new Map();
  const sandboxFor = (sid) => {
    if (!sandboxes.has(sid)) {
      sandboxes.set(sid, (async () => {
        await sleep(between(...coldStartMs));
        const root = fs.mkdtempSync(path.join(tmp, 'vm-'));
        const sb = createSandbox({ workRoot: path.join(root, 'work'), pathRoot: path.join(root, 'fs'), bridgeSocket: path.join(root, 'b.sock') });
        return { sb, root };
      })());
    }
    return sandboxes.get(sid);
  };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      let out;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (body.count) out = { machines: sandboxes.size };
        else if (body.stop) {
          const s = sandboxes.get(body.sid);
          sandboxes.delete(body.sid);
          if (s) { const { sb, root } = await s; await sb.close(); fs.rmSync(root, { recursive: true, force: true }); }
          out = { ok: true };
        } else out = await (await sandboxFor(body.sid)).sb.handle(body.payload);
      } catch (err) { out = { ok: false, error: 'internal', message: err.message }; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  server.listen(0, '127.0.0.1', () => console.log(`port ${server.address().port}`));
}

// THE REAL CLOUD. Everything AWS is asked of the `aws` command, signed in as an admin.
const aws = (args) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || 'null');
const FUNCTION = 'agentbox-gateway';

/** The account's limits that a burst of runs could meet first. */
export function awsLimits() {
  const out = {};
  try { const a = aws(['lambda', 'get-account-settings']).AccountLimit; out.lambdaAccountConcurrency = a.ConcurrentExecutions; out.lambdaUnreserved = a.UnreservedConcurrentExecutions; } catch (e) { out.lambdaAccountConcurrency = `unreadable: ${e.message.split('\n')[0]}`; }
  try { out.gatewayReserved = aws(['lambda', 'get-function-concurrency', '--function-name', FUNCTION])?.ReservedConcurrentExecutions ?? 'none'; } catch (e) { out.gatewayReserved = `unreadable: ${e.message.split('\n')[0]}`; }
  try {
    const q = aws(['service-quotas', 'list-service-quotas', '--service-code', 'bedrock-agentcore']).Quotas || [];
    out.agentcore = q.filter((x) => /runtime|session|invoke/i.test(x.QuotaName)).map((x) => `${x.QuotaName}: ${x.Value}`);
  } catch (e) { out.agentcore = `unreadable: ${e.message.split('\n')[0]}`; }
  return out;
}

/** A throwaway account on Max with a placeholder Claude sign-in, and its cloud key. */
export async function liveAccount({ say = () => {} } = {}) {
  const env = aws(['lambda', 'get-function-configuration', '--function-name', FUNCTION]).Environment.Variables;
  const secret = JSON.parse(aws(['secretsmanager', 'get-secret-value', '--secret-id', env.SUPABASE_SERVICE_SECRET_ARN]).SecretString);
  const supabase = CLOUD_ADDRESS.supabaseUrl;
  const email = `load-test-${Date.now()}@example.com`;
  const password = crypto.randomBytes(24).toString('base64url');
  const admin = { apikey: secret.serviceKey, authorization: `Bearer ${secret.serviceKey}`, 'content-type': 'application/json' };
  const made = await (await fetch(`${supabase}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }), signal: AbortSignal.timeout(15_000) })).json();
  if (!made?.id) throw new Error(`the database did not make the test account: ${JSON.stringify(made).slice(0, 200)}`);
  const session = await (await fetch(`${supabase}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: CLOUD_ADDRESS.anonKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15_000) })).json();
  const device = await (await fetch(`${CLOUD_ADDRESS.gateway}/v1/devices`, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'load test', acceptedTerms: TERMS_VERSION }), signal: AbortSignal.timeout(30_000) })).json();
  if (!device?.key) throw new Error(`the cloud server gave no key: ${JSON.stringify(device).slice(0, 200)}`);
  const invokeAdmin = (event) => {
    const out = path.join(os.tmpdir(), `lt-admin-${process.pid}.json`);
    execFileSync('aws', ['lambda', 'invoke', '--region', 'us-east-1', '--function-name', FUNCTION, '--cli-binary-format', 'raw-in-base64-out', '--payload', JSON.stringify(event), out], { stdio: ['ignore', 'ignore', 'inherit'] });
    const answer = fs.readFileSync(out, 'utf8'); fs.rmSync(out, { force: true }); return answer;
  };
  invokeAdmin({ admin: { do: 'plan', person: made.id, plan: 'max' } });
  const tmpLogin = path.join(os.tmpdir(), `lt-login-${process.pid}.json`);
  fs.writeFileSync(tmpLogin, JSON.stringify({ engine: 'claude', token: 'load-test-token-not-a-real-one' }));
  execFileSync('aws', ['s3', 'cp', tmpLogin, `s3://${env.BUCKET}/logins/u-${made.id}/claude/load-test.json`, '--region', 'us-east-1'], { stdio: ['ignore', 'ignore', 'inherit'] });
  fs.rmSync(tmpLogin, { force: true });
  say(`test account ${made.id} is on Max`);
  return {
    person: made.id, url: CLOUD_ADDRESS.gateway, key: device.key,
    async me() { return (await fetch(`${CLOUD_ADDRESS.gateway}/v1/me`, { headers: { authorization: `Bearer ${device.key}` }, signal: AbortSignal.timeout(30_000) })).json(); },
    async close() {
      invokeAdmin({ admin: { do: 'disable', person: made.id } });
      await fetch(`${supabase}/auth/v1/admin/users/${made.id}`, { method: 'DELETE', headers: admin, signal: AbortSignal.timeout(15_000) }).catch(() => {});
      say(`test account ${made.id} disabled and deleted`);
    },
  };
}

function args(argv) {
  const get = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
  return {
    live: argv.includes('--live'), standin: argv.includes('--standin'), chaos: argv.includes('--chaos'), chatty: argv.includes('--chatty'),
    concurrency: Number(get('--concurrency', 200)),
    steps: String(get('--steps', '10,25,50,100,200')).split(',').map(Number).filter((x) => x > 0),
    seconds: get('--seconds', null), starting: Number(get('--starting', 8)),
  };
}

const ROW = ['n', 'peak', 'finished', 'lost', 'doubled', 'slowestStartS', 'medianStartS', 'agentHours', 'dollars'];
const HEAD = ['at once', 'most running', 'finished', 'lost', 'doubled', 'slowest start s', 'median start s', 'agent-hours', 'cost $'];

async function main() {
  const o = args(process.argv.slice(2));
  if (o.live === o.standin) throw new Error('say --standin or --live');
  const say = (m) => console.log(m);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-load-'));
  // Long enough that every run of a step is running at the same time.
  const secondsFor = (n) => Number(o.seconds ?? 60 + Math.ceil(n / o.starting) * 8);
  const most = o.steps.reduce((s, n) => s + n * (secondsFor(n) + 60), 0) / 3600;
  if (o.live) {
    say(`at most about ${most.toFixed(1)} agent-hours, about $${(most * DOLLARS_PER_AGENT_HOUR).toFixed(2)} at $${DOLLARS_PER_AGENT_HOUR} an agent-hour`);
    say(`limits: ${JSON.stringify(awsLimits())}`);
  }
  const rows = [];
  let cloud = null;
  try {
    cloud = o.live ? await liveAccount({ say }) : await standinCloud({ tmp, chaos: o.chaos, concurrency: o.concurrency, log: () => {} });
    const clients = managedClients({ url: cloud.url, key: cloud.key });
    for (const n of o.steps) {
      say(`step ${n}: ${n} runs of ${secondsFor(n)} s, ${o.starting} starting at once${o.chatty ? ', a line a second' : ''}${o.chaos ? ', with chaos' : ''}`);
      cloud.callsTaken?.();
      const during = o.chaos && cloud.restart ? async () => { await sleep(between(5_000, 20_000)); say('  killing the server for 3 s'); await cloud.restart(3000); } : undefined;
      const { tally } = await runStep({ n, seconds: secondsFor(n), chatty: o.chatty, starting: o.starting, clients, tmp, sandboxStarts: cloud.sandboxStarts, during, say });
      if (cloud.settle) await cloud.settle();
      if (cloud.live) tally.leftInLedger = await cloud.live();
      if (cloud.machines) tally.machinesLeft = await cloud.machines();
      if (cloud.me) tally.leftInLedger = (await cloud.me())?.running;
      if (cloud.dropped) tally.callsDropped = { ...cloud.dropped };
      if (cloud.callsTaken) tally.calls = cloud.callsTaken();
      rows.push(tally);
      say(`  ${JSON.stringify(tally)}`);
      if (tally.lost || tally.doubled) { say(`  step ${n} lost or doubled runs; stopping here`); break; }
    }
  } finally {
    await cloud?.close().catch((e) => say(`could not clean up: ${e.message}`));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  say(`\n| ${HEAD.join(' | ')} |\n|${HEAD.map(() => '---').join('|')}|`);
  for (const r of rows) say(`| ${ROW.map((k) => r[k] ?? '—').join(' | ')} |`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url) && process.argv[2] === '--sandbox-host') {
  hostSandboxes(process.argv[3], JSON.parse(process.argv[4]));
} else if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`cloud-load-test: ${err.stack || err.message}`); process.exit(1); });
}
