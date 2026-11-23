#!/usr/bin/env node
// THE IPHONE'S HANDS, ON GITHUB'S MAC (.github/workflows/iphone-for-testers.yml).
//
//   node iphone-host.mjs --udid <simulator> --bundle <app id> --ticket <sha256 of the key>
//                        [--port 8790] [--stop-file <path>] [--idle-minutes 40]
//
// One tester's phone commands arrive here over the tunnel and are done on the
// simulator with AXe and simctl. Only a request carrying the key whose sha256
// is --ticket gets an answer; the ticket alone is in the public run, the key
// never leaves the tester's computer. Nothing a screen shows is printed, as
// the run's log is public.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseTree, readScreen, lookText, pickThing, swipePoints, keyCode } from './lib/iphone-screen.mjs';

export function keyFits(header, ticket) {
  const key = String(header ?? '').replace(/^Bearer\s+/i, '');
  if (!key || !/^[0-9a-f]{64}$/i.test(String(ticket))) return false;
  const got = crypto.createHash('sha256').update(key).digest();
  return crypto.timingSafeEqual(got, Buffer.from(String(ticket), 'hex'));
}

/** Runs a program to its end or to `ms`, whichever is first. */
export function run(cmd, args, { ms = 30_000, input = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${path.basename(cmd)} ${args[0]} took over ${ms / 1000} seconds`)); }, ms);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(cmd)} ${args[0]} failed: ${(err || out).trim().slice(-400)}`));
    });
    child.stdin.end(input ?? '');
  });
}

export function makeHost({ udid, bundle, ticket, axe = 'axe', xcrun = 'xcrun', settleMs = 700, openMs = 2500 }) {
  let things = [];
  let size = null;
  const ax = (args, opts) => run(axe, [...args, '--udid', udid], opts);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const look = async () => {
    const screen = readScreen(parseTree(await ax(['describe-ui'])));
    things = screen.things; size = screen.size;
    return lookText(screen);
  };
  const settled = async (ms = settleMs) => { await wait(ms); return { text: await look() }; };
  const launch = async () => {
    await run(xcrun, ['simctl', 'terminate', udid, bundle]).catch(() => {});
    await run(xcrun, ['simctl', 'launch', udid, bundle]);
    return settled(openMs);
  };

  const verbs = {
    open: launch,
    reload: launch,
    look: async () => ({ text: await look() }),
    tap: async (args) => {
      const arg = args.join(' ');
      let t = pickThing(things, arg);
      if (!t) { await look(); t = pickThing(things, arg); }
      if (!t) return { error: `Nothing to tap called ${arg}. Look again.` };
      await ax(['tap', '-x', String(Math.round(t.x)), '-y', String(Math.round(t.y))]);
      return settled();
    },
    type: async (args) => { await ax(['type', '--stdin'], { input: args.join(' ') }); return settled(); },
    press: async (args) => {
      const code = keyCode(args[0]);
      if (code === null) return { error: `No key called ${args[0]}. Try Enter, Backspace, Escape, Tab or Space.` };
      await ax(['key', String(code)]);
      return settled();
    },
    swipe: async (args) => {
      if (!size) await look();
      const p = swipePoints(size, args[0]);
      if (!p) return { error: 'swipe up, down, left or right.' };
      await ax(['swipe', '--start-x', String(p.from[0]), '--start-y', String(p.from[1]), '--end-x', String(p.to[0]), '--end-y', String(p.to[1])]);
      return settled();
    },
    home: async () => { await ax(['button', 'home']); return settled(); },
    shot: async () => {
      const file = path.join(os.tmpdir(), `iphone-shot-${process.pid}-${Date.now()}.png`);
      await run(xcrun, ['simctl', 'io', udid, 'screenshot', '--type=png', file]);
      const png = fs.readFileSync(file).toString('base64');
      fs.rmSync(file, { force: true });
      return { png };
    },
  };

  // One finger: a command waits for the one before it to finish.
  let queue = Promise.resolve();
  const perform = (verb, args) => {
    const job = queue.then(async () => {
      if (!verbs[verb]) return { error: `No such command: ${verb}.` };
      try { return await verbs[verb](args ?? []); } catch (err) { return { error: err.message }; }
    });
    queue = job.catch(() => {});
    return job;
  };
  return { perform, keyFits: (header) => keyFits(header, ticket) };
}

export function serve(host, { port = 8790, onStop = () => {}, idleMs = 40 * 60_000, now = Date.now } = {}) {
  let last = now();
  const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const server = http.createServer((req, res) => {
    if (!host.keyFits(req.headers.authorization)) return send(res, 401, { error: 'This phone is someone else\'s.' });
    last = now();
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/hello') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/stop') { send(res, 200, { ok: true }); return onStop('asked'); }
    if (req.method !== 'POST' || url.pathname !== '/do') return send(res, 404, { error: 'not here' });
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      let ask;
      try { ask = JSON.parse(body); } catch { return send(res, 400, { error: 'not JSON' }); }
      const started = now();
      const answer = await host.perform(String(ask.verb ?? ''), Array.isArray(ask.args) ? ask.args.map(String) : []);
      console.log(`${new Date().toISOString()} ${ask.verb} ${answer.error ? 'failed' : 'ok'} in ${now() - started} ms`);
      send(res, 200, answer);
    });
  });
  const idle = setInterval(() => { if (now() - last > idleMs) onStop('idle'); }, 30_000);
  idle.unref();
  server.on('close', () => clearInterval(idle));
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, f = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
  const udid = opt('udid'); const bundle = opt('bundle'); const ticket = opt('ticket');
  if (!udid || !bundle || !/^[0-9a-f]{64}$/i.test(String(ticket))) { console.error('iphone-host: --udid, --bundle and a 64-character --ticket are needed'); process.exit(2); }
  const stopFile = opt('stop-file');
  const host = makeHost({ udid, bundle, ticket, axe: process.env.IPHONE_AXE || 'axe', xcrun: process.env.IPHONE_XCRUN || 'xcrun' });
  const server = await serve(host, {
    port: Number(opt('port', 8790)),
    idleMs: Number(opt('idle-minutes', 40)) * 60_000,
    onStop: (why) => {
      console.log(`stopping: ${why === 'idle' ? 'nobody used the phone for a while' : 'the tester is done'}`);
      if (stopFile) fs.writeFileSync(stopFile, why);
      server.close();
      setTimeout(() => process.exit(0), 500).unref();
    },
  });
  console.log(`the iPhone's hands are listening on ${server.address().port}`);
}
