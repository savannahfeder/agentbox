// WHAT FINISHED AGENTS LEFT RUNNING, AND STOPPING IT WHEN MEMORY IS SHORT (w-3958c3753d).
//
// THE NIGHT THIS IS FOR. 2026-10-05, a 16 GB Mac after a night of agents:
// "Your system has run out of application memory", and every agent was
// already done. What was holding the memory, measured that morning, was work
// that had ended: two Next.js dev servers (14 hours and almost 3 days old),
// three video preview servers with their headless browsers, three copies of
// a test script, 3.3 GB together, and Docker Desktop, started by one of those
// agents, holding 4.5 GB more in its virtual machine. Each night's leftovers
// stacked on the last. The memory check (main/memory-gate.mjs) only decides
// when a command may START, so it could do nothing about any of it.
//
// HOW A LEFTOVER IS KNOWN. Every worker is spawned with ZERO_ITEM=<task id>
// (main/supervisor.mjs) and everything it starts inherits it: all eight
// leftovers that morning carried it, Docker's backend included. A program that
// renames itself (next-server) hides its environment from `ps`, so a process
// under a tagged one belongs to the same task. A task's programs are left over
// when no agent for that task is running: no `claude` or `codex` process
// carrying its id, and no session the app knows of.
//
// WHEN THEY ARE STOPPED. Only while memory is tight or critical, and only for a
// task seen with no agent on two looks at least `confirmMs` apart, so a reply
// that is restarting the agent is not raced. Never while memory is fine: an
// agent may leave a preview server up on purpose for somebody to open, and
// clearing those on a timer would break the link in its answer. Programs no
// agent started are never touched: the app, a browser, a terminal session.
//
// HOW. SIGTERM to each, and SIGKILL `forceAfterMs` later to any still running,
// only when its pid still belongs to the same program (same start time), so a
// pid reused after the first stop is never hit.

import { execFile } from 'node:child_process';

/** `ps` elapsed time, `[[dd-]hh:]mm:ss`, in seconds. */
export function etimeSeconds(etime) {
  const m = String(etime).match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return null;
  return (+(m[1] ?? 0)) * 86_400 + (+(m[2] ?? 0)) * 3_600 + (+m[3]) * 60 + (+m[4]);
}

/**
 * Lines of `ps -E -ww -axo pid=,ppid=,etime=,rss=,command=`: each program's
 * command line with its environment after it. Returns pid, parent, start time,
 * resident MB, the command without its environment, and the task id, or null.
 */
export function parseEnvListing(text, now = Date.now()) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const age = etimeSeconds(m[3]);
    const rest = m[5];
    out.push({
      pid: +m[1],
      ppid: +m[2],
      startedAt: age === null ? null : now - age * 1000,
      mb: +m[4] / 1024,
      cmd: rest.split(/\s(?=[A-Za-z_][A-Za-z0-9_]*=)/)[0].slice(0, 300),
      item: rest.match(/(?:^|\s)ZERO_ITEM=(w-[0-9a-f]+)(?=\s|$)/)?.[1] ?? null,
      product: rest.match(/(?:^|\s)ZERO_PRODUCT=(\S+)/)?.[1] ?? null,
    });
  }
  return out;
}

