// AN AGENT'S RUN OUTLIVES THE APP (w-2a5f57325e). This process holds each local
// Claude Code worker: it starts the worker, keeps its input open, and appends
// everything it prints to a spool file. It is started detached, so quitting or
// restarting the app leaves the worker, its helpers and its background jobs
// running; the restarted app attaches again and reads on from where it was.
//
// While no app is attached, the input is closed the way the app would close it
// (main/claude-input.mts, run here on the same stream), so a finished run ends
// rather than waiting for an app that may not come back.
//
// Lines of JSON over a socket only this user can reach. The first line says
// what the connection is for: `{op:'start', runId, bin, argv, env, cwd, spool}`,
// `{op:'attach', runId, out, err}` or `{op:'hello'}`. After that the app sends
// `{t:'i', d}` input, `{t:'I'}` end of input, `{t:'k', s}` a signal, `{t:'bye'}`
// to let go; this sends `{t:'started', pid}`, `{t:'state', ...}`, `{t:'o', d}`,
// `{t:'e', d}` and `{t:'x', code, signal, ended}`. Data is base64.
//
//   ELECTRON_RUN_AS_NODE=1 <electron> main/run-host.mts <socket> <spool folder>
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { nameSlug } from '../shared/product-name.mjs';
import { attachClaudeInput, type ClaudeInput, type HostInputState, type PipedChild } from './claude-input.mts';

export interface SpoolFiles {
  out: string;
  err: string;
  exit: string;
}

export interface RunStart {
  bin: string | null | undefined;
  argv: string[];
  env: Record<string, string | undefined>;
  cwd: string;
  spool?: string;
}

/** The first line on a connection, which says what it is for. */
export type RunHostRequest =
  | { op: 'hello'; t?: undefined }
  | ({ op: 'start'; runId: string; t?: undefined } & RunStart)
  | { op: 'attach'; runId: string; out: number | null; err: number | null; t?: undefined };

/** Every later line from the app. */
export type RunHostInput = { op?: undefined } & (
  | { t: 'i'; d: string }
  | { t: 'I' }
  | { t: 'k'; s: NodeJS.Signals }
  | { t: 'keep' }
  | { t: 'bye' }
);

export interface RunExit { code: number | null; signal: NodeJS.Signals | null; ended: boolean }

/** What the host says about a run. */
export type RunHostOutput =
  | { t: 'started'; pid?: number }
  | ({ t: 'state'; pid: number | null; from: { out: number; err: number } } & HostInputState)
  | { t: 'o' | 'e'; d: string }
  | ({ t: 'x' } & RunExit)
  | { t: 'gone' };

/** The answer to `{op:'hello'}`. */
export interface RunHostHello { protocol: number; stamp: string; pid: number }

type Send = (msg: RunHostOutput | RunHostHello) => void;

export interface ServeRunsOptions {
  sockPath: string;
  spoolDir: string;
  idleMs?: number;
  keepEndedMs?: number;
  onIdle?: () => void;
  log?: (message: string) => void;
  stamp?: string;
}

export interface RunHost {
  server: net.Server;
  started: Promise<'taken' | 'serving'>;
  runs(): number;
  close(): Promise<void>;
}

interface HeldRun {
  runId: string;
  files: SpoolFiles;
  out: number;
  err: number;
  client: true | null;
  clientSock?: net.Socket | null;
  clientSend?: Send | null;
  exit: RunExit | null;
  child: ChildProcessWithoutNullStreams | null;
  forgetTimer: NodeJS.Timeout | null;
  input?: PipedChild & ClaudeInput;
  inputClosed?: boolean;
  keep?: boolean;
}

