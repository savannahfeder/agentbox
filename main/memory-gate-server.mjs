// THE COORDINATOR EVERY WORKER'S COMMANDS ASK BEFORE THEY RUN (w-3958c3753d).
//
// main/memory-gate.mjs decides; this file is everything around the decision:
// the local socket the hook (scripts/memory-gate-hook.sh) asks on, reading the
// Mac's memory pressure, sampling what each running command actually uses, and
// writing what was learned to disk.
//
// ONE COORDINATOR PER MAC, WHICHEVER APP STARTED FIRST. Two Agentbox builds can
// run side by side (the packaged one and a dev one), and two gates each letting
// two heavy commands through is four. The socket file itself is the lock: a
// listening socket belongs to a live process and dies with it. The first app
// to listen owns it; the next finds it answering and stands by, trying again
// every `takeoverMs`, and takes it over once nobody answers. Its own workers
// meanwhile ask the owner, carrying the rank they were spawned with.
//
// NOTHING HERE STOPS A RUNNING PROGRAM. Sampling only measures. Pausing
// programs was the first design; a paused program frees no memory, trips its
// own time limits and stays frozen forever if the app dies (agreed with Codex,
// 2026-10-04), so the only lever is when a command is allowed to START.
//
// WHAT RESTARTS DO. App quit: the supervisor kills its workers anyway, and
// `stop()` answers everything still waiting with "go", so nothing is left
// holding. App crash: an idle `claude -p` exits about 2.6 s after its input
// closes (measured), a hook mid-wait sees the socket go and runs its command,
// and a standby app takes over. Mac restart or sleep: nothing is carried across
// but the learned history; a grant whose agent process is gone, or whose pid
// now belongs to a different program, is released at the next sample.

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { MemoryGate, pressureFrom } from './memory-gate.mjs';
import { CommandHistory } from './memory-gate-history.mjs';

export const PROTOCOL = 1;

/** Where every Agentbox on this Mac meets. Short, because macOS caps a socket
 *  path at 104 bytes, and in the per-user temp folder, so it is this user's. */
export function defaultSocketPath() {
  return path.join(os.tmpdir(), 'agentbox-memory-gate.sock');
}

/** The deny Claude Code reads from a PreToolUse hook. */
export function denyOutput(reason) {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  });
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

/** `kern.memorystatus_vm_pressure_level` and `kern.memorystatus_level`, or nulls. */
export async function readMacPressure() {
  const out = await run('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level', 'kern.memorystatus_level']);
  const [level, freePct] = String(out ?? '').trim().split(/\s+/).map(Number);
  return { level: Number.isFinite(level) ? level : null, freePct: Number.isFinite(freePct) ? freePct : null };
}

/** `ps` elapsed time, `[[dd-]hh:]mm:ss`, in seconds. */
export function etimeSeconds(etime) {
  const m = String(etime).match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return null;
  return (+(m[1] ?? 0)) * 86_400 + (+(m[2] ?? 0)) * 3_600 + (+m[3]) * 60 + (+m[4]);
}

/**
 * Every process: pid, parent, resident MB, when it started (wall clock, to
 * the second) and its command line. One `ps` costs about 33 ms on a loaded
 * Mac (measured 2026-10-04), and it only runs while a command is granted.
 */
export async function listProcesses() {
  const out = await run('/bin/ps', ['-axo', 'pid=,ppid=,rss=,etime=,args=']);
  if (!out) return [];
  const now = Date.now();
  const list = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const age = etimeSeconds(m[4]);
    list.push({ pid: +m[1], ppid: +m[2], mb: +m[3] / 1024, startedAt: age === null ? undefined : now - age * 1000, args: m[5].slice(0, 400) });
  }
  return list;
}

// The process an agent IS: Claude Code's `claude`, or Codex's app-server.
// Used only to find whose command a hook was, never to decide anything.
const AGENT = /(^|\/)(claude|codex)(\s|$)/;

