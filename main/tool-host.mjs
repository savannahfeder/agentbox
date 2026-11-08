// ONE PROCESS SERVES THE STORE TOOLS TO EVERY LOCAL AGENT.
//
// Each Claude Code run used to start a store server of its own over stdio,
// 42 MB a run (measured 2026-11-06). This host is started detached by the app,
// like the run host, and serves the store over HTTP on 127.0.0.1 to every run
// it is given a pass for. A pass is a file in this host's folder, named by a
// random token, holding the run's thread and the environment its server would
// have been started with. The run's end deletes it (it is one of the run's
// spawn files), and that ends the run's sessions here and gives its claims
// back, as they were when its own server exited.
//
// The approvals server stays one per run over stdio. Over HTTP, Claude Code
// dropped a question waiting longer than about ten minutes even with progress
// messages and MCP_TOOL_TIMEOUT set, and a question can wait for hours.
//
//   ELECTRON_RUN_AS_NODE=1 <electron> main/tool-host.mjs <folder> <app pid>
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { nameSlug } from '../shared/product-name.mjs';

export const TOOL_HOST_ALREADY_THERE = 3;
const TOKEN = /^[a-f0-9]{64}$/;
const KINDS = ['store'];

/** This app launch's host folder. Each launch has its own, so a run is always served the code of the app that started it. */
export function toolHostDir({ appPid = process.pid, dir = os.tmpdir(), uid = process.getuid?.() ?? 0 } = {}) {
  return path.join(dir, `${nameSlug}-tools-${uid}-${appPid}`);
}

const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === 'EPERM'; }
};

/** The host serving `dir`, or null when none is: read from its port file, its process checked alive. */
export function readToolHost(dir) {
  try {
    const at = JSON.parse(fs.readFileSync(path.join(dir, 'host.json'), 'utf8'));
    return Number.isInteger(at?.port) && alive(at.pid) ? at : null;
  } catch { return null; }
}

/**
 * Rewrites one run's MCP config so its store server is reached at the host,
 * and writes the run's pass. Returns the pass's path, which the run must
 * delete when it ends, or null when the config was left as it was.
 */
export function shareToolServers(configFile, { dir, item, product, storeServer }) {
  const host = readToolHost(dir);
  if (!host) return null;
  let config;
  try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return null; }
  const store = config?.mcpServers?.[storeServer];
  if (!store?.command) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const pass = path.join(dir, 'passes', token);
  try {
    fs.writeFileSync(pass, JSON.stringify({ item: item ?? null, product: product ?? null, env: store.env ?? {} }), { mode: 0o600, flag: 'wx' });
  } catch { return null; }
  config.mcpServers[storeServer] = { type: 'http', url: `http://127.0.0.1:${host.port}/store`, headers: { Authorization: `Bearer ${token}` } };
  try { fs.writeFileSync(configFile, JSON.stringify(config)); } catch {
    fs.rmSync(pass, { force: true });
    return null;
  }
  return pass;
}

/**
 * The host itself. `servers.store` serves one session over line streams and
 * returns `{ close }`.
 */
