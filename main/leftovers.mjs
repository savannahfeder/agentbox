// WHAT FINISHED AGENTS LEAVE RUNNING, AND STOPPING IT ON A RULE THE PERSON TURNED ON (w-3958c3753d).
//
// THE NIGHT THIS IS FOR. 2026-10-05, a 16 GB Mac after a night of agents:
// "Your system has run out of application memory", and every agent was
// already done. Measured that morning: programs finished agents had started
// and never stopped held 3.3 GB (two Next.js dev servers, one almost 3 days
// old; three video preview servers with headless browsers; three copies of a
// test script), and Docker Desktop, started by one of those agents, 4.5 GB more
// in its virtual machine. Each night's leftovers stacked on the last. Stopping
// the 40 programs of those 7 tasks by hand took swap from 7.4 GB to 4.2 GB.
//
// THE RULES, AGREED WITH CODEX OVER FOUR ROUNDS. The first version stopped
// anything carrying a task id whenever memory got tight, under the memory
// switch; Codex took it apart (a tag is provenance, not ownership; silence is
// not death; a timer is not consent), and this is what survived:
//
//   1. IT IS ITS OWN SWITCH, OFF BY DEFAULT. With it off nothing is stopped and
//      leftovers are only reported. Its text states the whole policy.
//   2. ONLY THIS APP'S OWN TASKS. A task only ever runs in the app whose store
//      it is in, so the app knows for certain when its runs start and end: a
//      run's start is registered here, synchronously, before the worker is
//      spawned, which cancels anything pending for that task, and its end is
//      registered when the session ends. Records are kept on disk.
//   3. A TASK IS FINISHED ONLY ON AN ENDED RUN: the session ended here, or a run
//      left "running" by a crash whose worker process is seen gone. A task with
//      leftovers and no record at all is recorded as ended when this app, whose
//      store it is in, has no session for it; the clock starts then, never
//      back-dated.
//   4. ITS PROGRAMS STOP `idleMs` (2 h) AFTER THE RUN ENDED, or `tightIdleMs`
//      (10 min) while memory is tight or critical, and never sooner than that
//      long after the switch went on.
//   5. NOTHING PROTECTED IS EVER STOPPED: AGENTBOX_KEEP=1 in its environment,
//      an executable inside an installed app or the system (Docker Desktop and
//      its VM, a browser an agent opened), an executable that cannot be read,
//      and anything started under one of those. Protection is remembered per
//      process and kept on disk, so it survives its parent exiting.
//   6. A PROCESS MUST BE THE SAME PROGRAM ON TWO LOOKS `confirmMs` (1 min)
//      APART, and again on a fresh look taken immediately before the signal,
//      which also rechecks the switch, the task's runs and protection. Same
//      program means pid, start time (to the second, from `lstart`) and
//      executable path all equal. That is approximate: a pid reused within the
//      same second by the same executable would pass, and a program could exit
//      in the milliseconds between the last look and the signal.
//   7. SIGTERM ONLY, NEVER SIGKILL. What is still running `settleMs` (30 s)
//      later is reported, and the next agent started on that task is told those
//      programs are shutting down and must not be reused.
//
// HOW A PROGRAM IS TIED TO A TASK. Every worker is spawned with ZERO_ITEM=<task>
// (main/supervisor.mjs) and everything it starts inherits it; all 40 leftovers
// that morning carried it, Docker's backend included. The id is read only from
// the ENVIRONMENT, which is the part of `ps -E` after the arguments `ps` prints
// without it, and only when both looks agree it is the same process; a tag in a
// command's own words counts for nothing. A program that renames itself
// (next-server) hides its environment, so a process under a tagged one belongs
// to the same task. Codex threads share one app-server and their commands carry
// no task id yet, so a Codex task's leftovers are not found: coverage is
// incomplete and the switch says so.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pressureFrom } from './memory-gate.mjs';

const LSTART = String.raw`\w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d \d{4}`;

/** `ps` elapsed time, `[[dd-]hh:]mm:ss`, in seconds. */
export function etimeSeconds(etime) {
  const m = String(etime).match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return null;
  return (+(m[1] ?? 0)) * 86_400 + (+(m[2] ?? 0)) * 3_600 + (+m[3]) * 60 + (+m[4]);
}

/** `ps` lstart, "Mon Oct  5 11:11:52 2026" in local time, as epoch seconds. */
export function lstartSeconds(text) {
  const m = String(text).trim().match(/^\w{3} (\w{3}) +(\d+) (\d\d):(\d\d):(\d\d) (\d{4})$/);
  if (!m) return null;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]);
  if (month < 0) return null;
  return Math.floor(new Date(+m[6], month, +m[2], +m[3], +m[4], +m[5]).getTime() / 1000);
}

