// A LINE A MINUTE: HOW SHORT MEMORY IS, AND WHICH TASK IS HOLDING IT (w-ec27ff1a51).
//
// 2026-10-11 the Mac ran out of memory with Agentbox at 22 GB. By the time
// anyone looked it had calmed down, and nothing had been written down, so which
// task had been holding the memory could only be guessed. This writes one JSON
// line a minute to `memory-<day>.jsonl` in the app's own folder, kept a week:
// the kernel's reading, the agents running and the limit, whether new agents
// were being held (main/start-hold.mts), the app's own processes, every task's
// programs with what they hold, and the biggest programs that are not ours.
//
// It stays on this computer. Nothing here is sent anywhere.
//
// A program belongs to the task of the nearest process at or above it that
// carries ZERO_ITEM (main/leftovers.mts reads the tag), which is what catches a
// dev server that renamed itself and hid its environment.

import fs from 'node:fs';
import path from 'node:path';
import { listProcesses } from './leftovers.mts';
import type { ProcessRecord } from './leftovers.mts';
import { readMacPressure } from './memory-gate-server.mts';
import { pressureFrom } from './memory-gate.mts';
import type { PressureReading } from './memory-gate.mts';

/** Days of files kept, today included. */
export const KEEP_DAYS = 7;
const FILE = /^memory-(\d{4}-\d{2}-\d{2})\.jsonl$/;

type Owner = { item: string; product: string | null } | 'app' | null;

export interface MemoryLogOptions {
  dir: string;
  appPid?: number;
  list?: () => Promise<ProcessRecord[]> | ProcessRecord[];
  readPressure?: () => Promise<PressureReading> | PressureReading;
  now?: () => number;
  facts?: () => Record<string, unknown> | null | undefined;
  keepDays?: number;
}

const name = (exe: unknown) => String(exe ?? '').split('/').filter(Boolean).pop() || String(exe ?? '');
const top = (list: ProcessRecord[], n: number) => [...list].sort((a, b) => b.mb - a.mb).slice(0, n).map((p) => ({ name: name(p.exe), mb: Math.round(p.mb) }));

/** One minute's line, from one listing. Pure. */
export function summarizeMemory(procs: ProcessRecord[], { appPid = process.pid, at = Date.now(), reading = {} }: { appPid?: number; at?: number; reading?: PressureReading } = {}) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const owner = new Map<number, Owner>();
  const ownerOf = (p: ProcessRecord): Owner => {
    if (owner.has(p.pid)) return owner.get(p.pid)!;
    let found: Owner = null;
    const seen = new Set<number>();
    for (let q: ProcessRecord | undefined = p; q && !seen.has(q.pid); q = byPid.get(q.ppid)) {
      seen.add(q.pid);
      if (q.item) { found = { item: q.item, product: q.product ?? null }; break; }
      if (q.pid === appPid) { found = 'app'; break; }
    }
    owner.set(p.pid, found);
    return found;
  };
  const tasks = new Map<string, { item: string; product: string | null; list: ProcessRecord[] }>();
  const app: ProcessRecord[] = [];
  const others: ProcessRecord[] = [];
  for (const p of procs) {
    const o = ownerOf(p);
    if (o === 'app') app.push(p);
    else if (o) {
      const t = tasks.get(o.item) ?? { item: o.item, product: o.product, list: [] };
      t.product ??= o.product;
      t.list.push(p);
      tasks.set(o.item, t);
    } else others.push(p);
  }
  const sum = (list: ProcessRecord[]) => Math.round(list.reduce((n, p) => n + (Number(p.mb) || 0), 0));
  const level = Number.isFinite(reading?.level) ? reading.level : null;
  const freePct = Number.isFinite(reading?.freePct) ? reading.freePct : null;
  const swapInMbps = Number.isFinite(reading?.swapInMbps) ? reading.swapInMbps : null;
  const swapMb = Number.isFinite(reading?.swapMb) ? reading.swapMb : null;
  return {
    at: new Date(at).toISOString(),
    pressure: level === null && freePct === null && swapInMbps === null ? null : pressureFrom({ level, freePct, swapInMbps }),
    level,
    freePct,
    swapInMbps,
    swapMb,
    totalMb: sum(procs),
    app: { mb: sum(app), procs: app.length },
    tasks: [...tasks.values()]
      .map((t) => ({ item: t.item, product: t.product, mb: sum(t.list), procs: t.list.length, top: top(t.list, 3) }))
      .sort((a, b) => b.mb - a.mb),
    others: top(others, 5),
  };
}

const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export class MemoryLog {
  declare dir: string;
  declare appPid: number;
  declare list: NonNullable<MemoryLogOptions['list']>;
  declare readPressure: NonNullable<MemoryLogOptions['readPressure']>;
  declare now: () => number;
  declare facts: NonNullable<MemoryLogOptions['facts']>;
  declare keepDays: number;
  declare _pruned: string | null;
  declare _busy?: boolean;

  constructor({
    dir, appPid = process.pid, list = listProcesses, readPressure = readMacPressure,
    now = Date.now, facts = () => ({}), keepDays = KEEP_DAYS,
  }: MemoryLogOptions) {
    Object.assign(this, { dir, appPid, list, readPressure, now, facts, keepDays });
    this._pruned = null;
  }

  /** Writes this minute's line. Never throws: a log that breaks the app is worse than a gap in the log. */
  async tick() {
    if (this._busy) return;
    this._busy = true;
    try {
      const [procs, reading] = await Promise.all([
        Promise.resolve().then(() => this.list()).catch(() => []),
        Promise.resolve().then(() => this.readPressure()).catch(() => ({})),
      ]);
      const at = this.now();
      let facts: Record<string, unknown> = {};
      try { facts = this.facts() ?? {}; } catch { /* the line goes without them */ }
      const line = { ...summarizeMemory(procs, { appPid: this.appPid, at, reading }), ...facts };
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(path.join(this.dir, `memory-${dayOf(at)}.jsonl`), `${JSON.stringify(line)}\n`);
      this._prune(at);
    } catch (err) {
      console.warn('zero: memory log:', (err as Error).message);
    } finally {
      this._busy = false;
    }
  }

  /** Once a day: removes this log's own files older than `keepDays`, and nothing else. */
  _prune(at: number) {
    const today = dayOf(at);
    if (this._pruned === today) return;
    this._pruned = today;
    const oldest = dayOf(new Date(at).setDate(new Date(at).getDate() - (this.keepDays - 1)));
    for (const f of fs.readdirSync(this.dir)) {
      const m = f.match(FILE);
      if (m && m[1] < oldest) fs.rmSync(path.join(this.dir, f), { force: true });
    }
  }
}
