// AGENT HOURS: the total, the week, the streak (w-3d0fa23ffb).
//
// Pure. A run is `{key, at, start, item, product, engine, seconds, failed,
// began}`: `at` is when it ended, and a run is counted on the local day it
// ended. Every run whose agent actually began counts its wall time, failed or
// not, and overlapping runs each count.

export interface AgentRun {
  key?: string;
  at?: number;
  start?: number;
  item?: string | null;
  product?: string | null;
  engine?: string | null;
  seconds?: number;
  failed?: boolean | null;
  began?: boolean;
  backfilled?: boolean;
}

export interface AgentHoursSummary {
  total: number;
  week: number;
  weekStart: string;
  today: number;
  day: string;
  streak: number;
  activeDays: string[];
  byMonth: { month: string; hours: number }[];
}

const MAX_RUN_SECONDS = 24 * 3600;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localMonth = (ms: number) => localDate(ms).slice(0, 7);

function mondayOf(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const counts = (r: AgentRun | null | undefined): r is AgentRun & { at: number; seconds: number } => !!r && r.began !== false && Number.isFinite(r.at) && Number(r.seconds) > 0;

// One line per key. The line written when the run ended beats one read back
// from its log, which may have been read while the run was still going.
export function dedupeRuns<T extends AgentRun>(runs: readonly (T | null | undefined)[] | null | undefined): T[] {
  const seen = new Map<string, T>();
  for (const r of runs ?? []) {
    if (!r || typeof r !== 'object' || typeof r.key !== 'string' || !r.key) continue;
    if (!Number.isFinite(r.at) || !(Number(r.seconds) > 0)) continue;
    const had = seen.get(r.key);
    if (!had || (had.backfilled && !r.backfilled)) seen.set(r.key, r);
  }
  return [...seen.values()];
}

// Days in a row with a run, counted back from today, or from yesterday when
// today has none yet. `dates` are local YYYY-MM-DD strings, from any number of
// Macs.
export function streakOf(dates: Iterable<string>, now = Date.now()): number {
  const have = new Set(dates);
  let cursor = startOfDay(now);
  if (!have.has(localDate(cursor))) cursor -= DAY_MS / 2;
  let n = 0;
  while (have.has(localDate(cursor))) {
    n += 1;
    // Half a day back and then to the start of that day survives a DST change.
    cursor = startOfDay(startOfDay(cursor) - DAY_MS / 2);
  }
  return n;
}

export function summarizeRuns(runs: readonly (AgentRun | null | undefined)[] | null | undefined, { now = Date.now() }: { now?: number } = {}): AgentHoursSummary {
  const weekStartMs = mondayOf(now);
  const dayStartMs = startOfDay(now);
  let total = 0;
  let week = 0;
  let today = 0;
  const active = new Set<string>();
  const months = new Map<string, number>();
  const first = new Date(now);
  first.setDate(1);
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(first.getFullYear(), first.getMonth() - i, 1);
    months.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`, 0);
  }
  for (const r of dedupeRuns(runs)) {
    if (!counts(r) || r.at > now) continue;
    const h = Math.min(Number(r.seconds), MAX_RUN_SECONDS) / 3600;
    total += h;
    if (r.at >= weekStartMs) week += h;
    if (r.at >= dayStartMs) today += h;
    active.add(localDate(r.at));
    const m = localMonth(r.at);
    if (months.has(m)) months.set(m, months.get(m)! + h);
  }
  const activeDays = [...active].sort().slice(-60);
  return {
    total,
    week,
    weekStart: localDate(weekStartMs),
    today,
    day: localDate(dayStartMs),
    streak: streakOf(activeDays, now),
    activeDays,
    byMonth: [...months].map(([month, hours]) => ({ month, hours })),
  };
}

// One run read back from its trace log, `sessions/<item>/<startedAtMs>.log`:
// the start is the file's name, the end the `# exited (code) <ISO>` footer,
// else the file's last write.
export function runFromTrace({ name, text = '', mtimeMs, item, product }: {
  name?: unknown;
  text?: unknown;
  mtimeMs?: unknown;
  item?: string | null;
  product?: string | null;
}): (AgentRun & { key: string; at: number; start: number; engine: null; seconds: number; failed: boolean | null }) | null {
  const m = /^(\d{12,14})\.log$/.exec(String(name ?? ''));
  if (!m) return null;
  const start = Number(m[1]);
  const footer = /# exited \((-?\d+|null)\) (\S+)(?: · [^\n]*)?\s*$/m.exec(String(text));
  const end = footer ? Date.parse(footer[2]) : Number(mtimeMs);
  if (!Number.isFinite(end) || end <= start) return null;
  const seconds = Math.round((end - start) / 1000);
  if (seconds > MAX_RUN_SECONDS) return null;
  return { key: `${item}:${start}`, at: end, start, item, product, engine: null, seconds, failed: footer ? footer[1] !== '0' : null };
}
