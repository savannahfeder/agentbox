// A WORKER HELD BY THE RUN HOST (main/run-host.mjs), AS THE SUPERVISOR SEES IT:
// stdin, stdout, stderr, a pid, `kill`, and 'spawn', 'error' and 'exit', the
// way a ChildProcess has them. `detach()` lets go without stopping the run, and
// says how far its output was read so a restarted app reads on from there.
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

// The host went away without saying how the run ended.
export const HOST_LOST = 75;
const CONNECT_TRIES = 50;
const CONNECT_EVERY_MS = 100;

export class HostedRun extends EventEmitter {
  /**
   * `start` is `{ bin, argv, env, cwd }` for a new run; without it this
   * attaches to `runId` and reads from `out`/`err` on.
   */
  constructor({ sockPath, runId, start = null, out = 0, err = 0, pid = null }) {
    super();
    this.runId = runId;
    this.sockPath = sockPath;
    this.pid = Number.isInteger(pid) ? pid : undefined;
    this.exitCode = null;
    this.signalCode = null;
    this.read = { out, err };
    this._over = false;
    this._detached = false;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    const self = this;
    this.stdin = new Writable({
      write(chunk, _enc, cb) { self._send({ t: 'i', d: Buffer.from(chunk).toString('base64') }); cb(); },
      final(cb) { self._send({ t: 'I' }); cb(); },
    });
    this.stdin.on('error', () => {});
    this._queued = [];
    this._connect(start ? { op: 'start', runId, ...start } : { op: 'attach', runId, out, err }, CONNECT_TRIES);
  }

  // A host just started takes a moment to listen.
  _connect(first, tries) {
    const sock = net.connect(this.sockPath);
    this._sock = sock;
    let connected = false;
    sock.setEncoding('utf8');
    sock.once('connect', () => {
      connected = true;
      sock.write(`${JSON.stringify(first)}\n`);
      for (const line of this._queued ?? []) sock.write(line);
      this._queued = null;
    });
    let buf = '';
    sock.on('data', (d) => {
      buf += d;
      let n;
      while ((n = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, n);
        buf = buf.slice(n + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        this._hear(msg);
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => {
      if (this._over || this._detached) return;
      if (!connected && tries > 1) { setTimeout(() => this._connect(first, tries - 1), CONNECT_EVERY_MS).unref?.(); return; }
      this.stderr.write(`agentbox: the run host stopped answering for this run\n`);
      this._end(HOST_LOST, null);
    });
  }

  _send(msg) {
    if (this._over || this._detached) return;
    const line = `${JSON.stringify(msg)}\n`;
    if (this._queued) this._queued.push(line); else if (!this._sock.destroyed) this._sock.write(line);
  }

  _hear(msg) {
    if (this._detached) return;
    if (msg.t === 'started') {
      if (Number.isInteger(msg.pid)) this.pid = msg.pid;
      this.emit('spawn');
    } else if (msg.t === 'state') {
      if (Number.isInteger(msg.pid)) this.pid = msg.pid;
      if (msg.from) this.read = { out: msg.from.out, err: msg.from.err };
      this.emit('input-state', msg);
    } else if (msg.t === 'o' || msg.t === 'e') {
      const b = Buffer.from(String(msg.d ?? ''), 'base64');
      this.read[msg.t === 'o' ? 'out' : 'err'] += b.length;
      (msg.t === 'o' ? this.stdout : this.stderr).write(b);
    } else if (msg.t === 'x') {
      if (msg.ended) this.endedInHost = true;
      if (msg.code === -2 && this.listenerCount('error')) this.emit('error', Object.assign(new Error('The worker could not start'), { code: 'ENOENT' }));
      this._end(Number.isInteger(msg.code) ? msg.code : null, msg.signal ?? null);
    } else if (msg.t === 'gone') {
      this.stderr.write('agentbox: the run host no longer has this run\n');
      this._end(HOST_LOST, null);
    }
  }

  _end(code, signal) {
    if (this._over) return;
    this._over = true;
    this.exitCode = code;
    this.signalCode = signal;
    try { this._sock.end(); } catch { /* gone */ }
    // Everything printed reaches its readers before the exit, as with a real
    // child whose streams have closed.
    this.stdout.end();
    this.stderr.end();
    // A lost host is not the agent failing (Supervisor `settleExit` reads `how`).
    const how = code === HOST_LOST ? { transportFault: true } : undefined;
    setImmediate(() => { this.emit('exit', code, signal, how); this.emit('close', code, signal); });
  }

  // Straight to the worker when its pid is known, so a quit that follows at
  // once cannot outrun the message.
  kill(signal = 'SIGTERM') {
    if (this._over || this._detached) return false;
    if (Number.isInteger(this.pid)) { try { process.kill(this.pid, signal); return true; } catch { /* the host's turn */ } }
    this._send({ t: 'k', s: signal });
    return true;
  }

  /** The app can find this run again: an app that vanishes leaves it going. */
  keep() {
    this._send({ t: 'keep' });
  }

  /** Let go and leave the run going. Returns how far its output was read. */
  detach() {
    if (this._over || this._detached) return null;
    this._send({ t: 'bye' });
    this._detached = true;
    try { this._sock.end(); } catch { /* gone */ }
    return { ...this.read };
  }
}
