// ONE PROCESS ON THIS MAC FOR EVERY CLOUD RUN'S RELAY (main/cloud/run.mjs).
// The supervisor holds, for each run, a stand-in of a few megabytes
// (scripts/cloud-shim.pl) that carries the run's input, output, signals and
// exit code here and back, so to the supervisor a cloud run is still one
// process.
//
// Lines over a socket only this user can reach. The stand-in sends a hello
// ({ argv, env, cwd, pid }), then `i <b64>` input, `I` end of input,
// `k <signal>`; this answers `o <b64>` output, `e <b64>` errors, `x <code>`.
// A stand-in that goes without saying (killed outright) is a run whose app
// has gone: it is left going in the cloud, as on a quit, and brought home
// later. With no run for a minute this process ends.
//
//   ELECTRON_RUN_AS_NODE=1 <electron> main/cloud/host.mjs <socket>
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { nameSlug } from '../../shared/product-name.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The files a host is made of. A host started by an older app serves only the
// stand-ins of that app: a newer one starts its own beside it.
const MADE_OF = ['host.mjs', 'run.mjs', 'run-cli.mjs', 'docs.mjs', 'exec.mjs', 'marker.mjs', 'aws.mjs', '../approval-prompt-core.mjs', '../../mcp/stdio.mjs', '../../mcp/tools.mjs'];
const TRANSPORT_FAULT = 75;
// The exit of a host that found one of this app's already serving its socket.
export const HOST_ALREADY_THERE = 3;
let hosts = 0;

// Whether this perl has every module the stand-in uses: some Linux perls ship
// without JSON::PP.
export function perlRunsTheShim(perl) {
  try {
    return spawnSync(perl, ['-MIO::Socket::UNIX', '-MIO::Select', '-MMIME::Base64', '-MJSON::PP', '-MCwd', '-MPOSIX', '-e1'], { stdio: 'ignore', timeout: 10_000 }).status === 0;
  } catch { return false; }
}

export function hostStamp() {
  const h = crypto.createHash('sha1');
  for (const f of MADE_OF) { try { h.update(fs.readFileSync(path.join(HERE, f))); } catch { h.update(f); } }
  return h.digest('hex').slice(0, 12);
}

// Short enough for a socket's path (104 bytes on macOS), and this user's own.
export function hostSocketPath({ stamp = hostStamp(), dir = os.tmpdir(), uid = process.getuid?.() ?? 0 } = {}) {
  return path.join(dir, `${nameSlug}-cloud-${uid}-${stamp}.sock`);
}

/**
 * Serves runs on `sockPath`; `runOne(opts)` is one run, resolving to its exit
 * code. `started` says 'serving', or 'taken' when a host already answers there.
 */