export async function listProcessesWithTasks() {
  const out = await new Promise((resolve, reject) => {
    execFile('/bin/ps', ['-E', '-ww', '-axo', 'pid=,ppid=,etime=,rss=,command='], { timeout: 10_000, maxBuffer: 256 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
  return parseEnvListing(out, Date.now());
}

const AGENT = /(^|\/)(claude|codex)(\s|$)|\/claude\/versions\//;

/**
 * The programs of tasks that have no agent running, grouped by task:
 * `[{ item, product, procs, mb }]`. `live(item)` is the app's own word that a
 * task has a session, for the moment before its agent process exists.
 */
export function leftovers(procs, { live = () => false } = {}) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const itemOf = new Map();
  const productOf = new Map();
  const resolve = (p, depth = 0) => {
    if (itemOf.has(p.pid)) return itemOf.get(p.pid);
    let item = p.item ?? null;
    if (!item && depth < 64) {
      const parent = byPid.get(p.ppid);
      if (parent && parent.pid !== p.pid) item = resolve(parent, depth + 1);
    }
    itemOf.set(p.pid, item);
    return item;
  };
  for (const p of procs) {
    const item = resolve(p);
    if (item && p.product && !productOf.has(item)) productOf.set(item, p.product);
  }
  const running = new Set();
  for (const p of procs) if (p.item && AGENT.test(p.cmd)) running.add(p.item);
  const groups = new Map();
  for (const p of procs) {
    const item = itemOf.get(p.pid);
    if (!item || running.has(item) || live(item)) continue;
    if (!groups.has(item)) groups.set(item, { item, product: productOf.get(item) ?? null, procs: [], mb: 0 });
    const g = groups.get(item);
    g.procs.push(p);
    g.mb += p.mb ?? 0;
  }
  return [...groups.values()];
}

export class LeftoverSweeper {
  constructor({
    list = listProcessesWithTasks,
    live = () => false,
    kill = (pid, sig) => process.kill(pid, sig),
    clock = Date.now,
    confirmMs = 60_000,
    forceAfterMs = 10_000,
    log = () => {},
  } = {}) {
    Object.assign(this, { list, live, kill, clock, confirmMs, forceAfterMs, log });
    this.seen = new Map();
    this.pending = [];
    this.last = null;
  }

  /** One look. Stops nothing unless `pressure` is tight or critical. */
  async sweep(pressure) {
    if (pressure !== 'tight' && pressure !== 'critical') { this.seen.clear(); return null; }
    let procs;
    try { procs = await this.list(); } catch (err) { this.log(`leftovers: could not list processes: ${err.message}`); return null; }
    const now = this.clock();
    const groups = leftovers(procs, { live: this.live });
    const current = new Set(groups.map((g) => g.item));
    for (const item of [...this.seen.keys()]) if (!current.has(item)) this.seen.delete(item);
    const ready = [];
    for (const g of groups) {
      if (!this.seen.has(g.item)) { this.seen.set(g.item, now); continue; }
      if (now - this.seen.get(g.item) >= this.confirmMs) ready.push(g);
    }
    if (!ready.length) return null;
    let programs = 0;
    let mb = 0;
    for (const g of ready) {
      this.seen.delete(g.item);
      for (const p of g.procs) {
        try { this.kill(p.pid, 'SIGTERM'); } catch { continue; }
        programs++;
        mb += p.mb ?? 0;
        this.pending.push({ pid: p.pid, startedAt: p.startedAt, at: now });
      }
      this.log(`leftovers: memory is ${pressure}; stopped ${g.procs.length} program(s) ${g.item} left running`);
    }
    this.last = { at: now, programs, tasks: ready.length, mb, items: ready.map((g) => g.item) };
    const t = setTimeout(() => { this.finishStops().catch(() => {}); }, this.forceAfterMs + 50);
    t.unref?.();
    return this.last;
  }

  /** Force whatever was asked to stop and is still the same program. */
  async finishStops() {
    const now = this.clock();
    const due = this.pending.filter((s) => now - s.at >= this.forceAfterMs);
    if (!due.length) return;
    this.pending = this.pending.filter((s) => !due.includes(s));
    let procs;
    try { procs = await this.list(); } catch { return; }
    const byPid = new Map(procs.map((p) => [p.pid, p]));
    for (const s of due) {
      const p = byPid.get(s.pid);
      if (!p) continue;
      const same = s.startedAt === null || p.startedAt === null ? false : Math.abs(p.startedAt - s.startedAt) < 2_000;
      if (!same) continue;
      try { this.kill(s.pid, 'SIGKILL'); } catch {}
    }
  }
}
