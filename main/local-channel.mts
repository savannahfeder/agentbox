// THE LOCAL CHANNEL BETWEEN THE APP AND ITS OWN PROCESSES, ON EVERY PLATFORM.
//
// On macOS and Linux serveLocal is server.listen(path) and connectLocal is
// net.connect(path). The callers keep their own stale-socket checks and file
// modes.
//
// Windows cannot listen on a unix socket path (EACCES on Node 24.11), so there
// the channel is a named pipe. Any account can list pipe names and create one
// first, and the default pipe DACL lets other accounts connect to ours and
// read from it, though not write. A pipe server can also act as any client
// that has written to it (ImpersonateNamedPipeClient), and Node has no way to
// ask Windows to limit that. So a client writes nothing until the server has
// proved itself.
//
// - Each server listens on a random name and records it, with its pid, in a
//   marker in the account's channel folder under %LOCALAPPDATA%. A client
//   connects only to the name in the marker, so no name can be taken before
//   its server makes it.
// - Once connected, the client leaves a fresh nonce in that folder. The server
//   streams an HMAC under the account key of each nonce left for its pipe, and
//   the client proves the key back once it sees its own. Its nonce did not
//   exist until it held a pipe only the live server could have made, so a
//   proof recorded anywhere else is for a connection the client never makes.
//
// What is left. Another account can see the pipe, connect to it and read the
// proofs streamed while it is connected, which are HMACs bound to its own
// connection. If the server dies, another account can take its old name, and a
// client that reads the stale marker connects there, gets no proof and closes
// without writing. Anything running as the same account, or as an
// administrator, can read the key.
//
// Node's own modules only, plus shared/product-name.mjs which imports nothing,
// because mcp/connection-proxy.mts runs on the app's binary with no install.
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { nameSlug } from '../shared/product-name.mjs';

const KEY_BYTES = 32;
const NONCE_BYTES = 32;
const MAC_BYTES = 32;
const MAGIC = Buffer.from('AB3\0', 'latin1');
const HEAD_BYTES = MAGIC.length + NONCE_BYTES;
const PROOF = 1;
const DONE = 0;
const FRAME_BYTES = 1 + MAC_BYTES;
const MAX_FRAMES = 4096;
const NONCE_TTL_MS = 60_000;
const POLL_MS = 10;

const KIND = /^[a-z][a-z0-9-]{0,23}$/;
const STAMP = /^[A-Za-z0-9-]{0,64}$/;
const NONCE_FILE = /^(\d{1,15})-([0-9a-f]{16})-([0-9a-f]{64})$/;
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;

type Log = (line: string) => void;
type Reason = 'timeout' | 'refused' | 'local';
/** An error the channel raises, with why it failed. */
export type ChannelError = Error & { reason?: Reason; code?: string };

const codeOf = (err: unknown): string | undefined => (err as NodeJS.ErrnoException | null)?.code;
const messageOf = (err: unknown): string => (err as Error | null)?.message ?? String(err);

