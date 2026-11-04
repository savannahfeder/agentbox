// THE APP'S SIDE OF ./terminal-host.mts: the same calls as TaskTerminals, each
// sent to whichever host holds that terminal. A new terminal opens in the host
// made of this app's code, started when there is none; one an older app left
// stays in the older host until it ends. If no host will start, terminals run
// inside the app as they used to, and the terminal's first line says so.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripTypesFlags } from './strip-types.mts';
import { PROTOCOL, HOST_ALREADY_THERE, terminalHostStamp, terminalHostSocket, terminalHostSockets } from './terminal-host.mts';
import { ENDED } from './task-terminals.mts';
import type { TaskTerminals, TerminalListing, TerminalPlaceSpec } from './task-terminals.mts';
import { SETTINGS_TERMINAL } from '../shared/settings-terminal.mts';
import { NAME } from '../shared/product-name.mjs';

const ENDED_SESSION = 'Terminal session ended. Open a new terminal to continue.';
// Closing a task ends its terminal this long after, so a Z that reopens it
// keeps the terminal.
export const CLOSE_GRACE_MS = 2 * 60_000;
// A host that would not start is not tried again for this long.
const RETRY_MS = 5 * 60_000;

/** Where a terminal's calls go: a host over a socket, or the app itself. */
export interface TerminalRoute {
  local?: boolean;
  closed?: boolean;
  call(op: string, ...args: unknown[]): Promise<unknown>;
}

export interface HostConnection extends TerminalRoute {
  sockPath: string;
  closed: boolean;
  close(): void;
}

/** What a started host process shows the app. */
export interface HostProcess {
  exitCode?: number | null;
}

export interface TerminalHostsOptions {
  local: TaskTerminals;
  stamp?: string;
  dir?: string;
  uid?: number;
  launch?: (sockPath: string, options: { logFile: string | null }) => HostProcess | null | undefined;
  connect?: (sockPath: string) => Promise<HostConnection>;
  logFile?: string | null;
  startMs?: number;
  now?: () => number;
  log?: (message: string) => void;
  platform?: NodeJS.Platform;
}

export function launchTerminalHost(sockPath: string, { logFile = null }: { logFile?: string | null } = {}) {
  const out = logFile ? fs.openSync(logFile, 'a') : 'ignore';
  try {
    const proc = spawn(process.execPath, [...stripTypesFlags(), fileURLToPath(new URL('./terminal-host.mts', import.meta.url)), sockPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      detached: true,
      stdio: ['ignore', out, out],
    });
    proc.on('error', () => {});
    proc.unref();
    return proc;
  } finally {
    if (typeof out === 'number') fs.closeSync(out);
  }
}

/** One socket to one host, every call with a deadline that ends it. */
export function connectTerminalHost(sockPath: string, { connectMs = 2_000, callMs = 5_000 }: { connectMs?: number; callMs?: number } = {}): Promise<HostConnection> {
  return new Promise<HostConnection>((resolve, reject) => {
    const sock = net.connect(sockPath);
    const pending = new Map<number, { res: (value: unknown) => void; rej: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    let next = 1;
    let buf = '';
    const conn: HostConnection = {
      sockPath,
      closed: false,
      call(op: string, ...args: unknown[]) {
        if (conn.closed) return Promise.reject(new Error(ENDED_SESSION));
        const id = next++;
        return new Promise<unknown>((res, rej) => {
          const timer = setTimeout(() => { pending.delete(id); rej(new Error('The terminal did not answer.')); }, callMs);
          pending.set(id, { res, rej, timer });
          sock.write(`${JSON.stringify({ id, op, args })}\n`);
        });
      },
      close() { sock.destroy(); },
    };
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('The terminal host did not answer.')); }, connectMs);
    sock.setEncoding('utf8');
    sock.once('connect', () => { clearTimeout(timer); resolve(conn); });
    sock.on('data', (d) => {
      buf += d;
      let n: number;
      while ((n = buf.indexOf('\n')) >= 0) {
        let msg = null;
        try { msg = JSON.parse(buf.slice(0, n)); } catch { /* not ours */ }
        buf = buf.slice(n + 1);
        const p = msg && pending.get(msg.id);
        if (!p) continue;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error !== undefined) p.rej(new Error(msg.error)); else p.res(msg.value);
      }
    });
    sock.on('error', (err) => { clearTimeout(timer); reject(err); });
    sock.on('close', () => {
      conn.closed = true;
      for (const p of pending.values()) { clearTimeout(p.timer); p.rej(new Error(ENDED_SESSION)); }
      pending.clear();
    });
  });
}