export function serveTools({ dir, appPid, servers, idleMs = 10 * 60_000, orphanMs = 24 * 60 * 60_000, keepaliveMs = 20_000, checkMs = 5_000, log = () => {}, onIdle = () => {} }) {
  const passes = path.join(dir, 'passes');
  fs.mkdirSync(passes, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const sessions = new Map();
  let quietSince = Date.now();
  let inflight = 0;

  const readPass = (token) => {
    if (!TOKEN.test(token)) return null;
    try { return JSON.parse(fs.readFileSync(path.join(passes, token), 'utf8')); } catch { return null; }
  };

  const open = (kind, token, pass) => {
    // One store and one account for every run on this Mac, read from the
    // environment as each server of its own read it.
    for (const [k, v] of Object.entries(pass.env ?? {})) { if (typeof v === 'string') process.env[k] = v; }
    const input = new PassThrough();
    const output = new PassThrough();
    const s = { id: crypto.randomUUID(), kind, token, input, output, waiting: new Map(), handle: null, closed: false, buf: '' };
    output.setEncoding('utf8');
    output.on('data', (d) => {
      s.buf += d;
      for (let n; (n = s.buf.indexOf('\n')) >= 0;) {
        const line = s.buf.slice(0, n);
        s.buf = s.buf.slice(n + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg?.id !== undefined && ('result' in msg || 'error' in msg)) s.waiting.get(msg.id)?.(msg);
      }
    });
    const env = { ...process.env, ...pass.env, ZERO_ITEM: pass.item ?? '', ZERO_PRODUCT: pass.product ?? '' };
    Promise.resolve(servers[kind]({ input, output, env, holder: `mcp-${process.pid}-${token.slice(0, 8)}`, ownItem: pass.item ?? null, ownProduct: pass.product ?? null }))
      .then((h) => { s.handle = h; if (s.closed) h?.close?.(); })
      .catch((err) => { log(`tool host: the ${kind} server would not start: ${err?.message ?? err}`); close(s); });
    sessions.set(s.id, s);
    return s;
  };

  const close = (s) => {
    if (s.closed) return;
    s.closed = true;
    sessions.delete(s.id);
    for (const answer of s.waiting.values()) answer(null);
    s.waiting.clear();
    Promise.resolve(s.handle?.close?.()).catch(() => {});
    s.input.end();
  };

  const server = http.createServer((req, res) => {
    quietSince = Date.now();
    const kind = KINDS.find((k) => req.url === `/${k}`);
    if (!kind) { res.writeHead(404).end(); return; }
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
    // Not 401: a 401 sends Claude Code off to look for a sign-in page.
    const pass = readPass(token);
    if (!pass) { res.writeHead(403).end(); return; }
    const sid = req.headers['mcp-session-id'];
    // A session ends with its run's pass, not when a client lets go of it:
    // the store's claims are the run's, and a client that reconnects mid-run
    // must not give them back.
    if (req.method === 'DELETE') { res.writeHead(200).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST, DELETE' }).end(); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      const msgs = Array.isArray(parsed) ? parsed : [parsed];
      let s = sid ? sessions.get(sid) : null;
      if (sid && (!s || s.token !== token || s.kind !== kind)) { res.writeHead(404).end(); return; }
      if (!s) {
        if (!msgs.some((m) => m?.method === 'initialize')) { res.writeHead(400).end(); return; }
        s = open(kind, token, pass);
      }
      const asks = msgs.filter((m) => m && m.method && m.id !== undefined);
      const answers = asks.map((m) => new Promise((resolve) => s.waiting.set(m.id, (a) => { s.waiting.delete(m.id); resolve(a); })));
      for (const m of msgs) s.input.write(`${JSON.stringify(m)}\n`);
      if (!asks.length) { res.writeHead(202, { 'mcp-session-id': s.id }).end(); return; }
      // Claude Code drops an HTTP call that has said nothing for 300 s, and only
      // a progress message counts as saying something; a comment line keeps
      // any other client's connection open.
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'mcp-session-id': s.id });
      res.flushHeaders();
      inflight += 1;
      const tokens = asks.map((m) => m.params?._meta?.progressToken).filter((t) => t !== undefined);
      let ticks = 0;
      const beat = setInterval(() => {
        ticks += 1;
        if (!tokens.length) { res.write(': \n\n'); return; }
        for (const progressToken of tokens) res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken, progress: ticks } })}\n\n`);
      }, keepaliveMs);
      res.on('close', () => { clearInterval(beat); inflight -= 1; quietSince = Date.now(); });
      Promise.all(answers).then((got) => {
        clearInterval(beat);
        for (const a of got) if (a) res.write(`event: message\ndata: ${JSON.stringify(a)}\n\n`);
        res.end();
      });
    });
  });
  server.requestTimeout = 0;
  server.on('error', (err) => log(`tool host: ${err.message}`));

  // A run whose pass is gone has ended. With its app gone, a host is done once
  // no run holds a pass, or after a day without a word: passes an app that
  // crashed never cleaned up. A question still waiting is a word.
  const sweep = setInterval(() => {
    for (const s of [...sessions.values()]) if (!fs.existsSync(path.join(passes, s.token))) close(s);
    let left = 0;
    try { left = fs.readdirSync(passes).length; } catch { /* gone */ }
    if (inflight) quietSince = Date.now();
    const quiet = Date.now() - quietSince;
    if (!alive(appPid) && ((!left && !sessions.size && quiet >= idleMs) || quiet >= orphanMs)) onIdle();
  }, checkMs);
  sweep.unref?.();

  const started = new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const file = path.join(dir, 'host.json');
      fs.writeFileSync(`${file}.${process.pid}`, JSON.stringify({ port: server.address().port, pid: process.pid }));
      fs.renameSync(`${file}.${process.pid}`, file);
      resolve(server.address().port);
    });
  });
  return {
    started,
    sessions: () => sessions.size,
    close: () => new Promise((resolve) => {
      clearInterval(sweep);
      for (const s of [...sessions.values()]) close(s);
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

async function main() {
  const [dir, appPidArg] = process.argv.slice(2);
  if (!dir) { console.error('usage: tool-host.mjs <folder> <app pid>'); process.exit(2); }
  if (readToolHost(dir)) process.exit(TOOL_HOST_ALREADY_THERE);
  const servers = {
    // Only when asked: the packaged app does not carry the store server.
    store: async ({ input, output, holder, ownItem, ownProduct }) => (await import('../mcp/stdio.mjs')).serveStore({ input, output, holder, ownItem, ownProduct }),
  };
  const host = serveTools({
    dir,
    appPid: Number(appPidArg),
    servers,
    log: (m) => console.error(`${new Date().toISOString()} ${m}`),
    onIdle: () => { host.close().finally(() => { fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); }); },
  });
  await host.started;
  const bye = () => host.close().finally(() => process.exit(0));
  process.on('SIGTERM', bye);
  process.on('SIGINT', bye);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`tool host: ${err?.message ?? err}`); process.exit(1); });
}
