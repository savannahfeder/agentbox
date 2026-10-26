// THE WATCHER: WHAT THE MACHINE CAN SEE THAT A TESTER WALKS PAST.
//
// A tester notices what is on the screen. Every minute this reads what is
// under it, for the bugs that never show there or show only after an hour: a
// thread asked and never answered or told why, a thread started over and over,
// errors in the app's log, the app's memory climbing, more agents running than
// the app allows, a screen that stops answering. Its findings sit beside the
// tester's in the report, as facts rather than impressions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Threads whose last ask (the opening task, or a reply) has had no answer and
 * no word from the app (a result or a note) for `afterMs`. Closed, put-off and
 * seeded threads are left out. With afterMs 0 it is what is going at once.
 */
export function waitingTooLong(lines, now, { afterMs, seeded = new Set() }) {
  const threads = new Map();
  for (const l of [...lines].sort((a, b) => a.ts - b.ts)) {
    if (seeded.has(l.id)) continue;
    const t = threads.get(l.id) ?? { id: l.id, title: null, product: l.product ?? null, lastAsk: 0, lastTold: 0, closed: false, runAt: 0 };
    const p = l.patch ?? {};
    if (p.title && !t.title) t.title = p.title;
    if (l.source === 'founder' && (p.answer || (p.title && !t.lastAsk))) t.lastAsk = l.ts;
    if (l.source !== 'founder' && (p.result || p.note)) t.lastTold = Math.max(t.lastTold, l.ts);
    if ('status' in p) t.closed = p.status === 'done';
    if ('runAt' in p) t.runAt = Number(p.runAt) || 0;
    threads.set(l.id, t);
  }
  return [...threads.values()]
    .filter((t) => t.lastAsk && !t.closed && t.runAt <= now && t.lastTold < t.lastAsk && now - t.lastAsk >= afterMs)
    .map((t) => ({ id: t.id, title: t.title, product: t.product, waitingMs: now - t.lastAsk }));
}

/**
 * Threads started `max` times or more inside `windowMs` by runs that never
 * answered: the loop the app must never run. A run that answered is a reply
 * landing, which a busy tester does six times in ten minutes.
 */
export function startLoops(starts, now, { windowMs = 10 * 60_000, max = 6 } = {}) {
  const counts = new Map();
  for (const s of starts) if (!s.answered && now - s.at <= windowMs) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
  return [...counts].filter(([, n]) => n >= max).map(([id, n]) => ({ id, starts: n }));
}

const ERROR = /\b(Error|TypeError|ReferenceError|RangeError|SyntaxError|Unhandled|EMFILE|ENOSPC|ENOMEM|EPIPE)\b|\b(error|failed|could not|cannot)\b/i;

/** Error lines in a stretch of the app's log, each with a signature that groups repeats of one fault. */
export function errorLines(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !/^at\s/.test(l) && ERROR.test(l)).map((line) => ({
    line: line.slice(0, 400),
    signature: line.replace(/w-[0-9a-f]{6,}/g, 'w-…').replace(/(\/[\w.@~-]+)+/g, '…').replace(/\d+/g, '#').replace(/"[^"]*"|'[^']*'/g, '"…"').slice(0, 160),
  }));
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Whether a series of memory readings (kB) climbed: the median of the last three against the first three. */
export function growth(values, { ratio = 1.5, minKb = 150_000 } = {}) {
  if (values.length < 6) return { grew: false, first: values[0] ?? 0, last: values.at(-1) ?? 0, peak: Math.max(0, ...values) };
  const first = median(values.slice(0, 3));
  const last = median(values.slice(-3));
  return { grew: last > first * ratio && last - first > minKb, first, last, peak: Math.max(...values) };
}

/** Free memory in MB, as the OS means it (macOS counts cached pages as used, so os.freemem() undercounts there). */
export function freeMemoryMb() {
  try {
    if (process.platform === 'linux') return Math.round(Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))[1]) / 1024);
    if (process.platform === 'darwin') {
      const pct = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', { encoding: 'utf8', timeout: 10_000 }))?.[1]);
      if (pct) return Math.round((os.totalmem() / 1048576) * pct / 100);
    }
  } catch { /* fall through */ }
  return Math.round(os.freemem() / 1048576);
}

function processTable() {
  try {
    return execFileSync('ps', ['-Ao', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', maxBuffer: 32 << 20, timeout: 10_000 }).split('\n')
      .map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), command: m[4] }));
  } catch { return []; }
}