export class MemoryGateServer {
  constructor({
    socketPath = defaultSocketPath(),
    historyFile = null,
    history = null,
    gate = {},
    scoreFor = null,
    // WHOSE CODEX THREAD IS THIS (w-e5225b62ba). A Claude worker carries its row
    // in its environment; one `codex app-server` serves every Codex thread of a
    // login, so there is one environment for all of them and the thread has to
    // say who it is. It does, by the `session_id` in its payload, measured to be
    // the app-server's own `thread.id`. Answering null means "not this app's",
    // and such a command is let straight through.
    ownerOf = null,
    readPressure = readMacPressure,
    sampleProcesses = listProcesses,
    pollMs = 2_000,
    takeoverMs = 5_000,
    idleReleaseMs = 30_000,
    maxGrantMs = 3 * 60 * 60_000,
    clock = Date.now,
    log = () => {},
  } = {}) {
    this.socketPath = socketPath;
    this.historyFile = historyFile;
    this.history = history ?? loadHistory(historyFile);
    this.clock = clock;
    this.idleReleaseMs = idleReleaseMs;
    this.maxGrantMs = maxGrantMs;
    this.gate = new MemoryGate({ ...gate, history: this.history, clock });
    this.scoreFor = scoreFor;
    this.ownerOf = ownerOf;
    this.readPressure = readPressure;
    this.sampleProcesses = sampleProcesses;
    this.pollMs = pollMs;
    this.takeoverMs = takeoverMs;
    this.log = log;
    this.role = 'stopped';
    this.grants = new Map();
    this.lastPids = new Set();
    this.reading = { level: null, freePct: null };
    // `foreign` is counted apart from `asked` so the figures on the Agents page
    // stay about this app's own work: a Codex session it did not start is let
    // through and is not one of its agents.
    this.counts = { asked: 0, waited: 0, refused: 0, foreign: 0 };
    this.dirty = false;
  }

  async start() {
    if (this.role !== 'stopped') return this.role;
    this.stopping = false;
    await this._claim();
    return this.role;
  }