export function startCloudHost({ sockPath, runOne, idleMs = 60_000, onIdle = () => {}, log = () => {} }) {
  let live = 0;
  let idleTimer = null;
  const idle = () => {
    clearTimeout(idleTimer);
    if (live === 0) { idleTimer = setTimeout(() => { if (live === 0) onIdle(); }, idleMs); idleTimer.unref?.(); }
  };
  const server = net.createServer((sock) => {
    let buf = '';
    let started = false;
    let done = false;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const signals = new EventEmitter();
    const send = (line) => { if (!sock.destroyed) return sock.write(line + '\n'); return true; };
    // What the run prints goes out as it comes, never faster than the
    // stand-in takes it.
    for (const [stream, tag] of [[stdout, 'o'], [stderr, 'e']]) {
      stream.on('data', (b) => { if (send(`${tag} ${b.toString('base64')}`) === false && !sock.destroyed) { stream.pause(); sock.once('drain', () => stream.resume()); } });
    }
    const finish = (code) => {
      if (done) return;
      done = true;
      let open = 2;
      const both = () => { open -= 1; if (open === 0) { send(`x ${Number.isInteger(code) ? code : TRANSPORT_FAULT}`); sock.end(); live -= 1; idle(); } };
      stdout.once('end', both); stderr.once('end', both);
      stdout.end(); stderr.end();
      stdout.resume(); stderr.resume();
    };
    sock.setEncoding('utf8');
    sock.on('data', (d) => {
      buf += d;
      let n;
      while ((n = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, n);
        buf = buf.slice(n + 1);
        if (!started) {
          let hello = null;
          try { hello = JSON.parse(line); } catch { /* not a hello */ }
          if (!Array.isArray(hello?.argv) || typeof hello.cwd !== 'string') { send(`e ${Buffer.from('agentbox cloud: the stand-in sent no run\n').toString('base64')}`); send(`x ${TRANSPORT_FAULT}`); sock.end(); return; }
          started = true;
          live += 1;
          clearTimeout(idleTimer);
          Promise.resolve()
            .then(() => runOne({ args: hello.argv, env: hello.env || {}, cwd: hello.cwd, stdin, stdout, stderr, signals, pid: Number(hello.pid) || undefined, watchParent: false }))
            .then((code) => finish(code), (err) => { stderr.write(`agentbox cloud: stopped: ${err?.message || err}\n`); finish(TRANSPORT_FAULT); });
          continue;
        }
        if (line.startsWith('i ')) stdin.write(Buffer.from(line.slice(2), 'base64'));
        else if (line === 'I') stdin.end();
        else if (line.startsWith('k ') && /^SIG(TERM|INT|HUP)$/.test(line.slice(2))) signals.emit(line.slice(2));
      }
    });
    // Gone without a word: its app is gone, so the run carries on in the
    // cloud and is brought home when the app next opens.
    // Its output then goes nowhere, so a run held waiting for room is let go.
    sock.on('close', () => { stdout.resume(); stderr.resume(); if (started && !done) signals.emit('SIGHUP'); });
    sock.on('error', () => {});
  });
  server.on('error', (err) => log(`cloud host: ${err.message}`));
  // The socket file this host made. Ending, it takes away that one only: a
  // newer host may have put its own at the same path. Node deletes the path a
  // server listened on as it closes, so it listens on a name of its own and
  // moves it into place.
  let mine = null;
  const own = `${sockPath}.${process.pid}${(hosts += 1)}`;
  const ours = () => { try { return mine !== null && fs.statSync(sockPath).ino === mine; } catch { return false; } };
  const started = new Promise((resolve) => {
    const probe = net.connect(sockPath);
    probe.once('connect', () => { probe.destroy(); resolve('taken'); });
    probe.once('error', () => {
      try { fs.unlinkSync(own); } catch { /* not there */ }
      server.listen(own, () => {
        try { fs.chmodSync(own, 0o600); fs.renameSync(own, sockPath); mine = fs.statSync(sockPath).ino; } catch (err) { log(`cloud host: ${err.message}`); }
        idle();
        resolve('serving');
      });
    });
  });
  return {
    server,
    started,
    live: () => live,
    close: () => started.then(() => new Promise((resolve) => {
      clearTimeout(idleTimer);
      if (ours()) { try { fs.unlinkSync(sockPath); } catch { /* gone */ } }
      if (server.listening) server.close(() => resolve()); else resolve();
    })),
  };
}

// Started as a program by the supervisor (Supervisor#_cloudHost).
if (path.basename(process.argv[1] || '') === 'host.mjs') {
  const sockPath = process.argv[2];
  const { cloudRunFromArgs, dropAwsSignIns } = await import('./run-cli.mjs');
  dropAwsSignIns();
  const host = startCloudHost({
    sockPath,
    runOne: cloudRunFromArgs,
    onIdle: () => host.close().then(() => process.exit(0)),
    log: (m) => process.stderr.write(`${m}\n`),
  });
  if (await host.started === 'taken') process.exit(HOST_ALREADY_THERE);
  // A run's stray error is that run's, not every run's.
  process.on('uncaughtException', (err) => process.stderr.write(`cloud host: ${err?.stack || err}\n`));
  process.on('unhandledRejection', (err) => process.stderr.write(`cloud host: ${err?.stack || err}\n`));
}