/**
 * Three listings of the same moment into one record per process:
 *   base: `ps -axo pid=,ppid=,rss=,lstart=,comm=`  (comm is the exec'd path)
 *   argv: `ps -ww -axo pid=,lstart=,command=`
 *   full: `ps -E -ww -axo pid=,lstart=,command=`   (arguments, then environment)
 */
export function parseListings({ base, argv, full }) {
  const lines = (text, re) => {
    const map = new Map();
    for (const line of String(text ?? '').split('\n')) {
      const m = line.match(re);
      if (m) map.set(+m[1], m);
    }
    return map;
  };
  const cmdRe = new RegExp(`^\\s*(\\d+)\\s+(${LSTART})\\s+(.*)$`);
  const a = lines(argv, cmdRe);
  const f = lines(full, cmdRe);
  const out = [];
  for (const m of lines(base, new RegExp(`^\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(${LSTART})\\s*(.*)$`)).values()) {
    const pid = +m[1];
    const start = lstartSeconds(m[4]);
    const args = a.get(pid);
    const all = f.get(pid);
    let env = null;
    // The environment is only what `ps -E` adds after the arguments, and only
    // when both looks are of the same program.
    if (args && all && lstartSeconds(args[2]) === start && lstartSeconds(all[2]) === start
      && all[3].startsWith(args[3])) {
      env = all[3].slice(args[3].length);
    }
    out.push({
      pid,
      ppid: +m[2],
      mb: +m[3] / 1024,
      start,
      exe: m[5].trim(),
      cmd: (args?.[3] ?? '').slice(0, 300),
      item: env?.match(/(?:^|\s)ZERO_ITEM=(w-[0-9a-f]+)(?=\s|$)/)?.[1] ?? null,
      product: env?.match(/(?:^|\s)ZERO_PRODUCT=(\S+)/)?.[1] ?? null,
      keep: env ? /(?:^|\s)AGENTBOX_KEEP=1(?=\s|$)/.test(env) : false,
    });
  }
  return out;
}