/**
 * Whether a terminal's task is closed. Only a task the store says is done: one
 * it cannot find may be another store's, and the sign-in terminal and an
 * outside agent's belong to no task.
 */
export const taskClosed = (store: { readItem?: (product: string, id: string) => { status?: string } | null | undefined }) => (key: string) => {
  const { product, id } = JSON.parse(key);
  if (product === SETTINGS_TERMINAL.product || String(id).startsWith('agent:')) return false;
  return store.readItem?.(product, id)?.status === 'done';
};

/**
 * Terminals whose task has been closed for `graceMs` on every look since. `seen`
 * carries when each was first seen closed from one look to the next.
 */
export function closedTerminals(list: { key: string }[], isClosed: (key: string) => unknown, seen: Map<string, number>, now: number, graceMs = CLOSE_GRACE_MS): string[] {
  const keys = new Set(list.map((s) => s.key));
  for (const key of [...seen.keys()]) if (!keys.has(key)) seen.delete(key);
  const due: string[] = [];
  for (const { key } of list) {
    let closed = false;
    try { closed = !!isClosed(key); } catch { closed = false; }
    if (!closed) { seen.delete(key); continue; }
    if (!seen.has(key)) seen.set(key, now);
    if (now - seen.get(key)! >= graceMs) due.push(key);
  }
  return due;
}

export class TerminalHosts {
  declare local: TaskTerminals;
  declare stamp: string;
  declare dir: string;
  declare uid: number;
  declare launch: NonNullable<TerminalHostsOptions['launch']>;
  declare connect: NonNullable<TerminalHostsOptions['connect']>;
  declare logFile: string | null;
  declare startMs: number;
  declare now: () => number;
  declare log: (message: string) => void;
  declare platform: NodeJS.Platform;
  declare ownPath: string;
  declare conns: Map<string, HostConnection>;
  declare where: Map<string, TerminalRoute>;
  declare closedSeen: Map<string, number>;
  declare failedAt: number | null;
  declare failure: string | null;
  declare inApp: TerminalRoute;
  declare discovered: Promise<void> | undefined;
  /**
   * `local` is the app's own TaskTerminals, for when no host will start.
   */
  constructor({
    local,
    stamp = terminalHostStamp(),
    dir = os.tmpdir(),
    uid = process.getuid?.() ?? 0,
    launch = launchTerminalHost,
    connect = connectTerminalHost,
    logFile = null,
    startMs = 8_000,
    now = () => Date.now(),
    log = () => {},
    platform = process.platform,
  }: TerminalHostsOptions) {
    Object.assign(this, { local, stamp, dir, uid, launch, connect, logFile, startMs, now, log, platform });
    this.ownPath = terminalHostSocket({ stamp, dir, uid });
    this.conns = new Map();
    this.where = new Map();
    this.closedSeen = new Map();
    this.failedAt = null;
    this.failure = null;
    const t = local;
    this.inApp = { local: true, call: async (op: string, ...args: unknown[]) => (t[op as keyof TaskTerminals] as (...args: unknown[]) => unknown)(...args) };
  }

  async _hello(sockPath: string): Promise<HostConnection | null> {
    const had = this.conns.get(sockPath);
    if (had && !had.closed) return had;
    // Every open hands over this user's environment, so never to a socket
    // somebody else put at the name.
    try { if (process.getuid && fs.statSync(sockPath).uid !== process.getuid()) return null; } catch { return null; }
    let conn: HostConnection;
    try { conn = await this.connect(sockPath); } catch { return null; }
    try {
      const hi = await conn.call('hello') as { protocol?: number } | null | undefined;
      if (hi?.protocol !== PROTOCOL) { conn.close(); return null; }
    } catch { conn.close(); return null; }
    this.conns.set(sockPath, conn);
    return conn;
  }

  /** The hosts an earlier run of the app left, found once. */
  ready() { return (this.discovered ??= this.discover().catch(() => {})); }

  /** Every host this user has, and which terminal is in which. */
  async discover() {
    for (const sockPath of terminalHostSockets({ dir: this.dir, uid: this.uid })) await this._hello(sockPath);
    await this.list();
  }