  async stop() {
    this.stopping = true;
    clearTimeout(this.takeoverTimer);
    clearInterval(this.pollTimer);
    // Everything still waiting goes: the gate is off, so nothing should hold.
    for (const w of this.gate.waiting.values()) for (const r of w.replies) r({ allow: true });
    this.gate.waiting.clear();
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise((resolve) => server.close(() => resolve()));
      server.closeAllConnections?.();
      try { fs.unlinkSync(this.socketPath); } catch {}
    }
    this._saveHistory();
    this.role = 'stopped';
  }

  setSlots(n) { this.gate.setSlots(n); }

  status() {
    const snap = this.gate.snapshot();
    return { role: this.role, ...snap, freePct: this.reading.freePct, counts: { ...this.counts } };
  }

  /* --------------------------- owning the socket --------------------------- */

  async _claim() {
    if (this.stopping) return;
    if (await this._listen()) {
      this.role = 'owner';
      this.log(`memory gate: coordinating on ${this.socketPath}`);
      this._poll();
      this.pollTimer = setInterval(() => this._poll(), this.pollMs);
      this.pollTimer.unref?.();
      return;
    }
    this.role = 'standby';
    this.takeoverTimer = setTimeout(() => this._claim(), this.takeoverMs);
    this.takeoverTimer.unref?.();
  }

  async _listen() {
    const server = http.createServer((req, res) => this._handle(req, res));
    const tryListen = () => new Promise((resolve) => {
      const onError = (err) => { server.off('listening', onListen); resolve(err); };
      const onListen = () => { server.off('error', onError); resolve(null); };
      server.once('error', onError);
      server.once('listening', onListen);
      server.listen(this.socketPath);
    });
    let err = await tryListen();
    if (err?.code === 'EADDRINUSE') {
      if (await answers(this.socketPath)) return false;
      // Left behind by a process that is gone: nobody is on the other end.
      try { fs.unlinkSync(this.socketPath); } catch {}
      err = await tryListen();
    }
    if (err) { this.log(`memory gate: could not listen: ${err.message}`); return false; }
    try { fs.chmodSync(this.socketPath, 0o600); } catch {}
    this.server = server;
    return true;
  }

  /* ------------------------------- requests ------------------------------- */

  _handle(req, res) {
    if (req.method === 'GET' && req.url === '/status') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(this.status()));
      return;
    }
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { if (raw.length < 1_000_000) raw += d; });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(raw); } catch { res.end(''); return; }
      if (req.url === '/pre') this._pre(body, req, res);
      else if (req.url === '/post') { this._post(body); res.end(''); }
      else res.end('');
    });
  }

  /**
   * WHOSE ROW THIS COMMAND BELONGS TO, or null for "not this app's".
   *
   * THE ENVIRONMENT WINS. A Claude Code worker is a process per work item and
   * carries the row on it (`memoryGateEnv`), and that is the authority: reading a
   * session id first would let a Codex thread id that happened to collide
   * relabel a Claude worker's command.
   *
   * ONLY THEN THE SESSION ID, which is the Codex path and the reason this method
   * exists. One `codex app-server` serves every Codex thread of a login, so its
   * environment names no row and the thread names itself: the `session_id` in
   * the payload was measured to be the app-server's own `thread.id`.
   *
   * A LOOKUP THAT THROWS IS A COMMAND WE LET RUN. The lookup reaches into the
   * supervisor's live sessions, and a store mid-write there must not be able to
   * stop an agent's shell command.
   *
   * AND AN ASK THAT NAMES NEITHER IS STILL GATED, with no row, exactly as it was
   * before any of this existed. "Let it through" is reserved for a thread we
   * POSITIVELY know is somebody else's — a session id we were given and do not
   * recognise. Treating a nameless ask as a stranger's would have been a way for
   * a payload we failed to read to walk past the gate unmeasured.
   */
  _whose(body, hook) {
    const item = typeof body?.item === 'string' ? body.item.trim() : '';
    if (item) return { item, product: body.product || null };
    const session = typeof hook?.session_id === 'string' ? hook.session_id.trim() : '';
    if (!session) return { item: null, product: body?.product || null };
    if (typeof this.ownerOf !== 'function') return null;
    let owner;
    try { owner = this.ownerOf(session); } catch { return null; }
    if (!owner?.item) return null;
    return { item: String(owner.item), product: owner.product ?? null };
  }

  _pre(body, req, res) {
    const hook = body?.hook ?? {};
    const command = hook?.tool_input?.command;
    if (typeof command !== 'string' || !command.trim()) { res.end(''); return; }
    const whose = this._whose(body, hook);
    // A COMMAND THIS APP DID NOT START IS NOT ITS TO HOLD. Only a Codex ask can
    // land here unowned, and letting it run is the only honest answer: holding a
    // stranger's command behind our queue would stall somebody's terminal with
    // nothing on any screen to say why.
    if (!whose) { this.counts.foreign++; res.end(''); return; }
    const id = String(hook.tool_use_id || `${body.ppid}-${Date.now()}-${Math.random()}`);
    const live = typeof this.scoreFor === 'function' ? this.scoreFor(whose.product, whose.item) : null;
    const score = Number.isFinite(live) ? live : Number(body.score) || 0;
    this.counts.asked++;
    let answered = false;
    this.gate.submit({
      id, command, score, item: whose.item, product: whose.product,
      background: !!hook?.tool_input?.run_in_background,
    }, (decision) => {
      answered = true;
      if (decision.allow) {
        const grant = this.grants.get(id) ?? {
          id, ppid: Number(body.ppid) || null, anchor: null, anchorArgs: null,
          baseline: this.lastPids, wallStart: Date.now(), startedAt: this.clock(), ambiguous: false, emptySince: null,
        };
        this.grants.set(id, grant);
        res.end('');
      } else {
        this.counts.refused++;
        res.end(denyOutput(decision.reason));
      }
    });
    if (!answered) this.counts.waited++;
    // The agent stopped waiting (killed, interrupted, timed out): forget it.
    res.on('close', () => {
      if (!answered) this.gate.finish(id);
    });
  }

  _post(body) {
    const hook = body?.hook ?? {};
    const id = String(hook.tool_use_id ?? '');
    const grant = this.grants.get(id);
    this.grants.delete(id);
    const was = this.gate.finish(id);
    if (!was) return;
    if (grant?.ambiguous) return;
    this.history.record(was.command, {
      peakMb: was.peakMb,
      durationMs: Number(hook.duration_ms) || null,
      background: was.background,
    });
    this.dirty = true;
  }

  /* ------------------------------ measuring ------------------------------ */

  async _poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      this.reading = await this.readPressure();
      this.gate.setPressure(pressureFrom(this.reading));
      // Processes are only looked at while something is granted: nothing
      // else needs them, and each look costs a `ps`.
      if (this.grants.size) this._sample(await this.sampleProcesses());
      this.gate.tick();
      if (this.dirty && (this.saves = (this.saves ?? 0) + 1) % 15 === 0) this._saveHistory();
    } catch (err) {
      this.log(`memory gate: poll failed: ${err.message}`);
    } finally {
      this.polling = false;
    }
  }

  /**
   * One look at every process. Each grant finds the agent process it belongs to
   * (the nearest `claude` or `codex` above the hook), and is measured as the
   * new processes under that agent since it was granted. Two grants on one
   * agent at once share what they find and teach the history nothing.
   */
  _sample(procs) {
    const byPid = new Map(procs.map((p) => [p.pid, p]));
    const children = new Map();
    for (const p of procs) {
      if (!children.has(p.ppid)) children.set(p.ppid, []);
      children.get(p.ppid).push(p);
    }
    const perAnchor = new Map();
    const now = this.clock();
    for (const grant of this.grants.values()) {
      if (!this.gate.running.has(grant.id)) { this.grants.delete(grant.id); continue; }
      // The last resort, for a grant whose agent could never be found: no
      // report back and nothing to measure for three hours is over.
      if (!grant.anchor && now - grant.startedAt >= this.maxGrantMs) {
        this.grants.delete(grant.id);
        this.gate.finish(grant.id);
        continue;
      }
      if (!grant.anchor) {
        let at = byPid.get(grant.ppid);
        for (let up = 0; at && up < 8 && !AGENT.test(at.args); up++) at = byPid.get(at.ppid);
        const found = at && AGENT.test(at.args) ? at : byPid.get(grant.ppid);
        if (found) { grant.anchor = found.pid; grant.anchorArgs = found.args; }
      }
      const anchor = grant.anchor ? byPid.get(grant.anchor) : null;
      // Its agent is gone, or the pid now belongs to some other program.
      if (grant.anchor && (!anchor || anchor.args !== grant.anchorArgs)) {
        this.grants.delete(grant.id);
        this.gate.finish(grant.id);
        continue;
      }
      if (!anchor) continue;
      if (!perAnchor.has(anchor.pid)) perAnchor.set(anchor.pid, []);
      perAnchor.get(anchor.pid).push(grant);
    }
    for (const [anchorPid, grants] of perAnchor) {
      // A process is the command's when it started after the earliest grant
      // on this agent. `ps` reports start to the second, so a second's margin
      // errs toward counting. Without a start time, anything not seen in the
      // previous look counts instead.
      const since = Math.min(...grants.map((g) => g.wallStart)) - 1_000;
      const baseline = grants.reduce((acc, g) => (acc && g.baseline.size < acc.size ? g.baseline : acc ?? g.baseline), null);
      const ours = (p) => (typeof p.startedAt === 'number' ? p.startedAt >= since : !baseline.has(p.pid));
      let mb = 0;
      const stack = [...(children.get(anchorPid) ?? [])];
      while (stack.length) {
        const p = stack.pop();
        if (ours(p)) mb += p.mb;
        stack.push(...(children.get(p.pid) ?? []));
      }
      for (const g of grants) {
        if (grants.length > 1) g.ambiguous = true;
        this.gate.observe(g.id, Math.round(mb));
        // NOTHING RUNNING UNDER IT FOR A WHILE: its "after" report was lost
        // (the hook was killed, the agent crashed mid-call). Every running
        // command has at least the shell it runs in, so an empty reading that
        // lasts is a command that is over.
        if (mb > 0) g.emptySince = null;
        else if (g.emptySince === null) g.emptySince = now;
        else if (now - g.emptySince >= this.idleReleaseMs) {
          this.grants.delete(g.id);
          this.gate.finish(g.id);
        }
      }
    }
    this.lastPids = new Set(procs.map((p) => p.pid));
  }

  _saveHistory() {
    if (!this.historyFile || !this.dirty) return;
    try {
      const tmp = `${this.historyFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.history.toJSON()));
      fs.renameSync(tmp, this.historyFile);
      this.dirty = false;
    } catch (err) { this.log(`memory gate: could not save history: ${err.message}`); }
  }
}

function loadHistory(file) {
  if (!file) return new CommandHistory();
  try { return CommandHistory.fromJSON(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return new CommandHistory(); }
}

/** Whether a live process is listening on `socketPath`. */
function answers(socketPath) {
  return new Promise((resolve) => {
    const c = net.connect(socketPath);
    const done = (v) => { c.destroy(); resolve(v); };
    c.once('connect', () => done(true));
    c.once('error', () => done(false));
    setTimeout(() => done(false), 1_000).unref?.();
  });
}