/** Where the Windows channel key lives, or `{ dir: null, reason }`. Touches no network path. */
export function channelDir(
  { platform = process.platform, env = process.env, home = os.homedir() }: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; home?: unknown } = {},
): { dir: string; reason?: undefined } | { dir: null; reason: string } {
  if (platform !== 'win32') return { dir: null, reason: 'only Windows keeps a channel key' };
  const w = path.win32;
  if (typeof home !== 'string' || !DRIVE_PATH.test(home)) {
    return { dir: null, reason: `the home folder ${JSON.stringify(home)} is not a path on a local drive` };
  }
  const given = typeof env?.LOCALAPPDATA === 'string' ? env.LOCALAPPDATA.trim() : '';
  // Two leading separators is a network share or a device path, and even
  // resolving one would reach out to it.
  if (/^[\\/]{2}/.test(given)) return { dir: null, reason: `%LOCALAPPDATA% ${given} is not on a local drive` };
  const base = DRIVE_PATH.test(given) ? given : w.join(home, 'AppData', 'Local');
  const inside = (folder: string, root: string) => w.resolve(folder).toLowerCase().startsWith(`${w.resolve(root).replace(/\\+$/, '').toLowerCase()}\\`);
  if (inside(base, home)) return { dir: w.join(w.resolve(base), nameSlug, 'channels') };
  // A short 8.3 spelling (C:\Users\JOHNSM~1) names the same folder as the long
  // one, and only the disk can say so. It never changes the drive letter.
  const sameDrive = base[0].toLowerCase() === home[0].toLowerCase();
  if (sameDrive && process.platform === 'win32') {
    try {
      const longBase = fs.realpathSync.native(base);
      if (inside(longBase, fs.realpathSync.native(home))) return { dir: w.join(longBase, nameSlug, 'channels') };
    } catch { /* a folder that does not exist yet is judged by its spelling */ }
  }
  return { dir: null, reason: `${base} is not inside the home folder ${home}, so another account could read the key there` };
}