  /** The host made of this app's code, started if there is none. */
  async _mine(): Promise<HostConnection> {
    const there = await this._hello(this.ownPath);
    if (there) return there;
    if (this.failedAt !== null && this.now() - this.failedAt < RETRY_MS) throw new Error(this.failure!);
    let proc: HostProcess | null | undefined;
    try { proc = this.launch(this.ownPath, { logFile: this.logFile }); } catch (err) { return this._failed((err as Error).message); }
    const end = Date.now() + this.startMs;
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 100));
      const conn = await this._hello(this.ownPath);
      if (conn) { this.failedAt = null; this.failure = null; return conn; }
      if (Number.isInteger(proc?.exitCode) && proc!.exitCode !== HOST_ALREADY_THERE) return this._failed(`it exited with code ${proc!.exitCode}`);
    }
    return this._failed(`no answer in ${Math.round(this.startMs / 1000)} seconds`);
  }

  _failed(why: string): never {
    this.failedAt = this.now();
    this.failure = why;
    this.log(`terminal host: ${why}`);
    throw new Error(why);
  }

  _at(key: string): TerminalRoute {
    const at = this.where.get(key);
    if (!at || at.closed) throw new Error(ENDED_SESSION);
    return at;
  }

  async open(key: string, place: TerminalPlaceSpec) {
    // Windows refuses the host's socket path, so its terminals live in the app.
    if (this.platform === 'win32') {
      const state = this.local.open(key, place);
      this.where.set(key, this.inApp);
      return state;
    }
    await this.ready();
    const at = this.where.get(key);
    if (at && !at.closed && (!at.local || this.local.sessions.has(key))) {
      try { return await at.call('open', key); } catch { /* ended there: a new one below */ }
    }
    this.where.delete(key);
    let host: HostConnection;
    try { host = await this._mine(); } catch (err) {
      const notice = `This terminal ends when ${NAME} quits, because the process that keeps terminals running through a restart would not start (${(err as Error).message}).`;
      const state = this.local.open(key, { ...place, notice: [place?.notice, notice].filter(Boolean).join(' ') });
      this.where.set(key, this.inApp);
      return state;
    }
    const state = await host.call('open', key, place);
    this.where.set(key, host);
    return state;
  }

  read(key: string, offset?: number, wait?: number) { return this._at(key).call('read', key, offset, wait); }
  write(key: string, data: unknown) { return this._at(key).call('write', key, data); }
  resize(key: string, cols: number, rows: number) { return this._at(key).call('resize', key, cols, rows); }
  async close(key: string) {
    const at = this.where.get(key);
    this.where.delete(key);
    if (at && !at.closed) await at.call('close', key);
  }
  async end(key: string, why: string) {
    const at = this.where.get(key);
    if (at && !at.closed) await at.call('end', key, why);
  }

  /** Every terminal, in every host and in the app, freshly asked. */
  async list(): Promise<TerminalListing[]> {
    const out: TerminalListing[] = [];
    const answered = new Set<TerminalRoute>();
    for (const [sockPath, conn] of this.conns) {
      if (conn.closed) { this.conns.delete(sockPath); continue; }
      let got: TerminalListing[] = [];
      try { got = await conn.call('list') as TerminalListing[]; } catch { continue; }
      answered.add(conn);
      // An older host with nothing left ends itself once nobody is connected.
      if (!got.length && sockPath !== this.ownPath) { conn.close(); this.conns.delete(sockPath); continue; }
      for (const s of got) { this.where.set(s.key, conn); out.push(s); }
    }
    const listed = new Set(out.map((s) => s.key));
    for (const [key, at] of this.where) {
      if (at.closed || (answered.has(at) && !listed.has(key)) || (at.local && !this.local.sessions.has(key))) this.where.delete(key);
    }
    for (const s of this.local.list()) if (this.where.get(s.key) === this.inApp) out.push(s);
    return out;
  }

  /** Whether this task has a terminal, as far as the app last knew. */
  hasTerminal(id: string) {
    for (const key of this.where.keys()) { try { if (JSON.parse(key).id === id) return true; } catch { /* not a task's */ } }
    return false;
  }

  async endClosed(isClosed: (key: string) => unknown) {
    const due = closedTerminals(await this.list(), isClosed, this.closedSeen, this.now());
    for (const key of due) { try { await this.end(key, ENDED.closed); } catch { /* gone already */ } }
    return due;
  }
}
