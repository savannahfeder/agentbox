// THE RUN LEDGER: one line per finished run, for agent hours (w-3d0fa23ffb).
//
// `<appHome>/runs.jsonl`, written when a run ends (supervisor `_recordRun`).
// Cloud runs keep their own ledger (main/cloud/usage.mjs) and are read from
// there. Old runs are read once from their trace logs (`backfillRuns`). Every
// line has a key, and every reader dedupes on it, so a run written twice is
// counted once.
import fs from 'node:fs';
import path from 'node:path';
import { appHome, machineryDir } from './store/home.mjs';
import { dedupeRuns, runFromTrace } from '../shared/agent-hours.mjs';

const BACKFILL_DAYS = 400;
const TAIL_BYTES = 400;
// A log with no exit line that was written to this recently is a run still
// going; it writes its own line when it ends.
const STILL_GOING_MS = 30 * 60_000;

export function runLedgerPath(home = appHome()) {
  return path.join(home, 'runs.jsonl');
}

export function appendRun(run, { file = runLedgerPath() } = {}) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(run) + '\n');
    return true;
  } catch {
    // A run that cannot be written never fails the run.
    return false;
  }
}

export function readRuns({ file = runLedgerPath() } = {}) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* one broken line loses only itself */ }
  }
  return out;
}

export function runsFromCloudUsage(lines) {
  const out = [];
  for (const l of lines ?? []) {
    const at = Date.parse(l?.at);
    const seconds = Number(l?.wallSeconds);
    if (!Number.isFinite(at) || !(seconds > 0)) continue;
    out.push({
      key: `cloud:${l.runId ?? at}`,
      at,
      start: at - seconds * 1000,
      item: l.item ?? null,
      product: null,
      engine: l.engine ?? null,
      seconds,
      failed: Number.isInteger(l.exitCode) ? l.exitCode !== 0 : null,
      where: 'cloud',
    });
  }
  return out;
}

export function allRuns({ file = runLedgerPath(), cloudLines = [] } = {}) {
  return dedupeRuns([...readRuns({ file }), ...runsFromCloudUsage(cloudLines)]);
}

function tailOf(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

// Reads every run log of this store's projects into the ledger, once per run.
// Resolves to how many runs it added. It hands the event loop back every
// YIELD_EVERY logs: on the founder's Mac it reads 25,780 logs in 3.4 s, which
// in one piece would freeze the window.
const YIELD_EVERY = 200;
const breathe = () => new Promise((r) => setImmediate(r));

export async function backfillRuns({ home = appHome(), products = [], file = runLedgerPath(home), now = Date.now() } = {}) {
  const have = new Set(readRuns({ file }).map((r) => r?.key));
  const since = now - BACKFILL_DAYS * 86_400_000;
  let added = 0;
  let read = 0;
  let pending = [];
  const flush = () => {
    if (!pending.length) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, pending.map((r) => JSON.stringify(r)).join('\n') + '\n');
      added += pending.length;
    } catch { /* the next backfill tries again */ }
    pending = [];
  };
  for (const p of products) {
    if (!p?.dir) continue;
    const sessions = path.join(machineryDir(p.dir, home), 'sessions');
    let items;
    try { items = fs.readdirSync(sessions, { withFileTypes: true }); } catch { continue; }
    for (const it of items) {
      if (!it.isDirectory()) continue;
      let logs;
      try { logs = fs.readdirSync(path.join(sessions, it.name)); } catch { continue; }
      for (const name of logs) {
        const start = Number(/^(\d{12,14})\.log$/.exec(name)?.[1]);
        if (!Number.isFinite(start) || start < since || start > now) continue;
        if (++read % YIELD_EVERY === 0) { flush(); await breathe(); }
        const full = path.join(sessions, it.name, name);
        let mtimeMs;
        try { mtimeMs = fs.statSync(full).mtimeMs; } catch { continue; }
        const tail = tailOf(full);
        if (!/# exited \(/.test(tail) && now - mtimeMs < STILL_GOING_MS) continue;
        const run = runFromTrace({ name, text: tail, mtimeMs, item: it.name, product: p.slug ?? null });
        if (!run || have.has(run.key)) continue;
        pending.push({ ...run, backfilled: true });
        have.add(run.key);
      }
    }
  }
  flush();
  return added;
}