/** The worker's stdin as the host's own input rule sees it: writes reach the worker only while no app is attached. */
interface GateInput {
  readonly writable: boolean;
  write(chunk: string | Buffer): boolean;
  end(): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

type InputGate = EventEmitter & { stdout: Readable; stdin: GateInput };

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The app attaches to any host speaking this, whichever version started it, so
// runs an older app left are still reachable after an update. Change it only
// with a client that still speaks the old one.
export const PROTOCOL = 1;
export const HOST_ALREADY_THERE = 3;
const MADE_OF = ['run-host.mts', 'claude-input.mts'];
// An ended run nobody attached to is forgotten after this.
const KEEP_ENDED_MS = 6 * 60 * 60 * 1000;

export function runHostStamp(): string {
  const h = crypto.createHash('sha1');
  for (const f of MADE_OF) { try { h.update(fs.readFileSync(path.join(HERE, f))); } catch { h.update(f); } }
  return h.digest('hex').slice(0, 12);
}

// Short enough for a socket's path (104 bytes on macOS), and this user's own.
export function runHostSocket({ stamp = runHostStamp(), dir = os.tmpdir(), uid = process.getuid?.() ?? 0 }: { stamp?: string; dir?: string; uid?: number } = {}): string {
  return path.join(dir, `${nameSlug}-runs-${uid}-${stamp}.sock`);
}

export const spoolFiles = (spoolDir: string, runId: string): SpoolFiles => ({
  out: path.join(spoolDir, `${runId}.out`),
  err: path.join(spoolDir, `${runId}.err`),
  exit: path.join(spoolDir, `${runId}.exit`),
});

const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(id);

export function serveRuns({ sockPath, spoolDir, idleMs = 60_000, keepEndedMs = KEEP_ENDED_MS, onIdle = () => {}, log = () => {}, stamp = runHostStamp() }: ServeRunsOptions): RunHost {
  fs.mkdirSync(spoolDir, { recursive: true, mode: 0o700 });
  const runs = new Map<string, HeldRun>();
  let clients = 0;
  let idleTimer: NodeJS.Timeout | undefined;
  const idle = () => {
    clearTimeout(idleTimer);
    if (clients || runs.size) return;
    idleTimer = setTimeout(() => { if (!clients && !runs.size) onIdle(); }, idleMs);
    idleTimer.unref?.();
  };

  const forget = (run: HeldRun) => {
    clearTimeout(run.forgetTimer ?? undefined);
    runs.delete(run.runId);
    for (const f of Object.values(run.files)) { try { fs.unlinkSync(f); } catch { /* gone */ } }
    idle();
  };

  // Each app names its own spool folder: copies of the app share one host.
  function startRun(sock: net.Socket, { runId, bin, argv, env, cwd, spool }: Extract<RunHostRequest, { op: 'start' }>, send: Send): void {
    const dirFor = typeof spool === 'string' && path.isAbsolute(spool) ? spool : spoolDir;
    let files: SpoolFiles | null = null;
    try {
      fs.mkdirSync(dirFor, { recursive: true, mode: 0o700 });
      files = spoolFiles(dirFor, runId);
      if (validId(runId)) for (const f of [files.out, files.err]) fs.writeFileSync(f, '', { mode: 0o600 });
    } catch (e) { log(`run host: ${(e as Error).message}`); files = null; }
    if (!files || !validId(runId) || runs.has(runId) || typeof bin !== 'string' || !Array.isArray(argv)) {
      send({ t: 'e', d: Buffer.from('agentbox: the run host was sent no run it could start\n').toString('base64') });
      send({ t: 'x', code: 75, signal: null, ended: false });
      sock.end();
      return;
    }
    const run: HeldRun = { runId, files, out: 0, err: 0, client: null, exit: null, child: null, forgetTimer: null };
    runs.set(runId, run);
    let child: ChildProcessWithoutNullStreams | null;
    try {
      child = spawn(bin, argv.map(String), { cwd, env: env && typeof env === 'object' ? env : {}, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      child = null;
      ended(run, { code: -2, signal: null, said: (err as Error | null)?.message ?? String(err) });
    }
    if (!child) { attach(run, sock, 0, 0, send); return; }
    run.child = child;
    // The app's own rule for closing input, run here on the same stream. Its
    // writes reach the worker only while no app is attached; an attached app
    // runs the same rule itself and says when.
    const gate = new EventEmitter() as InputGate;
    gate.stdout = child.stdout;
    gate.stdin = {
      get writable() { return child.stdin.writable; },
      write: (chunk) => { if (!run.client) child.stdin.write(chunk); return true; },
      end: () => {
        if (run.client) return false;
        run.inputClosed = true;
        child.stdin.end();
        return true;
      },
      on: (ev, fn) => child.stdin.on(ev, fn),
    };
    // attachClaudeInput reads only the child's stdin, stdout and events, which the gate has.
    run.input = attachClaudeInput(gate as PipedChild);
    child.stdin.on('error', () => {});
    for (const [stream, key, tag] of [[child.stdout, 'out', 'o'], [child.stderr, 'err', 'e']] as const) {
      stream.on('data', (b: Buffer) => {
        try { fs.appendFileSync(run.files[key], b); } catch (e) { log(`run host: ${(e as Error).message}`); }
        run[key] += b.length;
        run.clientSend?.({ t: tag, d: b.toString('base64') });
      });
    }
    child.on('error', (err) => { if (!run.exit) ended(run, { code: -2, signal: null, said: err?.message ?? String(err) }); });
    child.on('close', (code, signal) => {
      gate.emit('exit', code, signal);
      if (!run.exit) ended(run, { code, signal });
    });
    child.once('spawn', () => send({ t: 'started', pid: child.pid }));
    attach(run, sock, 0, 0, send, { fresh: true });
  }

  function ended(run: HeldRun, { code, signal, said = null }: { code: number | null; signal: NodeJS.Signals | null; said?: string | null }): void {
    if (said) {
      const b = Buffer.from(`${said}\n`);
      try { fs.appendFileSync(run.files.err, b); } catch { /* the message is still sent */ }
      run.err += b.length;
      run.clientSend?.({ t: 'e', d: b.toString('base64') });
    }
    // Ended only if input was closed here at a finished turn; an app that closed it knows already.
    run.exit = { code: Number.isInteger(code) ? code : null, signal: signal ?? null, ended: !!run.input?.ranToTheEnd?.() };
    try { fs.writeFileSync(run.files.exit, JSON.stringify(run.exit), { mode: 0o600 }); } catch { /* sent anyway */ }
    if (run.clientSend) { run.clientSend({ t: 'x', ...run.exit }); run.clientSock?.end(); forget(run); return; }
    run.forgetTimer = setTimeout(() => forget(run), keepEndedMs);
    run.forgetTimer.unref?.();
  }

  // What was printed since `out`/`err`, then everything as it comes.
  function attach(run: HeldRun, sock: net.Socket, out: number, err: number, send: Send, { fresh = false }: { fresh?: boolean } = {}): void {
    if (run.clientSock && run.clientSock !== sock) run.clientSock.destroy();
    run.client = true;
    run.clientSock = sock;
    // A negative position is "from now": the app did not save where it was.
    const from = { out: out >= 0 ? Math.min(out, run.out) : run.out, err: err >= 0 ? Math.min(err, run.err) : run.err };
    if (!fresh) {
      const s = run.input?.inputState?.() ?? null;
      send({ t: 'state', pid: run.child?.pid ?? null, from, ...(s ?? {}), closed: !!run.inputClosed });
    }
    for (const [key, tag] of [['out', 'o'], ['err', 'e']] as const) {
      if (!(from[key] < run[key])) continue;
      try {
        const fd = fs.openSync(run.files[key], 'r');
        try {
          const buf = Buffer.alloc(run[key] - from[key]);
          fs.readSync(fd, buf, 0, buf.length, from[key]);
          send({ t: tag, d: buf.toString('base64') });
        } finally { fs.closeSync(fd); }
      } catch (e) { log(`run host: ${(e as Error).message}`); }
    }
    run.clientSend = send;
    if (run.exit) { send({ t: 'x', ...run.exit }); sock.end(); forget(run); }
  }

  function detach(run: HeldRun, sock: net.Socket): void {
    if (run.clientSock !== sock) return;
    run.client = null;
    run.clientSock = null;
    run.clientSend = null;
    // Gone at a result with nothing left out: closed now, as the app would.
    run.input?.holdInput?.(false);
  }

  const server = net.createServer((sock) => {
    clients += 1;
    clearTimeout(idleTimer);
    let buf = '';
    let run: HeldRun | null = null;
    let first = true;
    const send: Send = (msg) => { if (!sock.destroyed) sock.write(`${JSON.stringify(msg)}\n`); };
    sock.setEncoding('utf8');
    sock.on('data', (d: string) => {
      buf += d;
      let n;
      while ((n = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, n);
        buf = buf.slice(n + 1);
        let msg: RunHostRequest | RunHostInput;
        try { msg = JSON.parse(line); } catch { continue; }
        if (first) {
          first = false;
          if (msg.op === 'hello') { send({ protocol: PROTOCOL, stamp, pid: process.pid }); continue; }
          if (msg.op === 'start') { startRun(sock, msg, send); run = runs.get(msg.runId)?.clientSock === sock ? runs.get(msg.runId)! : null; continue; }
          if (msg.op === 'attach') {
            run = runs.get(msg.runId) ?? null;
            if (!run) { send({ t: 'gone' }); sock.end(); continue; }
            attach(run, sock, Number.isFinite(msg.out) ? msg.out as number : -1, Number.isFinite(msg.err) ? msg.err as number : -1, send);
            continue;
          }
          sock.end();
          continue;
        }
        if (!run || run.clientSock !== sock || !run.child) continue;
        if (msg.t === 'i' && typeof msg.d === 'string') { try { run.child.stdin.write(Buffer.from(msg.d, 'base64')); } catch { /* exit says why */ } }
        else if (msg.t === 'I') { run.inputClosed = true; try { run.child.stdin.end(); } catch { /* gone */ } }
        else if (msg.t === 'k' && /^SIG(TERM|INT|HUP|KILL)$/.test(msg.s)) { try { run.child.kill(msg.s); } catch { /* gone */ } }
        else if (msg.t === 'keep') run.keep = true;
        else if (msg.t === 'bye') { run.keep = true; detach(run, sock); sock.end(); }
      }
    });
    // An app gone before it could find this run again would leave it running
    // unseen beside the run it starts next, so that run is stopped.
    sock.on('close', () => {
      clients -= 1;
      if (run && run.clientSock === sock && !run.keep && !run.exit) { try { run.child?.kill('SIGTERM'); } catch { /* gone */ } }
      if (run) detach(run, sock);
      idle();
    });
    sock.on('error', () => {});
  });
  server.on('error', (err) => log(`run host: ${err.message}`));
  // Node deletes the path a server listened on as it closes, so it listens on
  // a name of its own and moves it into place.
  let mine: number | null = null;
  const own = `${sockPath}.${process.pid}`;
  const ours = () => { try { return mine !== null && fs.statSync(sockPath).ino === mine; } catch { return false; } };
  const started = new Promise<'taken' | 'serving'>((resolve) => {
    const probe = net.connect(sockPath);
    const timer = setTimeout(() => { probe.destroy(); resolve('taken'); }, 2_000);
    probe.once('connect', () => { clearTimeout(timer); probe.destroy(); resolve('taken'); });
    probe.once('error', () => {
      clearTimeout(timer);
      try { fs.unlinkSync(own); } catch { /* not there */ }
      server.listen(own, () => {
        try { fs.chmodSync(own, 0o600); fs.renameSync(own, sockPath); mine = fs.statSync(sockPath).ino; } catch (err) { log(`run host: ${(err as Error).message}`); }
        idle();
        resolve('serving');
      });
    });
  });
  return {
    server,
    started,
    runs: () => runs.size,
    close: () => started.then(() => new Promise<void>((resolve) => {
      clearTimeout(idleTimer);
      if (ours()) { try { fs.unlinkSync(sockPath); } catch { /* gone */ } }
      if (server.listening) server.close(() => resolve()); else resolve();
    })),
  };
}

// Started as a program by the app (Supervisor#_runHost).
if (path.basename(process.argv[1] || '') === 'run-host.mts') {
  const [sockPath, spoolDir] = process.argv.slice(2);
  const host = serveRuns({
    sockPath,
    spoolDir,
    onIdle: () => host.close().then(() => process.exit(0)),
    log: (m) => process.stderr.write(`${new Date().toISOString()} ${m}\n`),
  });
  if (await host.started === 'taken') process.exit(HOST_ALREADY_THERE);
  process.on('uncaughtException', (err) => process.stderr.write(`run host: ${err?.stack || err}\n`));
  process.on('unhandledRejection', (err) => process.stderr.write(`run host: ${(err as Error | null)?.stack || err}\n`));
  // The app going is not a reason to end, and nor is the terminal it ran from.
  for (const sig of ['SIGHUP', 'SIGINT']) process.on(sig, () => {});
}