/** The copy, everything it started, and the tester's browser, by kind, with memory in kB. */
export function instanceProcesses(state, table = processTable()) {
  const kids = new Map();
  for (const p of table) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p]);
  const tree = [];
  const walk = (pid) => { for (const k of kids.get(pid) ?? []) { tree.push(k); walk(k.pid); } };
  const app = table.find((p) => p.pid === state.pid);
  if (app) walk(app.pid);
  const browser = table.filter((p) => p.command.includes(path.join(state.instance, 'chrome-profile')));
  // The app starts every Claude Code worker, and the stand-in, with these; however Claude Code was installed.
  // A cloud run's stand-in carries the same arguments to the relay, so it is told apart first.
  const isWorker = (c) => /\s-p\s/.test(c) && /--permission-prompt-tool/.test(c) && !isCloudRun(c);
  return {
    appKb: app?.rss ?? 0,
    childKb: tree.reduce((n, p) => n + p.rss, 0),
    browserKb: browser.reduce((n, p) => n + p.rss, 0),
    workers: tree.filter((p) => isWorker(p.command)).length,
    cloudRuns: tree.filter((p) => isCloudRun(p.command)).length,
    processes: tree.length,
  };
}

const isCloudRun = (c) => /scripts\/cloud-shim\.pl\s|main\/cloud\/run-cli\.mjs\s/.test(c);

/**
 * What a sleeping Mac stops: the copy, everything it started, everything that
 * names its folder, and, for a copy on the cloud, the relay and stand-ins on
 * its own temp folder. Never the tester's browser or anything of another app.
 */
export function sleepTargets(state, table = processTable()) {
  const kids = new Map();
  for (const p of table) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p]);
  const browser = new Set(table.filter((p) => p.command.includes(path.join(state.instance, 'chrome-profile'))).map((p) => p.pid));
  const pids = new Set();
  const take = (pid) => {
    if (browser.has(pid) || pid === process.pid || pids.has(pid)) return;
    pids.add(pid);
    for (const k of kids.get(pid) ?? []) take(k.pid);
  };
  if (table.some((p) => p.pid === state.pid)) take(state.pid);
  const names = (c, dir) => !!dir && new RegExp(`${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|\\s|$)`).test(c);
  for (const p of table) if (names(p.command, state.instance) || names(p.command, state.cloudTmp)) take(p.pid);
  return [...pids];
}

/** Whether a run's session log carries a result its engine did not mark ERROR (main/codex.mjs, harnesses/claude-stream.mjs). */
export function answeredRun(log) {
  return /== RESULT \((?![^)]*\bERROR\b)[^)]*\) ==/.test(log);
}

/** The end of a file, where a run's result is written. */
function tailOf(file, bytes = 8192) {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(size, bytes));
    fs.readSync(fd, buf, 0, buf.length, Math.max(0, size - buf.length));
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch { return ''; }
}

/** Each thread's starts, from the session logs the app writes per run (`sessions/<id>/<ms>.log`). */
function readStarts(state) {
  const out = [];
  const root = path.join(state.storeRoot, 'projects');
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch { return out; }
  for (const d of dirs) {
    let ids = [];
    try { ids = fs.readdirSync(path.join(root, d, 'sessions')); } catch { continue; }
    for (const id of ids) {
      let logs = [];
      try { logs = fs.readdirSync(path.join(root, d, 'sessions', id)); } catch { continue; }
      for (const f of logs) {
        const at = Number(f.split('.')[0]);
        if (at) out.push({ id, at, answered: answeredRun(tailOf(path.join(root, d, 'sessions', id, f))) });
      }
    }
  }
  return out;
}

/** Every ledger line of every project in the copy, each tagged with its project's slug. */
export function readAllLines(state) {
  const prefix = `${state.accountRoot}/`.replace(/[^A-Za-z0-9]/g, '-');
  const root = path.join(state.storeRoot, 'projects');
  let dirs = [];
  try { dirs = fs.readdirSync(root).filter((d) => d.startsWith(prefix)); } catch { return []; }
  return dirs.flatMap((d) => {
    let text = '';
    try { text = fs.readFileSync(path.join(root, d, 'work-items.jsonl'), 'utf8'); } catch { return []; }
    return text.split('\n').filter(Boolean).map((l) => { try { return { ...JSON.parse(l), product: d.slice(prefix.length) }; } catch { return null; } }).filter(Boolean);
  });
}

/** What to keep of a copy before it is taken down, so an issue can be checked after: ledgers, each run's session log, the app's log, receipts. */
export function keepEvidence(state, out) {
  const dest = path.join(out, 'copy');
  const prefix = `${state.accountRoot}/`.replace(/[^A-Za-z0-9]/g, '-');
  const copy = (from, to) => { try { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); } catch { /* not there */ } };
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(state.storeRoot, 'projects')).filter((d) => d.startsWith(prefix)); } catch { /* no store */ }
  for (const d of dirs) {
    const slug = d.slice(prefix.length);
    copy(path.join(state.storeRoot, 'projects', d, 'work-items.jsonl'), path.join(dest, 'ledger', `${slug}.jsonl`));
    try { fs.cpSync(path.join(state.storeRoot, 'projects', d, 'sessions'), path.join(dest, 'sessions', slug), { recursive: true }); } catch { /* none */ }
  }
  copy(state.log, path.join(dest, 'app.log'));
  try { fs.cpSync(state.receipts, path.join(dest, 'receipts'), { recursive: true }); } catch { /* none */ }
}