const beside = (file: string) => `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;

/** Makes `file` hold `content` only if it does not exist yet. */
function createOnly(file: string, content: Buffer): boolean {
  const tmp = beside(file);
  fs.writeFileSync(tmp, content, { mode: 0o600, flag: 'wx' });
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (err) {
    if (codeOf(err) === 'EEXIST') return false;
    throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Removes `file` only while it still holds `expected`. */
function removeIf(file: string, expected: Buffer): boolean {
  try { if (!fs.readFileSync(file).equals(expected)) return false; } catch { return false; }
  const aside = beside(file);
  try { fs.renameSync(file, aside); } catch { return false; }
  // Another process may have replaced the file between the read and the rename.
  const moved = fs.readFileSync(aside);
  if (!moved.equals(expected)) {
    try { fs.linkSync(aside, file); } catch (err) { if (codeOf(err) !== 'EEXIST') throw err; }
  }
  fs.rmSync(aside, { force: true });
  return moved.equals(expected);
}

/** The account's 32-byte channel key in `dir`, made once. Two processes starting at once get the same key. */
export function loadKey(dir: unknown, { log = () => {} }: { log?: Log } = {}): Buffer {
  needDir(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'key');
  for (let attempt = 0; attempt < 4; attempt++) {
    let key: Buffer | null = null;
    try { key = fs.readFileSync(file); } catch (err) { if (codeOf(err) !== 'ENOENT') throw err; }
    if (key?.length === KEY_BYTES) return key;
    if (key) {
      if (removeIf(file, key)) log(`local channel: the key in ${dir} was ${key.length} bytes instead of ${KEY_BYTES}, so a new one was made`);
      continue;
    }
    createOnly(file, crypto.randomBytes(KEY_BYTES));
  }
  throw new Error(`local channel: could not settle on one key in ${dir}`);
}

function needDir(dir: unknown): asserts dir is string {
  if (typeof dir !== 'string' || !dir) throw new Error('local channel: on Windows the channel needs its folder, which channelDir() gives');
}

function checkKey(key: unknown): asserts key is Buffer {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new Error(`local channel: the key must be ${KEY_BYTES} bytes`);
}

function checkKind(kind: unknown, stamp: unknown): asserts kind is string {
  if (typeof kind !== 'string' || !KIND.test(kind)) throw new Error(`local channel: kind ${JSON.stringify(kind)} must match ${KIND}`);
  if (typeof stamp !== 'string' || !STAMP.test(stamp)) throw new Error(`local channel: stamp ${JSON.stringify(stamp)} must match ${STAMP}`);
}

const pipePrefix = (kind: string) => `\\\\.\\pipe\\${nameSlug}-${kind}-`;

/** A fresh random pipe name for one kind of channel. */
export function pipeName(kind: unknown): string {
  checkKind(kind, '');
  return `${pipePrefix(kind)}${crypto.randomBytes(16).toString('hex')}`;
}

const markerFile = (dir: string, kind: string, stamp: string) => path.join(dir, `${kind}.${stamp}.pipe`);

interface Marker { raw: Buffer; name: string | null; pid: number | null }

/** The marker's pipe name and server pid, with `name: null` when it is not one a server of `kind` wrote. */
function readMarker(file: string, kind: string): Marker | null {
  let raw: Buffer;
  try { raw = fs.readFileSync(file); } catch (err) { if (codeOf(err) === 'ENOENT') return null; throw err; }
  try {
    const m = JSON.parse(raw.toString('utf8'));
    const prefix = pipePrefix(kind);
    const named = m?.v === 1 && typeof m.name === 'string' && m.name.startsWith(prefix) && /^[0-9a-f]{32}$/.test(m.name.slice(prefix.length));
    if (named && Number.isInteger(m.pid) && m.pid > 0) return { raw, name: m.name, pid: m.pid };
  } catch { /* an unreadable marker is a stale one */ }
  return { raw, name: null, pid: null };
}

// Signal 0 only asks whether the process exists. EPERM means it does, under
// another account.
function alive(pid: number | null): boolean {
  if (pid === null) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return codeOf(err) === 'EPERM'; }
}

const challengeFolder = (dir: string) => path.join(dir, 'challenges');
const tagOf = (name: string) => crypto.createHash('sha256').update(name).digest('hex').slice(0, 16);

/** A nonce a client has left, and how to take it away. */
export interface Challenge { nonce: Buffer; close: () => void }

/**
 * A nonce a client leaves in the channel folder once it is connected to
 * `name`. Everything is in the file's name, so a server needs one readdir to
 * see it. `close()` removes it.
 */
export function leaveChallenge(dir: string, name: string, now: number = Date.now()): Challenge {
  const folder = challengeFolder(dir);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const file = path.join(folder, `${now}-${tagOf(name)}-${nonce.toString('hex')}`);
  fs.writeFileSync(file, '', { mode: 0o600, flag: 'wx' });
  return { nonce, close: () => fs.rmSync(file, { force: true }) };
}

/** The nonces left for one pipe, handed over a batch at a time until the returned stop is called. */
export interface NonceWatch {
  watch(onNonces: (list: Buffer[]) => void, onError: (err: Error) => void): () => void;
}

interface Watcher { tag: string; deliver: (list: Buffer[]) => void; fail: (err: Error) => void }

/**
 * The nonces clients leave in `dir`, read by one poll for every handshake a
 * server has open. `forPipe(name).watch(onNonces, onError)` hands each new
 * batch for that pipe to the handshake until the returned stop is called.
 * Nonces more than a minute from now, either way, are swept.
 */
export function nonceFeed(dir: string, { log = () => {}, pollMs = POLL_MS }: { log?: Log; pollMs?: number } = {}): { forPipe(name: string): NonceWatch } {
  const folder = challengeFolder(dir);
  const watchers = new Set<Watcher>();
  let timer: NodeJS.Timeout | null = null;
  let polling = false;

  const schedule = () => {
    if (!watchers.size || timer || polling) return;
    timer = setTimeout(() => { timer = null; poll(); }, pollMs);
  };
  const poll = async () => {
    polling = true;
    let entries: string[] | null = null;
    try {
      entries = await fs.promises.readdir(folder);
    } catch (err) {
      if (codeOf(err) === 'ENOENT') entries = [];
      else for (const w of [...watchers]) w.fail(err as Error);
    }
    polling = false;
    if (entries) {
      const now = Date.now();
      const byTag = new Map<string, Buffer[]>();
      for (const entry of entries) {
        const m = NONCE_FILE.exec(entry);
        if (!m) continue;
        if (Math.abs(now - Number(m[1])) > NONCE_TTL_MS) {
          fs.promises.rm(path.join(folder, entry), { force: true }).catch((err: unknown) => log(`local channel: could not sweep ${entry} (${codeOf(err) ?? messageOf(err)})`));
          continue;
        }
        if (!byTag.has(m[2])) byTag.set(m[2], []);
        byTag.get(m[2])!.push(Buffer.from(m[3], 'hex'));
      }
      for (const w of [...watchers]) {
        const list = byTag.get(w.tag);
        if (!list) continue;
        try { w.deliver(list); } catch (err) { w.fail(err as Error); }
      }
    }
    schedule();
  };

  return {
    forPipe(name) {
      const tag = tagOf(name);
      return {
        watch(onNonces, onError) {
          const w: Watcher = { tag, deliver: onNonces, fail: (err) => { watchers.delete(w); onError(err); } };
          watchers.add(w);
          if (!polling) { if (timer) clearTimeout(timer); timer = null; poll(); }
          return () => watchers.delete(w);
        },
      };
    },
  };
}

function mac(key: Buffer, label: string, name: string, ...parts: Buffer[]): Buffer {
  const h = crypto.createHmac('sha256', key).update(`AB3|${label}|${Buffer.byteLength(name)}|${name}|`);
  for (const part of parts) h.update(part);
  return h.digest();
}

function frames(sock: net.Socket) {
  let buf = Buffer.alloc(0);
  let wanted: { n: number; resolve: (out: Buffer) => void } | null = null;
  const pull = () => {
    let chunk: Buffer | string | null;
    while ((chunk = sock.read()) !== null) buf = Buffer.concat([buf, typeof chunk === 'string' ? Buffer.from(chunk) : chunk]);
    if (wanted && buf.length >= wanted.n) {
      const { n, resolve } = wanted;
      wanted = null;
      const out = buf.subarray(0, n);
      buf = buf.subarray(n);
      resolve(out);
    }
  };
  sock.on('readable', pull);
  return {
    take: (n: number) => new Promise<Buffer>((resolve) => { wanted = { n, resolve }; pull(); }),
    // With no 'readable' listener left the stream's flowing state is back to
    // null, so the application's first 'data' listener starts it as usual.
    release: () => {
      sock.removeListener('readable', pull);
      if (buf.length) sock.unshift(buf);
      buf = Buffer.alloc(0);
    },
  };
}

const withReason = (err: Error, reason: Reason): ChannelError => Object.assign(err, { reason });
const refused = (message: string): ChannelError => withReason(new Error(message), 'refused');

export interface Handshake {
  role: 'server' | 'client';
  key: Buffer;
  name: string;
  challenge?: Challenge;
  nonces?: NonceWatch;
  timeoutMs?: number;
}

/**
 * The handshake on one connection to the pipe called `name`. The server
 * streams a proof of `key` for each nonce `nonces` hands it, and the client
 * writes nothing until the proof of its own `challenge` arrives. Resolves with
 * `sock`, or rejects and destroys it on any failure or after `timeoutMs`. A
 * rejection's `reason` is 'timeout' or 'refused'.
 */
export function authenticate(sock: net.Socket, { role, key, name, challenge, nonces, timeoutMs = 2000 }: Handshake): Promise<net.Socket> {
  checkKey(key);
  if (role !== 'server' && role !== 'client') throw new Error(`local channel: role must be server or client, not ${role}`);
  if (typeof name !== 'string' || !name) throw new Error('local channel: the handshake needs the pipe name');
  if (role === 'client' && challenge?.nonce?.length !== NONCE_BYTES) throw new Error('local channel: a client needs the challenge it left after connecting');
  if (role === 'server' && typeof nonces?.watch !== 'function') throw new Error('local channel: a server needs the nonces clients leave');
  const io = frames(sock);
  let timer: NodeJS.Timeout | undefined;
  let quit: (err: ChannelError) => void = () => {};
  const ended = new Promise<never>((resolve, reject) => {
    quit = reject;
    timer = setTimeout(() => reject(withReason(new Error(`no handshake within ${timeoutMs} ms`), 'timeout')), timeoutMs);
  });
  const onError = (err: Error) => quit(withReason(err, 'refused'));
  const onEnd = () => quit(refused('the peer closed during the handshake'));
  sock.on('error', onError);
  sock.on('end', onEnd);
  sock.on('close', onEnd);
  const take = (n: number) => Promise.race([io.take(n), ended]);
  let stopWatching = () => {};

  const run = async () => {
    if (role === 'server') {
      const ns = crypto.randomBytes(NONCE_BYTES);
      sock.write(Buffer.concat([MAGIC, ns]));
      const proved = new Set<string>();
      stopWatching = nonces!.watch((list) => {
        const out: Buffer[] = [];
        for (const nonce of list) {
          const id = nonce.toString('hex');
          if (proved.has(id) || proved.size >= MAX_FRAMES) continue;
          proved.add(id);
          out.push(Buffer.from([PROOF]), mac(key, 'server', name, nonce, ns));
        }
        if (out.length) sock.write(Buffer.concat(out));
      }, (err) => quit(withReason(err, 'refused')));
      const got = await take(MAC_BYTES);
      stopWatching();
      if (!crypto.timingSafeEqual(got, mac(key, 'client', name, ns))) throw refused('the client does not hold the key');
      sock.write(Buffer.concat([Buffer.from([DONE]), mac(key, 'done', name, ns)]));
    } else {
      const head = await take(HEAD_BYTES);
      if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw refused('the server does not speak this handshake, so nothing was sent');
      const ns = head.subarray(MAGIC.length);
      const expected = mac(key, 'server', name, challenge!.nonce, ns);
      let proved = false;
      for (let count = 0; ; count++) {
        if (count > MAX_FRAMES) throw refused('the server sent too many frames');
        const frame = await take(FRAME_BYTES);
        const body = frame.subarray(1);
        if (frame[0] === PROOF) {
          if (!proved && crypto.timingSafeEqual(body, expected)) {
            proved = true;
            sock.write(mac(key, 'client', name, ns));
          }
        } else if (frame[0] === DONE && proved) {
          if (!crypto.timingSafeEqual(body, mac(key, 'done', name, ns))) throw refused('the server did not confirm the handshake');
          return;
        } else {
          throw refused('the server did not prove it holds the key, so nothing was sent');
        }
      }
    }
  };

  const tidy = () => {
    stopWatching();
    clearTimeout(timer);
    sock.removeListener('error', onError);
    sock.removeListener('end', onEnd);
    sock.removeListener('close', onEnd);
  };
  ended.catch(() => {});
  return run().then(() => {
    tidy();
    io.release();
    return sock;
  }, (err: ChannelError) => {
    tidy();
    io.release();
    sock.destroy();
    throw Object.assign(new Error(`local channel: ${err.message}`), { reason: err.reason ?? 'refused', code: err.code });
  });
}

function listenOnce(server: net.Server, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => { server.removeListener('listening', onListening); reject(err); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(name);
  });
}

function connectOnce(name: string, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(name);
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`no answer on ${name} within ${timeoutMs} ms`)); }, timeoutMs);
    sock.once('connect', () => { clearTimeout(timer); sock.removeAllListeners('error'); resolve(sock); });
    sock.once('error', (err) => { clearTimeout(timer); sock.destroy(); reject(err); });
  });
}

interface ClientSide { key: Buffer; dir: string; name: string; timeoutMs: number }

/** The client's side once connected. The nonce is left only now, while the socket holds the live server's pipe. */
async function handshakeOn(sock: net.Socket, { key, dir, name, timeoutMs }: ClientSide): Promise<net.Socket> {
  let challenge: Challenge;
  try {
    challenge = leaveChallenge(dir, name);
  } catch (err) {
    sock.destroy();
    throw withReason(new Error(`local channel: could not leave a nonce in ${challengeFolder(dir)} (${codeOf(err) ?? messageOf(err)})`), 'local');
  }
  try {
    return await authenticate(sock, { role: 'client', key, name, challenge, timeoutMs });
  } finally {
    challenge.close();
  }
}

/**
 * 'answers', 'gone' when no pipe has the name or the one there refuses the
 * handshake, or 'silent' for anything else, so the marker's pid decides.
 */
async function probe(opts: ClientSide & { log: Log }): Promise<'answers' | 'gone' | 'silent'> {
  let sock: net.Socket;
  try {
    sock = await connectOnce(opts.name, opts.timeoutMs);
  } catch (err) {
    // A stalled server's few waiting pipe instances fill up, and then a
    // connect times out or is refused as busy while the server is alive.
    return codeOf(err) === 'ENOENT' ? 'gone' : 'silent';
  }
  try {
    (await handshakeOn(sock, opts)).destroy();
    return 'answers';
  } catch (err) {
    const failed = err as ChannelError;
    if (failed.reason === 'local') throw err;
    opts.log(`local channel: ${opts.name} did not prove the key (${failed.message.replace(/^local channel: /, '')})`);
    return failed.reason === 'timeout' ? 'silent' : 'gone';
  }
}

const GATED = Symbol('local channel gate');
type Gated = net.Server & { [GATED]?: true };

// Every connection the server accepts runs the handshake first, and only one
// that passes reaches the server's own 'connection' listeners (an http.Server's
// included). The gate sits on emit because net.Server announces a new socket
// through emit('connection') and nowhere else. close() is wrapped so the marker
// goes the moment the server stops taking connections.
function gate(server: Gated, { accept, closing, log }: { accept: (sock: net.Socket) => Promise<unknown>; closing: () => void; log: Log }): () => void {
  if (server[GATED]) throw new Error('local channel: this server is already serving a local channel');
  type Emit = (this: net.Server, event: string | symbol, ...args: unknown[]) => boolean;
  const { close } = server;
  const emit = server.emit as Emit;
  server[GATED] = true;
  server.emit = function gated(this: net.Server, event: string | symbol, ...args: unknown[]) {
    if (event !== 'connection') return emit.call(this, event, ...args);
    const sock = args[0] as net.Socket;
    let handshake: Promise<unknown>;
    try {
      handshake = accept(sock);
    } catch (err) {
      handshake = Promise.reject(err);
    }
    handshake.then(() => emit.call(this, 'connection', sock), (err: unknown) => {
      sock.destroy();
      log(`${messageOf(err)}, so the connection was closed`);
    });
    return true;
  };
  // A marker that cannot be removed (a file held open by a scanner, say) must
  // never keep the server from closing.
  const removeMarker = () => {
    try { closing(); } catch (err) { log(`local channel: could not remove the marker (${codeOf(err) ?? messageOf(err)})`); }
  };
  server.close = function closeChannel(this: net.Server, ...args: Parameters<net.Server['close']>) {
    removeMarker();
    return close.apply(this, args);
  };
  const ungate = () => {
    if (!server[GATED]) return;
    server.emit = emit;
    server.close = close;
    delete server[GATED];
  };
  const onClose = () => { removeMarker(); ungate(); };
  server.once('close', onClose);
  return () => { server.removeListener('close', onClose); ungate(); };
}

export interface LocalOptions {
  kind?: string;
  stamp?: string;
  dir?: string | null;
  path?: string;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  log?: Log;
}

/**
 * Listen for the app's own processes. On macOS and Linux `path` is the unix
 * socket. On Windows it resolves with `name` and a `state`.
 *   serving  listening, and recorded in the marker for `kind` and `stamp`
 *   taken    a server with the same key already answers there
 *   busy     the marker's server did not answer in time but its process is alive
 * Closing the server removes its marker and its gate, so it can serve again.
 */
export async function serveLocal(
  server: net.Server,
  { kind, stamp = '', dir, path: sockPath, platform = process.platform, timeoutMs = 2000, log = () => {} }: LocalOptions = {},
): Promise<{ state: 'serving' | 'taken' | 'busy'; name: string }> {
  if (platform !== 'win32') {
    if (!sockPath) throw new Error('local channel: a unix socket needs its path');
    await listenOnce(server, sockPath);
    return { state: 'serving', name: sockPath };
  }
  needDir(dir);
  checkKind(kind, stamp);
  const key = loadKey(dir, { log });
  const marker = markerFile(dir, kind, stamp);
  const feed = nonceFeed(dir, { log });
  let name: string | null = null;
  let mine: Buffer | null = null;
  const ungate = gate(server, {
    accept: (sock) => authenticate(sock, { role: 'server', key, name: name!, nonces: feed.forPipe(name!), timeoutMs }),
    closing: () => { if (mine) removeIf(marker, mine); },
    log,
  });
  const stop = () => new Promise<void>((resolve) => {
    if (server.listening) { server.close(() => resolve()); return; }
    ungate();
    resolve();
  });

  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = readMarker(marker, kind);
      if (current?.name) {
        const seen = await probe({ key, dir, name: current.name, timeoutMs, log });
        if (seen === 'answers') {
          await stop();
          return { state: 'taken', name: current.name };
        }
        if (seen === 'silent' && alive(current.pid)) {
          await stop();
          log(`local channel: the ${kind} server at ${current.name} (pid ${current.pid}) is alive but did not answer, so its marker was left alone`);
          return { state: 'busy', name: current.name };
        }
      }
      if (current) {
        removeIf(marker, current.raw);
        continue;
      }
      if (!server.listening) {
        name = pipeName(kind);
        try { await listenOnce(server, name); } catch (err) { if (codeOf(err) !== 'EADDRINUSE') throw err; continue; }
        mine = Buffer.from(JSON.stringify({ v: 1, name, pid: process.pid }));
      }
      if (name && mine && createOnly(marker, mine)) return { state: 'serving', name };
    }
  } catch (err) {
    await stop();
    throw err;
  }
  await stop();
  throw new Error(`local channel: could not record the ${kind} pipe in ${marker}`);
}

/**
 * A connection to the app's own server. On macOS and Linux `path` is the unix
 * socket. On Windows it goes to the pipe named in the marker for `kind` and
 * `stamp`, and resolves only once that server has proved the key.
 */
export async function connectLocal(
  { kind, stamp = '', dir, path: sockPath, platform = process.platform, timeoutMs = 2000, log = () => {} }: LocalOptions = {},
): Promise<net.Socket> {
  if (platform !== 'win32') {
    if (!sockPath) throw new Error('local channel: a unix socket needs its path');
    return new Promise((resolve, reject) => {
      const sock = net.connect(sockPath);
      sock.once('connect', () => { sock.removeListener('error', reject); resolve(sock); });
      sock.once('error', reject);
    });
  }
  needDir(dir);
  checkKind(kind, stamp);
  const key = loadKey(dir, { log });
  const marker = markerFile(dir, kind, stamp);
  let tried: string | null = null;
  let failure: ChannelError | null = null;
  // A server that restarted between reading the marker and connecting has
  // written a new name, so a changed marker earns one more try.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = readMarker(marker, kind);
    if (!current?.name || current.name === tried) break;
    tried = current.name;
    try {
      return await handshakeOn(await connectOnce(tried, timeoutMs), { key, dir, name: tried, timeoutMs });
    } catch (err) {
      if ((err as ChannelError).reason === 'local') throw err;
      failure = err as ChannelError;
    }
  }
  if (!tried) throw new Error(`local channel: no ${kind} server is running (${marker} names no pipe)`);
  throw new Error(`local channel: the ${kind} server at ${tried} did not answer (${(failure?.message ?? '').replace(/^local channel: /, '')})`);
}