function ps(args) {
  return new Promise((resolve, reject) => {
    execFile('/bin/ps', args, { timeout: 10_000, maxBuffer: 256 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

/**
 * A program that renames itself (Next.js's dev server sets process.title)
 * makes macOS report that name as its executable, "next-server (e2e" where the
 * path should be. Found on the real Mac, 2026-10-05: read as an executable we
 * could not see, every dev server was kept forever. `lsof -d txt` names the
 * real file; its first `n` line per process is the executable. A process lsof
 * cannot read keeps its name, and so stays protected.
 */
export function applyExecutables(procs, lsofText) {
  const real = new Map();
  let pid = null;
  for (const line of String(lsofText ?? '').split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && pid !== null && !real.has(pid) && line.slice(1).startsWith('/')) real.set(pid, line.slice(1));
  }
  for (const p of procs) if (!p.exe?.startsWith('/') && real.has(p.pid)) p.exe = real.get(p.pid);
  return procs;
}

/** Every process on the Mac, tagged with its task where it can be. About 100 ms. */
export async function listProcesses() {
  const [base, argv, full] = await Promise.all([
    ps(['-axo', 'pid=,ppid=,rss=,lstart=,comm=']),
    ps(['-ww', '-axo', 'pid=,lstart=,command=']),
    ps(['-E', '-ww', '-axo', 'pid=,lstart=,command=']),
  ]);
  const procs = parseListings({ base, argv, full });
  const renamed = procs.filter((p) => !p.exe.startsWith('/')).map((p) => p.pid);
  if (renamed.length) {
    const out = await new Promise((resolve) => {
      execFile('/usr/sbin/lsof', ['-a', '-p', renamed.join(','), '-d', 'txt', '-Fpn'], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 },
        (_err, stdout) => resolve(stdout ?? ''));
    });
    applyExecutables(procs, out);
  }
  return procs;
}

async function readMacPressureWord() {
  const out = await new Promise((resolve) => {
    execFile('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level', 'kern.memorystatus_level'], { timeout: 5_000 },
      (err, stdout) => resolve(err ? '' : stdout));
  });
  const [level, freePct] = String(out).trim().split(/\s+/).map(Number);
  return pressureFrom({ level: Number.isFinite(level) ? level : null, freePct: Number.isFinite(freePct) ? freePct : null });
}

/**
 * An installed app or macOS itself: never stopped, and neither is anything an
 * installed app starts. Only these, and not every system binary: launchd
 * adopts every orphan and Claude Code runs commands through /bin/zsh, so
 * treating /sbin or /bin as protective protected every dev server an agent ever
 * left (found by Codex in review, 2026-10-05).
 */
export function isAppPath(exe, home = os.homedir()) {
  if (!exe || !exe.startsWith('/')) return false;
  return /^\/Applications\/[^/]+\.app\//.test(exe)
    || /^\/System\//.test(exe)
    || (exe.startsWith(`${home}/Applications/`) && /\.app\//.test(exe));
}

/** An executable we could not read is kept, for itself only. */
const unreadable = (exe) => !exe || !exe.startsWith('/');

/** An agent itself, which is never stopped and keeps its task alive. */
export function isAgentProcess(p) {
  const first = String(p.cmd ?? '').split(/\s/)[0];
  return [p.exe, first].some((s) => /(^|\/)(claude|codex)$/.test(String(s ?? '')) || /\/claude\/versions\//.test(String(s ?? '')));
}

const idOf = (p) => `${p.pid}:${p.start}:${p.exe}`;
const FORMAT = 2;

export class LeftoverCleaner {
  constructor({
    list = listProcesses,
    kill = (pid, sig) => process.kill(pid, sig),
    clock = Date.now,
    readPressure = readMacPressureWord,
    file = null,
    enabledSince = Date.now(),
    live = () => false,
    owns = () => false,
    idleMs = 2 * 60 * 60_000,
    tightIdleMs = 10 * 60_000,
    confirmMs = 60_000,
    settleMs = 30_000,
    home = os.homedir(),
    // Off means look and report, never signal (agreed with Codex: the person
    // sees what turning it on would stop before they do).
    enabled = true,
    log = () => {},
  } = {}) {
    Object.assign(this, { list, kill, clock, readPressure, file, enabledSince, live, owns, idleMs, tightIdleMs, confirmMs, settleMs, home, enabled, log });
    this.firstSeen = new Map();
    this.lastStatus = { leftovers: [], survivors: [], stopped: null, pressure: 'normal' };
    const saved = this._load();
    this.runs = saved.runs;
    this.protectedIds = new Set(saved.protectedIds);
    this.taskOf = new Map(saved.taskOf);
    this.stopping = saved.stopping;
  }

  /* ----------------------------- what the app says ----------------------------- */

  /**
   * A run is about to start on `item`. Called synchronously before the worker
   * is spawned, so nothing for this task can be stopped from here on. Returns a
   * sentence for the agent when programs of this task are still shutting down,
   * or null.
   */
  starting(item) {
    if (!item) return null;
    this.runs[item] = { state: 'running', since: this.clock(), worker: null };
    this._save();
    return this.stoppingNote(item);
  }

  /** The sentence for an agent about this task's programs still shutting down, or null. */
  stoppingNote(item) {
    const left = Object.values(this.stopping).filter((s) => s.item === item);
    if (!left.length) return null;
    return `Programs from an earlier run of this task were asked to stop and may still be shutting down: ${left.map((s) => `pid ${s.pid} (${s.cmd || s.exe})`).join(', ')}. Do not reuse them; start what you need afresh.`;
  }

  /** The worker process of the run just started, so a crash can be told from a run. */
  worker(item, pid) {
    const run = this.runs[item];
    if (!run || run.state !== 'running') return;
    run.worker = { pid, id: null };
    this._save();
  }

  /** The run on `item` ended in this app. */
  ended(item) {
    if (!item) return;
    this.runs[item] = { state: 'ended', endedAt: this.clock() };
    this._save();
  }

  status() { return this.lastStatus; }

  /** Stop signalling from this moment, even in a look already under way. */
  disable() { this.enabled = false; }

  enable(since = this.clock()) {
    this.enabled = true;
    this.enabledSince = since;
  }

  /**
   * How long a run on `item` should wait before starting, because programs of
   * this task were asked to stop under `settleMs` ago and may still be on their
   * way out. 0 when there is nothing to wait for.
   */
  holdMs(item) {
    const now = this.clock();
    let wait = 0;
    for (const s of Object.values(this.stopping)) {
      if (s.item === item) wait = Math.max(wait, s.at + this.settleMs - now);
    }
    return Math.max(0, wait);
  }

  /* ---------------------------------- a look ---------------------------------- */

  async tick() {
    const now = this.clock();
    let pressure = 'normal';
    try { pressure = await this.readPressure(); } catch {}
    let procs;
    try { procs = await this.list(); } catch (err) {
      this.log(`leftovers: could not list processes: ${err.message}`);
      return this.lastStatus;
    }
    const view = this._view(procs, now);
    this._reconcileRuns(view, now);
    this._trackStopping(view, now);
    const due = this._due(view, now, pressure);
    let stopped = null;
    if (due.length) stopped = await this._stop(due, pressure);
    this.lastStatus = {
      pressure,
      leftovers: this._report(view, now, pressure),
      survivors: Object.values(this.stopping).filter((s) => now - s.at >= this.settleMs),
      stopped: stopped ?? this.lastStatus.stopped,
    };
    this._save();
    return this.lastStatus;
  }

  /**
   * Processes by task, with protection worked out. Remembers when each
   * identity was first seen, and every identity found protected.
   */
  _view(procs, now) {
    const byPid = new Map(procs.map((p) => [p.pid, p]));
    const memo = new Map();
    const none = { item: null, inherits: false };
    const resolve = (p, depth = 0) => {
      if (memo.has(p.pid)) return memo.get(p.pid);
      memo.set(p.pid, none);
      const parent = depth < 64 ? byPid.get(p.ppid) : null;
      const up = parent && parent.pid !== p.pid ? resolve(parent, depth + 1) : none;
      // A process keeps the task it was first found under: when its parent
      // exits first, launchd adopts it and the parent is no longer there to
      // say whose it is.
      const item = p.item ?? up.item ?? this.taskOf.get(idOf(p)) ?? null;
      // Protection passes down only from a kept program or an installed app
      // that belongs to a task, never from launchd, a shell or the app that
      // spawned the agent (Codex's review, 2026-10-05). An executable that
      // cannot be read keeps that one process and passes nothing on.
      const inherits = !!(p.keep || isAppPath(p.exe, this.home) || this.protectedIds.has(idOf(p)) || (up.item && up.inherits));
      const r = { item, inherits, guard: inherits || unreadable(p.exe), agent: isAgentProcess(p) };
      memo.set(p.pid, r);
      return r;
    };
    const seen = new Set();
    const tasks = new Map();
    for (const p of procs) {
      const id = idOf(p);
      seen.add(id);
      if (!this.firstSeen.has(id)) this.firstSeen.set(id, now);
      const r = resolve(p);
      if (!r.item) continue;
      if (r.inherits) this.protectedIds.add(id);
      this.taskOf.set(id, r.item);
      if (!tasks.has(r.item)) tasks.set(r.item, { item: r.item, product: null, procs: [], guarded: [], agents: [] });
      const t = tasks.get(r.item);
      if (p.product && !t.product) t.product = p.product;
      // An agent is never a leftover: it is the run itself, alive.
      if (r.agent) t.agents.push(p);
      else if (r.guard) t.guarded.push(p);
      else t.procs.push(p);
    }
    for (const id of [...this.firstSeen.keys()]) if (!seen.has(id)) this.firstSeen.delete(id);
    for (const id of [...this.protectedIds]) if (!seen.has(id)) this.protectedIds.delete(id);
    for (const id of [...this.taskOf.keys()]) if (!seen.has(id)) this.taskOf.delete(id);
    return { procs, byPid, tasks, seen };
  }

  /** Crashes and unknown tasks, turned into records the rules can use. */
  _reconcileRuns(view, now) {
    for (const [item, run] of Object.entries(this.runs)) {
      if (run.state !== 'running' || !run.worker) continue;
      const p = view.byPid.get(run.worker.pid);
      if (p && !run.worker.id) { run.worker.id = idOf(p); continue; }
      const gone = !p || (run.worker.id && idOf(p) !== run.worker.id);
      const t = view.tasks.get(item);
      if (gone && !this.live(item) && !t?.agents.length) this.runs[item] = { state: 'ended', endedAt: now, why: 'worker gone' };
    }
    // A task of this app's own store with leftovers, no record, no session
    // here and NO AGENT PROCESS carrying its id: its run is over. With an agent
    // process still alive (a worker that outlived a crashed app) it is not,
    // whatever this app remembers (Codex's review, 2026-10-05).
    for (const t of view.tasks.values()) {
      if (this.runs[t.item] || this._alive(t)) continue;
      if (this.owns(t.item, t.product)) this.runs[t.item] = { state: 'ended', endedAt: now, why: 'no session here' };
    }
  }

  /** A task with a session in this app, or any agent process carrying its id. */
  _alive(t) {
    return this.live(t.item) || t.agents.length > 0;
  }

  _trackStopping(view, now) {
    for (const [id, s] of Object.entries(this.stopping)) {
      if (!view.seen.has(id)) delete this.stopping[id];
      else s.seenAt = now;
    }
  }

  _stopsAt(item, pressure) {
    const run = this.runs[item];
    if (!run || run.state !== 'ended') return null;
    const from = Math.max(run.endedAt, this.enabledSince);
    return from + (pressure === 'normal' ? this.idleMs : this.tightIdleMs);
  }

  /** Programs whose time has come and that have been seen long enough. */
  _due(view, now, pressure) {
    const due = [];
    if (!this.enabled) return due;
    for (const t of view.tasks.values()) {
      if (this._alive(t)) continue;
      const at = this._stopsAt(t.item, pressure);
      if (at === null || now < at) continue;
      for (const p of t.procs) {
        const id = idOf(p);
        if (this.stopping[id]) continue;
        if (now - (this.firstSeen.get(id) ?? now) < this.confirmMs) continue;
        due.push({ item: t.item, id, pid: p.pid });
      }
    }
    return due;
  }

  /** One fresh look, every rule again, then SIGTERM to what still passes. */
  async _stop(due, pressure) {
    let procs;
    try { procs = await this.list(); } catch { return null; }
    const now = this.clock();
    const view = this._view(procs, now);
    const byId = new Map(procs.map((p) => [idOf(p), p]));
    let programs = 0;
    let mb = 0;
    const items = new Set();
    for (const d of due) {
      const p = byId.get(d.id);
      if (!p) continue;
      const t = view.tasks.get(d.item);
      if (!t || !t.procs.includes(p)) continue; // protected now, or no longer this task's
      if (this._alive(t)) continue;
      const at = this._stopsAt(d.item, pressure);
      if (at === null || now < at) continue; // a run started meanwhile
      // Switched off while this look was under way: nothing more is signalled.
      if (!this.enabled) break;
      try { this.kill(p.pid, 'SIGTERM'); } catch { continue; }
      this.stopping[d.id] = { item: d.item, pid: p.pid, cmd: p.cmd.slice(0, 80), exe: p.exe, at: now };
      programs++;
      mb += p.mb ?? 0;
      items.add(d.item);
    }
    if (!programs) return null;
    this.log(`leftovers: asked ${programs} program(s) of ${items.size} finished task(s) to stop`);
    return { at: now, programs, tasks: items.size, mb, items: [...items] };
  }

  _report(view, now, pressure) {
    const out = [];
    for (const t of view.tasks.values()) {
      if (this._alive(t)) continue;
      const run = this.runs[t.item];
      if (run?.state === 'running') continue;
      const all = [...t.procs, ...t.guarded];
      out.push({
        item: t.item,
        product: t.product,
        programs: t.procs.length,
        kept: t.guarded.length,
        mb: all.reduce((n, p) => n + (p.mb ?? 0), 0),
        oldest: Math.min(...all.map((p) => p.start * 1000)),
        stopsAt: t.procs.length ? this._stopsAt(t.item, pressure) : null,
      });
    }
    return out.sort((a, b) => a.oldest - b.oldest);
  }

  /* --------------------------------- on disk --------------------------------- */

  _load() {
    const empty = { runs: {}, protectedIds: [], taskOf: [], stopping: {} };
    if (!this.file) return empty;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      // Protection and attribution saved by an earlier format were worked out
      // by rules since found wrong (protection spread from launchd and shells),
      // so they are thrown away rather than trusted; run records stay.
      const current = raw?.v === FORMAT;
      return {
        runs: raw?.runs && typeof raw.runs === 'object' ? raw.runs : {},
        protectedIds: current && Array.isArray(raw?.protectedIds) ? raw.protectedIds : [],
        taskOf: current && Array.isArray(raw?.taskOf) ? raw.taskOf.filter((e) => Array.isArray(e) && e.length === 2) : [],
        stopping: raw?.stopping && typeof raw.stopping === 'object' ? raw.stopping : {},
      };
    } catch { return empty; }
  }

  _save() {
    if (!this.file) return;
    // Old records go: an ended run older than a week cannot matter any more.
    const week = this.clock() - 7 * 24 * 60 * 60_000;
    for (const [item, run] of Object.entries(this.runs)) if (run.state === 'ended' && run.endedAt < week) delete this.runs[item];
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ v: FORMAT, runs: this.runs, protectedIds: [...this.protectedIds], taskOf: [...this.taskOf], stopping: this.stopping }));
      fs.renameSync(tmp, this.file);
    } catch (err) { this.log(`leftovers: could not save: ${err.message}`); }
  }
}
