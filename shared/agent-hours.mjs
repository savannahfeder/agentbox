// AGENT HOURS: the level, the week, the streak (w-3d0fa23ffb).
//
// Pure. A run is `{key, at, start, item, product, engine, seconds, failed,
// began}`: `at` is when it ended, and a run is counted on the local day it
// ended. Every run whose agent actually began counts its wall time, failed or
// not, and overlapping runs each count.

export const MASTERY_HOURS = 10_000;
const MAX_RUN_SECONDS = 24 * 3600;
const DAY_MS = 86_400_000;

// Up to 99, hours grow as level^2.5: level 2 in minutes, 99 at MASTERY_HOURS.
// Not RuneScape's curve, which spends half its hours on the last seven levels
// and so reads 82 after one heavy month. Past 99 there is no ceiling and each
// level costs 5% more than the last, starting from the curve's pace at 99 so
// no level ever costs less than the one before.
const RISE = 2.5;
const PAST = Math.log(1.05);
const PACE_AT_99 = (MASTERY_HOURS * RISE) / 98;
// A level starts at its exact hours, not one float step later.
const EPS = 1e-10;

export function hoursForLevel(level) {
  const L = Number(level);
  if (!(L > 1)) return 0;
  if (L <= 99) return MASTERY_HOURS * ((L - 1) / 98) ** RISE;
  return MASTERY_HOURS + (PACE_AT_99 * Math.expm1((L - 99) * PAST)) / PAST;
}

export function levelFor(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 1;
  if (h < MASTERY_HOURS) return 1 + Math.floor(98 * (h / MASTERY_HOURS) ** (1 / RISE) + EPS);
  return 99 + Math.floor(Math.log1p(((h - MASTERY_HOURS) * PAST) / PACE_AT_99) / PAST + EPS);
}

const pad = (n) => String(n).padStart(2, '0');
export const localDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localMonth = (ms) => localDate(ms).slice(0, 7);

function mondayOf(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const counts = (r) => r && r.began !== false && Number.isFinite(r.at) && Number(r.seconds) > 0;

// One line per key. The line written when the run ended beats one read back
// from its log, which may have been read while the run was still going.
export function dedupeRuns(runs) {
  const seen = new Map();
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
export function streakOf(dates, now = Date.now()) {
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

export function summarizeRuns(runs, { now = Date.now() } = {}) {
  const weekStartMs = mondayOf(now);
  const dayStartMs = startOfDay(now);
  let total = 0;
  let week = 0;
  let today = 0;
  const active = new Set();
  const months = new Map();
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
    if (months.has(m)) months.set(m, months.get(m) + h);
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
    level: levelFor(total),
  };
}

// One run read back from its trace log, `sessions/<item>/<startedAtMs>.log`:
// the start is the file's name, the end the `# exited (code) <ISO>` footer,
// else the file's last write.
export function runFromTrace({ name, text = '', mtimeMs, item, product }) {
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
