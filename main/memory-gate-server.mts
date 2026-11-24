// THE COORDINATOR EVERY WORKER'S COMMANDS ASK BEFORE THEY RUN (w-3958c3753d).
//
// main/memory-gate.mts decides; this file is everything around the decision:
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
import { MemoryGate, pressureFrom, GATE_LINES } from './memory-gate.mts';
import type { GateAnswer, MemoryGateOptions, Pressure, PressureReading } from './memory-gate.mts';
import { CommandHistory } from './memory-gate-history.mts';
import type { Verdict } from './memory-gate-history.mts';
import { etimeSeconds } from './leftovers.mts';
import { readMacPressure } from './mac-pressure.mts';
import { askedByANestedAgent, giveBackAsk, mayAskAgain } from './memory-give-back.mts';
import type { Holding } from './memory-give-back.mts';

export const PROTOCOL = 1;
export const DEFAULT_LOCK_PORT = 47263;

/** Where every Agentbox on this Mac meets. Short, because macOS caps a socket
 *  path at 104 bytes, and in the per-user temp folder, so it is this user's. */
export function defaultSocketPath() {
  return path.join(os.tmpdir(), 'agentbox-memory-gate.sock');
}

/** The deny Claude Code reads from a PreToolUse hook. */
export function denyOutput(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  });
}

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    execFile(cmd, args, { timeout: 5_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout) => resolve(err ? null : stdout));
  });
}

export { readMacPressure };

export { etimeSeconds };

/**
 * Every process: pid, parent, resident MB, when it started (wall clock, to
 * the second) and its command line. One `ps` costs about 33 ms on a loaded
 * Mac (measured 2026-10-04), and it only runs while a command is granted.
 */
export interface ProcessSample {
  pid: number;
  ppid: number;
  mb: number;
  startedAt: number | undefined;
  args: string;
}

export async function listProcesses(): Promise<ProcessSample[]> {
  const out = await run('/bin/ps', ['-axo', 'pid=,ppid=,rss=,etime=,args=']);
  if (!out) return [];
  const now = Date.now();
  const list: ProcessSample[] = [];
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
const CLAUDE_AGENT = /(^|\/)claude(\s|$)/;

// A hook asking for a later command runs under the same agent but is no
// command's work. Only its exact launch matches, so a command that merely
// names the file is still measured.
const HOOK = /^\S*sh (-c '[^']*\/memory-gate-hook\.sh'|\/[^']*\/memory-gate-hook\.sh) (pre|post)$/;

