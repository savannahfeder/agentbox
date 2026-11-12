// TASK TERMINALS OUTLIVE THE APP. This process holds the shells. It is started
// detached, so quitting or restarting the app leaves them running; restarting
// the computer ends them like everything else. The app reconnects when it starts.
//
// Lines of JSON over a socket only this user can reach: `{id, op, args}` in,
// `{id, value}` or `{id, error}` back. The ops are TaskTerminals' own.
// With no terminal and no app connected for a minute it ends itself.
//
//   ELECTRON_RUN_AS_NODE=1 <electron> main/terminal-host.mts <socket>
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nameSlug } from '../shared/product-name.mjs';
import type { TaskTerminals } from './task-terminals.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The app talks to any host speaking this, whichever version started it, so
// the terminals an older app left are still reachable after an update. Change
// it only with a client that still speaks the old one.
export const PROTOCOL = 1;
// A host started by older code keeps the terminals it has; new terminals open
// in a host made of the code the app is running now.
const MADE_OF = ['terminal-host.mts', 'task-terminals.mts', '../shared/terminal-state.mts'];
export const HOST_ALREADY_THERE = 3;
export type HostOp = 'open' | 'read' | 'write' | 'resize' | 'close' | 'end' | 'list';

/** One line from the app: the call to make and the number its answer comes back under. */
export interface HostRequest {
  id: number;
  op: string;
  args?: unknown[];
}

export interface ServeTerminalsOptions {
  sockPath: string;
  terminals: Pick<TaskTerminals, HostOp | 'sessions'>;
  stamp?: string;
  idleMs?: number;
  onIdle?: () => void;
  log?: (message: string) => void;
}

const OPS = new Set(['open', 'read', 'write', 'resize', 'close', 'end', 'list']);

export function terminalHostStamp(): string {
  const h = crypto.createHash('sha1');
  for (const f of MADE_OF) { try { h.update(fs.readFileSync(path.join(HERE, f))); } catch { h.update(f); } }
  return h.digest('hex').slice(0, 12);
}

const prefix = (uid: number) => `${nameSlug}-terminals-${uid}-`;

// Short enough for a socket's path (104 bytes on macOS), and this user's own.
export function terminalHostSocket({ stamp = terminalHostStamp(), dir = os.tmpdir(), uid = process.getuid?.() ?? 0 }: { stamp?: string; dir?: string; uid?: number } = {}): string {
  return path.join(dir, `${prefix(uid)}${stamp}.sock`);
}

/** Every host socket of this user's, newest code or not. */
export function terminalHostSockets({ dir = os.tmpdir(), uid = process.getuid?.() ?? 0 }: { dir?: string; uid?: number } = {}): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.startsWith(prefix(uid)) && f.endsWith('.sock')).map((f) => path.join(dir, f));
  } catch { return []; }
}

export function serveTerminals({ sockPath, terminals, stamp = terminalHostStamp(), idleMs = 60_000, onIdle = () => {}, log = () => {} }: ServeTerminalsOptions) {
  let clients = 0;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const idle = () => {
    clearTimeout(idleTimer!);
    if (clients || terminals.sessions.size) return;
    idleTimer = setTimeout(() => { if (!clients && !terminals.sessions.size) onIdle(); }, idleMs);
    idleTimer.unref?.();
  };
  const watch = setInterval(idle, idleMs);
  watch.unref?.();
  const answer = async ({ op, args = [] }: HostRequest) => {
    if (op === 'hello') return { protocol: PROTOCOL, stamp, pid: process.pid };
    if (!OPS.has(op)) throw new Error(`Unknown terminal action: ${op}`);
    // The host cannot read the store, so it never works out a folder itself:
    // a terminal it no longer has is one the app opens afresh.
    if (op === 'open' && !args[1] && !terminals.sessions.has(args[0] as string)) throw new Error('Terminal session ended. Open a new terminal to continue.');
    return (terminals[op as HostOp] as (...args: unknown[]) => unknown)(...args);
  };
  const server = net.createServer((sock) => {
    clients += 1;
    clearTimeout(idleTimer!);
    let buf = '';
    const send = (msg: unknown) => { if (!sock.destroyed) sock.write(`${JSON.stringify(msg)}\n`); };
    sock.setEncoding('utf8');
    sock.on('data', (d) => {
      buf += d;
      let n: number;
      while ((n = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, n);
        buf = buf.slice(n + 1);
        let msg: HostRequest;
        try { msg = JSON.parse(line); } catch { continue; }
        Promise.resolve().then(() => answer(msg))
          .then((value) => send({ id: msg.id, value: value ?? null }), (err) => send({ id: msg.id, error: String(err?.message ?? err) }));
      }
    });
    sock.on('close', () => { clients -= 1; idle(); });
    sock.on('error', () => {});
  });
  server.on('error', (err) => log(`terminal host: ${err.message}`));
  // Node deletes the path a server listened on as it closes, so it listens on
  // a name of its own and moves it into place, and on the way out takes away
  // only a socket that is still its own.
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
        try { fs.chmodSync(own, 0o600); fs.renameSync(own, sockPath); mine = fs.statSync(sockPath).ino; } catch (err) { log(`terminal host: ${(err as Error).message}`); }
        idle();
        resolve('serving');
      });
    });
  });
  return {
    server,
    started,
    close: () => started.then(() => new Promise<void>((resolve) => {
      clearTimeout(idleTimer!);
      clearInterval(watch);
      if (ours()) { try { fs.unlinkSync(sockPath); } catch { /* gone */ } }
      if (server.listening) server.close(() => resolve()); else resolve();
    })),
  };
}

// Started as a program by the app (main/terminal-hosts.mts).
if (path.basename(process.argv[1] || '') === 'terminal-host.mts') {
  const sockPath = process.argv[2];
  // Loaded before the socket opens, so a host that cannot make a shell never
  // answers and the app keeps its terminals itself.
  (await import('./pty.mts')).loadPty();
  const { TaskTerminals } = await import('./task-terminals.mts');
  const { readMacPressureWord } = await import('./leftovers.mts');
  const { TERMINAL_LINES } = await import('./memory-gate.mts');
  const readPressure = () => readMacPressureWord(TERMINAL_LINES);
  const terminals = new TaskTerminals({ readPressure: process.platform === 'darwin' ? readPressure : null });
  const host = serveTerminals({
    sockPath,
    terminals,
    onIdle: () => host.close().then(() => process.exit(0)),
    log: (m) => process.stderr.write(`${m}\n`),
  });
  if (await host.started === 'taken') process.exit(HOST_ALREADY_THERE);
  // One shell's stray error is that shell's, not every terminal's.
  process.on('uncaughtException', (err) => process.stderr.write(`terminal host: ${err?.stack || err}\n`));
  process.on('unhandledRejection', (err) => process.stderr.write(`terminal host: ${(err as Error)?.stack || err}\n`));
  // The app going is not a reason to end, and nor is the terminal it ran from.
  process.on('SIGHUP', () => {});
}