/** The copy's agent cap now: a tester may change it in Settings mid-run. */
export function agentCap(dataDir) {
  try { return Number(JSON.parse(fs.readFileSync(path.join(dataDir, 'zero.config.json'), 'utf8')).maxConcurrentSessions) || 2; } catch { return 2; }
}

/**
 * One watcher per copy. `tick()` samples and checks; `finish()` writes
 * machine.json and returns the findings. `quiet(now)` is true while the power
 * test itself has the app asleep or restarting, when a dead screen is expected.
 */
export function createWatcher({ state, out, seeded = new Set(), afterMs, quiet = () => false, readState = () => state }) {
  const findings = new Map();
  const memory = [];
  let logAt = 0;
  let maxAtOnce = 0;
  let overLimit = 0;
  const found = (key, finding, now) => {
    const had = findings.get(key);
    if (had) { had.count++; had.lastAt = now; Object.assign(had, { detail: finding.detail ?? had.detail }); return; }
    const f = { key, firstAt: now, lastAt: now, count: 1, ...finding };
    findings.set(key, f);
    fs.appendFileSync(path.join(out, 'machine.jsonl'), `${JSON.stringify(f)}\n`);
  };

  async function tick(now = Date.now()) {
    const st = readState() ?? state;
    const lines = readAllLines(st);
    const going = waitingTooLong(lines, now, { afterMs: 0, seeded });
    maxAtOnce = Math.max(maxAtOnce, going.length);
    for (const t of going.filter((g) => g.waitingMs >= afterMs)) {
      found(`no-answer:${t.id}`, { kind: 'no-answer', severity: 'broken', title: `A thread had no answer and no word from the app for ${Math.round(afterMs / 60_000)} minutes`,
        detail: `"${t.title}" (${t.id}, ${t.product}), waiting ${Math.round(t.waitingMs / 60_000)} min when last checked`, ids: [t.id] }, now);
    }
    for (const loop of startLoops(readStarts(st), now)) {
      found(`start-loop:${loop.id}`, { kind: 'start-loop', severity: 'broken', title: 'A thread was started six or more times in ten minutes', detail: `${loop.id}: ${loop.starts} starts`, ids: [loop.id] }, now);
    }
    try {
      const size = fs.statSync(st.log).size;
      if (size > logAt) {
        const fd = fs.openSync(st.log, 'r');
        const buf = Buffer.alloc(Math.min(size - logAt, 4 << 20));
        fs.readSync(fd, buf, 0, buf.length, logAt);
        fs.closeSync(fd);
        logAt = size;
        for (const e of errorLines(buf.toString('utf8'))) found(`log:${e.signature}`, { kind: 'log-error', severity: 'wrong', title: 'The app logged an error', detail: e.line }, now);
      }
    } catch { /* no log yet */ }
    const procs = instanceProcesses(st);
    const allowed = agentCap(st.data);
    memory.push(procs.appKb + procs.childKb);
    overLimit = procs.workers > allowed + 1 ? overLimit + 1 : 0;
    if (overLimit >= 2) found('too-many-agents', { kind: 'too-many-agents', severity: 'wrong', title: `More agents running than the app allows (${allowed})`, detail: `${procs.workers} worker processes at once` }, now);
    let screenMs = null;
    let screenError = null;
    const began = Date.now();
    try {
      const res = await fetch(st.url, { signal: AbortSignal.timeout(10_000) });
      await res.text();
      screenMs = Date.now() - began;
      if (!res.ok) screenError = `answered ${res.status}`;
    } catch (err) { screenError = err.name === 'TimeoutError' ? 'no answer in 10 seconds' : err.message; }
    if (!quiet(now)) {
      if (screenError) found('no-screen', { kind: 'no-screen', severity: 'broken', title: 'The app\'s address stopped answering', detail: screenError }, now);
      else if (screenMs > 5000) found('slow-screen', { kind: 'slow-screen', severity: 'slow', title: 'The app took over 5 seconds to send its screen', detail: `${screenMs} ms` }, now);
    }
    const sample = { at: now, going: going.length, workers: procs.workers, cloudRuns: procs.cloudRuns, processes: procs.processes, appKb: procs.appKb, childKb: procs.childKb, browserKb: procs.browserKb, screenMs, screenError, freeMb: freeMemoryMb(), quiet: quiet(now) };
    fs.appendFileSync(path.join(out, 'watch.jsonl'), `${JSON.stringify(sample)}\n`);
    return sample;
  }

  function finish(now = Date.now()) {
    const g = growth(memory);
    if (g.grew) {
      found('memory-growth', { kind: 'memory-growth', severity: 'slow', title: 'The app\'s memory kept climbing over the session',
        detail: `${Math.round(g.first / 1024)} MB at the start, ${Math.round(g.last / 1024)} MB at the end, peak ${Math.round(g.peak / 1024)} MB (the app and the agents it started)` }, now);
    }
    const list = [...findings.values()];
    fs.writeFileSync(path.join(out, 'machine.json'), `${JSON.stringify(list, null, 1)}\n`);
    return list;
  }

  return { tick, finish, get maxAtOnce() { return maxAtOnce; } };
}