/** Whether `pid` is a running program. One that is another user's still counts. */
export function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (err) { return (err as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** A process's parent from /proc, or null where there is none (macOS). */
export function readParentPid(pid: number): number | null {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    return Number.isInteger(ppid) && ppid > 0 ? ppid : null;
  } catch { return null; }
}

export interface HookPayload {
  session_id?: unknown;
  tool_use_id?: unknown;
  tool_input?: { command?: unknown; run_in_background?: unknown };
  duration_ms?: unknown;
}

export interface HookBody {
  item?: unknown;
  product?: string | null;
  ppid?: unknown;
  score?: unknown;
  hook?: HookPayload;
}

export interface Grant {
  id: string;
  ppid: number | null;
  lineage: number[];
  anchor: number | null;
  anchorArgs: string | null;
  baseline: Set<number>;
  wallStart: number;
  startedAt: number;
  ambiguous: boolean;
  sharedNow?: boolean;
  soloPeakMb?: number;
  emptySince: number | null;
}

export interface GrantLine {
  refused: boolean;
  /** Answered with what its thread holds instead of being queued or run. */
  askedBack?: boolean;
  cls?: Verdict | null;
  waitMs: unknown;
  ranMs: unknown;
  peakMb: unknown;
  shared?: boolean;
  pressure?: Pressure | null;
  /** What the command was expected to take and the room it started in, so the two can be set beside what it took. */
  needMb?: unknown;
  roomMb?: unknown;
  command: unknown;
}

export interface MemoryGateServerOptions {
  socketPath?: string;
  historyFile?: string | null;
  history?: CommandHistory | null;
  grantLogFile?: string | null;
  grantLogMaxBytes?: number;
  gate?: MemoryGateOptions;
  scoreFor?: ((product: string | null, item: string | null) => number | null | undefined) | null;
  ownerOf?: ((session: string) => { item?: unknown; product?: string | null } | null | undefined) | null;
  urgentFor?: ((product: string | null, item: string | null) => unknown) | null;
  readPressure?: () => Promise<PressureReading>;
  /** How many MB Agentbox has left on this computer and when that was read, or null (main/memory-allowance.mts). */
  room?: () => { mb: number; at: number } | null;
  /** This computer's memory, which the light and heavy lines are shares of. Left out, they are the ones measured at 16 GB. */
  ramMb?: number;
  /** The thread to ask for memory back, while there is one (main/memory-give-back.mts). */
  heaviest?: () => Holding | null;
  /** Whether a pid is a running program now. */
  running?: (pid: number) => boolean;
  /** The pids of the workers the app started for a thread: the agent, on a Mac, where a hook's parent may be only its launcher. */
  agentPids?: (item: string) => number[];
  sampleProcesses?: () => Promise<ProcessSample[]>;
  parentOf?: (pid: number) => number | null;
  pollMs?: number;
  idlePollMs?: number;
  takeoverMs?: number;
  lockPort?: number;
  idleReleaseMs?: number;
  maxGrantMs?: number;
  sharedGrantMs?: number | null;
  clock?: () => number;
  log?: (line: string) => void;
}

export class MemoryGateServer {
  declare socketPath: string;
  declare historyFile: string | null;
  declare grantLogFile: string | null;
  declare grantLogMaxBytes: number;
  declare history: CommandHistory;
  declare clock: () => number;
  declare idleReleaseMs: number;
  declare maxGrantMs: number;
  declare gate: MemoryGate;
  declare sharedGrantMs: number;
  declare scoreFor: MemoryGateServerOptions['scoreFor'];
  declare ownerOf: MemoryGateServerOptions['ownerOf'];
  declare urgentFor: MemoryGateServerOptions['urgentFor'];
  declare readPressure: () => Promise<PressureReading>;
  declare room: () => { mb: number; at: number } | null;
  declare heaviest: () => Holding | null;
  declare running: (pid: number) => boolean;
  declare agentPids: (item: string) => number[];
  declare askedBack: Map<string, { at: number; mb: number }>;
  declare sampleProcesses: () => Promise<ProcessSample[]>;
  declare parentOf: (pid: number) => number | null;
  declare pollMs: number;
  declare idlePollMs: number;
  declare pollEvery?: number;
  declare readAt?: number;
  declare takeoverMs: number;
  declare lockPort: number;
  declare log: (line: string) => void;
  declare role: 'stopped' | 'owner' | 'standby';
  declare grants: Map<string, Grant>;
  declare lastPids: Set<number>;
  declare reading: PressureReading;
  declare counts: { asked: number; waited: number; refused: number; foreign: number; askedBack: number };
  declare dirty: boolean;
  declare stopping?: boolean;
  declare takeoverTimer?: NodeJS.Timeout;
  declare pollTimer?: NodeJS.Timeout;
  declare server?: http.Server | null;
  declare lock?: net.Server | null;
  declare polling?: Promise<void> | null;
  declare saves?: number;
  declare grantBytes?: number;

  constructor({
    socketPath = defaultSocketPath(),
    historyFile = null,
    history = null,
    // One appended line per grant, so what the slots cost can be read later.
    // Without it the only duration anywhere is a transcript's, which is waiting
    // and running added together and cannot be separated.
    grantLogFile = null,
    grantLogMaxBytes = 4 * 1024 * 1024,
    gate = {},
    scoreFor = null,
    // WHOSE CODEX THREAD IS THIS (w-e5225b62ba). A Claude worker carries its row
    // in its environment; one `codex app-server` serves every Codex thread of a
    // login, so there is one environment for all of them and the thread has to
    // say who it is. It does, by the `session_id` in its payload, measured to be
    // the app-server's own `thread.id`. Answering null means "not this app's",
    // and such a command is let straight through.
    ownerOf = null,
    // IS THIS ROW HER URGENT ONE (w-713aba0c89), asked live on every command so
    // a row raised to Urgent counts at once. Only the app answers it: nothing in
    // a worker's own request can make its command urgent.
    urgentFor = null,
    readPressure = readMacPressure,
    room = () => null,
    ramMb,
    heaviest = () => null,
    running = isRunning,
    agentPids = () => [],
    sampleProcesses = listProcesses,
    parentOf = readParentPid,
    pollMs = 2_000,
    // With nothing asked, granted or waiting, a reading is only kept fresh for
    // the status page: the next ask reads again first if this one is stale.
    idlePollMs = 30_000,
    takeoverMs = 5_000,
    // The port whose holder is the one coordinator on this Mac. Fixed so that
    // every Agentbox finds the same one; a test passes its own.
    lockPort = DEFAULT_LOCK_PORT,
    idleReleaseMs = 30_000,
    maxGrantMs = 3 * 60 * 60_000,
    // How long a grant may hold a slot when its end can never be observed,
    // because its memory reading is shared with another command on the same
    // agent process. Null means the longest the gate will make anything wait:
    // a grant nobody can see the end of must not outlive the wait it causes,
    // or a queue is refused one by one while a phantom holds the slot.
    sharedGrantMs = null,
    clock = Date.now,
    log = () => {},
  }: MemoryGateServerOptions = {}) {
    this.socketPath = socketPath;
    this.historyFile = historyFile;
    this.grantLogFile = grantLogFile;
    this.grantLogMaxBytes = grantLogMaxBytes;
    this.history = history ?? loadHistory(historyFile, ramMb);
    this.clock = clock;
    this.idleReleaseMs = idleReleaseMs;
    this.maxGrantMs = maxGrantMs;
    this.gate = new MemoryGate({ heavyMb: this.history.heavyMb, ...gate, history: this.history, clock });
    this.sharedGrantMs = Number.isFinite(sharedGrantMs) ? sharedGrantMs as number : this.gate.maxWaitMs;
    this.scoreFor = scoreFor;
    this.ownerOf = ownerOf;
    this.urgentFor = urgentFor;
    this.readPressure = readPressure;
    this.room = room;
    this.heaviest = heaviest;
    this.running = running;
    this.agentPids = agentPids;
    this.askedBack = new Map();
    this.sampleProcesses = sampleProcesses;
    this.parentOf = parentOf;
    this.pollMs = pollMs;
    this.idlePollMs = idlePollMs;
    this.takeoverMs = takeoverMs;
    this.lockPort = lockPort;
    this.log = log;
    this.role = 'stopped';
    this.grants = new Map();
    this.lastPids = new Set();
    this.reading = { level: null, freePct: null };
    // `foreign` is counted apart from `asked` so the figures on the Agents page
    // stay about this app's own work: a Codex session it did not start is let
    // through and is not one of its agents.
    this.counts = { asked: 0, waited: 0, refused: 0, foreign: 0, askedBack: 0 };
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
    this.pollTimer = undefined;
    // Everything still waiting goes: the gate is off, so nothing should hold.
    for (const w of this.gate.waiting.values()) for (const r of w.replies) r({ allow: true });
    this.gate.waiting.clear();
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections?.();
      try { fs.unlinkSync(this.socketPath); } catch {}
    }
    // The lock goes last, so nobody can take over while the socket is still ours.
    if (this.lock) {
      const lock = this.lock;
      this.lock = null;
      await new Promise<void>((resolve) => lock.close(() => resolve()));
    }
    this._saveHistory();
    this.role = 'stopped';
  }

  setSlots(n: unknown) { this.gate.setSlots(n); }

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
      void this._poll();
      this._pace();
      return;
    }
    this.role = 'standby';
    this.takeoverTimer = setTimeout(() => this._claim(), this.takeoverMs);
    this.takeoverTimer.unref?.();
  }

  // WHO COORDINATES IS DECIDED BY A PORT THE KERNEL HOLDS, NOT BY THE SOCKET
  // FILE (agreed with Codex, 2026-10-05). The socket used to be its own lock:
  // a socket that did not answer within a second was taken for dead, unlinked
  // and replaced, so a stalled owner and a new one could both be running. Now
  // the owner binds 127.0.0.1:`lockPort` first and keeps it for its whole
  // life; the kernel refuses a second bind (EADDRINUSE, measured on macOS) and
  // frees the port only when the owner process dies. Only the holder may
  // unlink and bind the socket, and an app that cannot get the port stands by
  // and never touches anything.
  async _listen() {
    const bind = (server: net.Server, where: string | net.ListenOptions) => new Promise<NodeJS.ErrnoException | null>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => { server.off('listening', onListen); resolve(err); };
      const onListen = () => { server.off('error', onError); resolve(null); };
      server.once('error', onError);
      server.once('listening', onListen);
      server.listen(where);
    });
    const lock = net.createServer((c) => c.destroy());
    const lockErr = await bind(lock, { host: '127.0.0.1', port: this.lockPort, exclusive: true });
    if (lockErr) {
      if (lockErr.code !== 'EADDRINUSE') this.log(`memory gate: could not take the lock: ${lockErr.message}`);
      return false;
    }
    lock.unref?.();
    const server = http.createServer((req, res) => this._handle(req, res));
    let err = await bind(server, this.socketPath);
    if (err?.code === 'EADDRINUSE') {
      // We hold the lock, so whatever sits at the path belongs to an owner that
      // is gone.
      try { fs.unlinkSync(this.socketPath); } catch {}
      err = await bind(server, this.socketPath);
    }
    if (err) {
      this.log(`memory gate: could not listen: ${err.message}`);
      await new Promise<void>((r) => lock.close(() => r()));
      return false;
    }
    try { fs.chmodSync(this.socketPath, 0o600); } catch {}
    this.server = server;
    this.lock = lock;
    return true;
  }

  /* ------------------------------- requests ------------------------------- */

  _handle(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method === 'GET' && req.url === '/status') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(this.status()));
      return;
    }
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { if (raw.length < 1_000_000) raw += d; });
    req.on('end', () => {
      let body: HookBody | null;
      try { body = JSON.parse(raw) as HookBody | null; } catch { res.end(''); return; }
      if (req.url === '/pre') this._pre(body, req, res).catch(() => res.end(''));
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
  _whose(body: HookBody | null, hook: HookPayload): { item: string | null; product: string | null; session?: string } | null {
    const item = typeof body?.item === 'string' ? body.item.trim() : '';
    if (item) return { item, product: body!.product || null };
    const session = typeof hook?.session_id === 'string' ? hook.session_id.trim() : '';
    if (!session) return { item: null, product: body?.product || null };
    if (typeof this.ownerOf !== 'function') return null;
    let owner;
    try { owner = this.ownerOf(session); } catch { return null; }
    if (!owner?.item) return null;
    return { item: String(owner.item), product: owner.product ?? null, session };
  }

  /**
   * A CODEX THREAD'S TURN IS OVER: LET GO OF EVERY GRANT IT STILL HOLDS
   * (w-713aba0c89). Codex sends no "after" report for a command that failed, so
   * such a grant outlives its command, and on a shared app-server nothing else
   * ever sees it end. A turn that has ended is waiting on none of its commands.
   * Only grants that named this thread are touched: a Claude worker's names its
   * row, and goes when its own process does.
   */
  releaseSession(session: unknown) {
    if (typeof session !== 'string' || !session) return;
    for (const r of [...this.gate.running.values()]) {
      if (r.session !== session) continue;
      this.grants.delete(r.id);
      this.gate.finish(r.id);
    }
    this._pace();
  }

  async _pre(body: HookBody | null, req: http.IncomingMessage, res: http.ServerResponse) {
    const hook = body?.hook ?? {};
    const command = hook?.tool_input?.command;
    if (typeof command !== 'string' || !command.trim()) { res.end(''); return; }
    if (this.clock() - (this.readAt ?? 0) > this.pollMs) await this._poll();
    // An asker that gave up during that reading would never send its close.
    if (res.destroyed) return;
    const whose = this._whose(body, hook);
    // A COMMAND THIS APP DID NOT START IS NOT ITS TO HOLD. Only a Codex ask can
    // land here unowned, and letting it run is the only honest answer: holding a
    // stranger's command behind our queue would stall somebody's terminal with
    // nothing on any screen to say why.
    if (!whose) { this.counts.foreign++; res.end(''); return; }
    const id = String(hook.tool_use_id || `${body!.ppid}-${Date.now()}-${Math.random()}`);
    const live = typeof this.scoreFor === 'function' ? this.scoreFor(whose.product, whose.item) : null;
    const score = Number.isFinite(live) ? live : Number(body!.score) || 0;
    let urgent = false;
    try { urgent = typeof this.urgentFor === 'function' && this.urgentFor(whose.product, whose.item) === true; } catch { urgent = false; }
    this.counts.asked++;
    // Read while the hook is alive: on Linux its parent is a `sh -c` launcher
    // that is gone before the first sample could walk up through it.
    const ppid = Number(body!.ppid) || null;
    const lineage = this._lineage(ppid);
    const giveBack = urgent ? null : this._giveBack(whose.item, ppid ? [ppid, ...lineage] : lineage);
    if (giveBack) {
      this.counts.askedBack++;
      this._writeGrant({ refused: false, askedBack: true, cls: this.history.classify(command), waitMs: 0, ranMs: null, peakMb: null, pressure: this.gate.pressure, command });
      res.end(denyOutput(giveBack));
      return;
    }
    let answered = false;
    this.gate.submit({
      id, command, score, urgent, item: whose.item, product: whose.product, session: whose.session ?? null,
      background: !!hook?.tool_input?.run_in_background,
    }, (decision: GateAnswer) => {
      answered = true;
      if (decision.allow) {
        const grant: Grant = this.grants.get(id) ?? {
          id, ppid, lineage, anchor: null, anchorArgs: null,
          baseline: this.lastPids, wallStart: Date.now(), startedAt: this.clock(), ambiguous: false, emptySince: null,
        };
        this.grants.set(id, grant);
        res.end('');
      } else {
        this.counts.refused++;
        this._writeGrant({
          refused: true, cls: decision.cls, waitMs: decision.waitedMs, ranMs: null, peakMb: null,
          pressure: decision.pressure, command,
        });
        res.end(denyOutput(decision.reason));
      }
    });
    if (!answered) this.counts.waited++;
    // The agent stopped waiting (killed, interrupted, timed out): forget it.
    res.on('close', () => {
      if (!answered) { this.gate.finish(id); this._pace(); }
    });
    this._pace();
  }

  /**
   * THE THREAD HOLDING THE MOST IS TOLD SO, ONCE, IN PLACE OF ITS NEXT COMMAND
   * (main/memory-give-back.mts). Whatever the command: a thread deep in a test
   * may ask for nothing heavy for an hour, and it is the telling that matters.
   * Its command run again is queued or run like any other. `asker` is the pids
   * above the hook, which are the agent and must never be among what it is
   * told to stop. A question that throws asks nobody.
   */
  _giveBack(item: string | null, asker: number[]): string | null {
    if (!item) return null;
    let holding: Holding | null;
    try { holding = this.heaviest(); } catch { return null; }
    if (!holding || holding.item !== item) return null;
    const now = this.clock();
    if (!mayAskAgain(this.askedBack.get(item), holding, now)) return null;
    let workers: number[] = [];
    try { workers = this.agentPids(item) ?? []; } catch { workers = []; }
    if (askedByANestedAgent(holding, asker, workers)) return null;
    const ask = giveBackAsk(holding, now, { asker: [...asker, ...workers], running: this.running });
    if (!ask) return null;
    // One thread is asked at a time, so only the latest few are worth keeping.
    if (this.askedBack.size >= 200) this.askedBack.delete(this.askedBack.keys().next().value!);
    this.askedBack.delete(item);
    this.askedBack.set(item, { at: now, mb: holding.mb });
    return ask;
  }

  /** The pids above `pid`, nearest first, as far as they can be read. */
  _lineage(pid: number | null): number[] {
    const out: number[] = [];
    for (let at = pid; at && out.length < 8;) {
      let up: number | null = null;
      try { up = this.parentOf(at); } catch { up = null; }
      if (!up || up <= 1 || out.includes(up)) break;
      out.push(up);
      at = up;
    }
    return out;
  }

  _post(body: HookBody | null) {
    const hook = body?.hook ?? {};
    const id = String(hook.tool_use_id ?? '');
    const grant = this.grants.get(id);
    this.grants.delete(id);
    const was = this.gate.finish(id);
    this._pace();
    if (!was) return;
    this._writeGrant({
      refused: false,
      cls: was.cls,
      waitMs: was.waitedMs ?? 0,
      ranMs: this.clock() - was.startedAt,
      peakMb: grant?.ambiguous ? null : was.peakMb,
      shared: !!grant?.ambiguous,
      pressure: was.pressureAt,
      needMb: was.needMb,
      roomMb: was.roomMb,
      command: was.command,
    });
    // A SHARED READING IS NOT NO READING (w-5601e99977). Every Codex thread of
    // a login runs under one `codex app-server`, so two Codex commands at once
    // are measured together and neither may claim the figure. How long each
    // took is its own, though, and a run that was over inside QUICK_MS counts
    // as light on that alone, so `onlyIfLight` files that verdict and nothing
    // else. Before this, Codex taught the history almost nothing and rode on
    // what Claude workers taught it.
    const filed = this.history.record(was.command, {
      peakMb: grant?.ambiguous ? null : was.peakMb,
      durationMs: Number(hook.duration_ms) || null,
      background: was.background,
      onlyIfLight: !!grant?.ambiguous,
    });
    if (filed) this.dirty = true;
  }

  /* ------------------------------ measuring ------------------------------ */

  _poll(): Promise<void> {
    this.polling ??= this._read().finally(() => { this.polling = null; this._pace(); });
    return this.polling;
  }

  /** The busy rate while anything is asked, granted or waiting, else the idle one. */
  _pace() {
    if (this.role !== 'owner' || this.stopping) return;
    const every = this.grants.size || this.gate.running.size || this.gate.waiting.size ? this.pollMs : this.idlePollMs;
    if (this.pollTimer && this.pollEvery === every) return;
    clearInterval(this.pollTimer);
    this.pollEvery = every;
    this.pollTimer = setInterval(() => { void this._poll(); }, every);
    this.pollTimer.unref?.();
  }

  /** A question that throws is not a reason to hold. */
  _room(): { mb: number; at: number } | null {
    try { return this.room() ?? null; } catch { return null; }
  }

  async _read() {
    try {
      this.reading = await this.readPressure();
      this.readAt = this.clock();
      this.gate.setPressure(pressureFrom(this.reading, GATE_LINES));
      const room = this._room();
      this.gate.setRoom(room?.mb ?? null, room?.at);
      // Processes are only looked at while something is granted: nothing
      // else needs them, and each look costs a `ps`.
      if (this.grants.size) this._sample(await this.sampleProcesses());
      this.gate.tick();
      if (this.dirty && (this.saves = (this.saves ?? 0) + 1) % 15 === 0) this._saveHistory();
    } catch (err) {
      this.log(`memory gate: poll failed: ${(err as Error).message}`);
    }
  }

  /**
   * One look at every process. Each grant finds the agent process it belongs to
   * (the nearest `claude` or `codex` above the hook), and is measured as the
   * new processes under that agent since it was granted. Two grants on one
   * agent at once share what they find, so neither claims that figure; each
   * still teaches the history how long it took (`_post`).
   */
  _sample(procs: ProcessSample[]) {
    const byPid = new Map<number | null, ProcessSample>(procs.map((p) => [p.pid, p]));
    const children = new Map<number, ProcessSample[]>();
    for (const p of procs) {
      if (!children.has(p.ppid)) children.set(p.ppid, []);
      children.get(p.ppid)!.push(p);
    }
    const perAnchor = new Map<number, Grant[]>();
    const now = this.clock();
    for (const grant of this.grants.values()) {
      if (!this.gate.running.has(grant.id)) { this.grants.delete(grant.id); continue; }
      // THE BACKSTOPS THAT DO NOT DEPEND ON WHAT IS RUNNING (w-5601e99977).
      // Both of the other releases need a reading of the grant's own
      // processes, and a Codex grant never gets one: its anchor is the shared
      // app-server, where a sibling thread's work keeps the reading above zero
      // for good. So a grant that was ever measured together with another
      // (`ambiguous`, which nothing clears) is let go after `sharedGrantMs`,
      // and no grant at all outlives `maxGrantMs`. This used to be checked
      // only while no anchor had been found, so a Codex command whose "after"
      // report was lost held one of two heavy slots until the app-server was
      // replaced.
      //
      // LETTING A SLOT GO IS NOT LETTING GO OF THE MACHINE. Nothing is
      // stopped, and if the command really is still running and really is big,
      // the kernel's own pressure reading holds the next heavy command back
      // anyway.
      const held = now - grant.startedAt;
      if (held >= this.maxGrantMs || (grant.ambiguous && held >= this.sharedGrantMs)) {
        this.grants.delete(grant.id);
        this.gate.finish(grant.id);
        continue;
      }
      if (!grant.anchor) {
        let at = byPid.get(grant.ppid);
        for (let up = 0; at && up < 8 && !AGENT.test(at.args); up++) at = byPid.get(at.ppid);
        // A recorded pid counts only while an agent that was already running
        // when the command was allowed still holds it, never a reused one.
        const recorded = () => grant.lineage.map((pid) => byPid.get(pid))
          .find((p) => p && AGENT.test(p.args) && !((p.startedAt ?? 0) > grant.wallStart));
        const found = (at && AGENT.test(at.args) ? at : recorded()) ?? byPid.get(grant.ppid);
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
      perAnchor.get(anchor.pid)!.push(grant);
    }
    for (const [anchorPid, grants] of perAnchor) {
      // A process is the command's when it started after the earliest grant
      // on this agent. `ps` reports start to the second, so a second's margin
      // errs toward counting. Without a start time, anything not seen in the
      // previous look counts instead.
      const since = Math.min(...grants.map((g) => g.wallStart)) - 1_000;
      const baseline = grants.reduce<Set<number> | null>((acc, g) => (acc && g.baseline.size < acc.size ? g.baseline : acc ?? g.baseline), null);
      const ours = (p: ProcessSample) => (typeof p.startedAt === 'number' ? p.startedAt >= since : !baseline!.has(p.pid));
      // Under Claude Code each command is a new shell the agent starts, so what
      // the agent started before these grants (an MCP server, an earlier
      // command sent to the background) is not their work, and nor is anything
      // it starts later, however new. Codex's own tree is unmeasured, so it
      // keeps the old reading.
      const claude = CLAUDE_AGENT.test(byPid.get(anchorPid)?.args ?? '');
      const older = (p: ProcessSample) => claude && typeof p.startedAt === 'number' && p.startedAt < since;
      let mb = 0;
      const stack = (children.get(anchorPid) ?? []).filter((p) => !older(p));
      while (stack.length) {
        const p = stack.pop()!;
        if (HOOK.test(p.args)) continue;
        if (ours(p)) mb += p.mb;
        stack.push(...(children.get(p.pid) ?? []));
      }
      for (const g of grants) {
        if (grants.length > 1) {
          g.ambiguous = true;
          if (claude) g.sharedNow = true;
          this.gate.share(g.id, anchorPid);
          this.gate.observe(g.id, Math.round(mb));
        } else {
          g.soloPeakMb = Math.max(g.soloPeakMb ?? 0, Math.round(mb));
          if (g.sharedNow) {
            // The others it was measured with are gone, so their peak goes
            // too, and what it reached on its own stays.
            g.sharedNow = false;
            this.gate.restartPeak(g.id, g.soloPeakMb);
          } else {
            this.gate.observe(g.id, Math.round(mb));
          }
        }
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

  /**
   * One line per grant: what it was, how long it queued, how long it ran and
   * its measured peak. `shared` says the peak is null because two commands on
   * one agent process were measured together, without which a week of this
   * reads as two commands where there was one.
   *
   * Every shell command on the Mac waits on this path, so a write that fails
   * is logged and swallowed rather than returned to the agent.
   */
  _writeGrant({ refused, askedBack = false, cls, waitMs, ranMs, peakMb, shared = false, pressure = null, needMb, roomMb, command }: GrantLine) {
    if (!this.grantLogFile) return;
    try {
      if (this.grantBytes === undefined) {
        try { this.grantBytes = fs.statSync(this.grantLogFile).size; } catch { this.grantBytes = 0; }
      }
      // Bounded, and the one before it is kept, so a week is still readable
      // across the two even when a busy day fills one.
      if (this.grantBytes >= this.grantLogMaxBytes) {
        fs.renameSync(this.grantLogFile, `${this.grantLogFile}.1`);
        this.grantBytes = 0;
      }
      const line = `${JSON.stringify({
        t: this.clock(),
        cls: cls ?? null,
        waitMs: Number.isFinite(waitMs) ? waitMs : null,
        ranMs: Number.isFinite(ranMs) ? ranMs : null,
        peakMb: Number.isFinite(peakMb) ? peakMb : null,
        // Only a wait that happened while this was `normal` is evidence about
        // the slot count; under `tight` nothing heavy starts whatever it is.
        pressure: pressure ?? null,
        ...(shared ? { shared: true } : {}),
        ...(Number.isFinite(needMb) ? { need: needMb } : {}),
        ...(Number.isFinite(roomMb) ? { room: roomMb } : {}),
        ...(refused ? { refused: true } : {}),
        ...(askedBack ? { askedBack: true } : {}),
        cmd: String(command ?? '').slice(0, 300),
      })}\n`;
      fs.appendFileSync(this.grantLogFile, line);
      this.grantBytes += Buffer.byteLength(line);
    } catch (err) {
      this.log(`memory gate: could not write the grant log: ${(err as Error).message}`);
    }
  }

  _saveHistory() {
    if (!this.historyFile || !this.dirty) return;
    try {
      const tmp = `${this.historyFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.history.toJSON()));
      fs.renameSync(tmp, this.historyFile);
      this.dirty = false;
    } catch (err) { this.log(`memory gate: could not save history: ${(err as Error).message}`); }
  }
}

function loadHistory(file: string | null, ramMb?: number) {
  if (!file) return new CommandHistory({ ramMb });
  try { return CommandHistory.fromJSON(JSON.parse(fs.readFileSync(file, 'utf8')), { ramMb }); } catch { return new CommandHistory({ ramMb }); }
}
