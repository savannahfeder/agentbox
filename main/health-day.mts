// HOW HEAVY THE APP WAS ON A DAY, and when and how, as the `app_health` count
// carries it (shared/analytics-events.mts), read from the app's own memory log
// (main/memory-log.mts) and freeze log (main/freeze-recorder.mts). Numbers,
// a part of the app from a closed list, and a freeze's place only when it is
// in the app's own code: no task, project or person in either log leaves here.
import fs from 'node:fs';
import path from 'node:path';
import { dayOf } from './freeze-recorder.mts';
import { appCode } from '../shared/analytics-events.mts';

const MEMORY = /^memory-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const SENT = 'health-sent.json';

interface Part { mb?: number; cpu?: number | null }
interface Use extends Part { wakeups?: number; main?: Part; windows?: Part; gpu?: Part; helpers?: Part }
interface Minute { at?: string; pressure?: string | null; running?: number; own?: Use | null; app?: { mb?: number }; upMin?: number }
const PARTS = ['main', 'windows', 'gpu', 'helpers'] as const;

function readLines<T>(file: string): T[] {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out: T[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try { out.push(JSON.parse(raw)); } catch { /* a line cut short by a quit */ }
  }
  return out;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const tenth = (x: number) => Math.round(x * 10) / 10;

const timeOf = (l: { at?: string }) => Date.parse(l.at ?? '');
const biggest = (use: Use, key: keyof Part) => PARTS.reduce((a, p) => ((Number(use[p]?.[key]) || 0) > (Number(use[a]?.[key]) || 0) ? p : a), PARTS[0]);

/**
 * When the launch running at `t` began. The memory recorder's lines say how
 * long the app had been up, and a launch's first own reading has no CPU yet;
 * the latest of those at or before `t` speaks for it.
 */
function launchClock(lines: Minute[]) {
  const marks = lines.flatMap((l) => {
    const at = timeOf(l);
    if (!Number.isFinite(at)) return [];
    if (num(l.upMin)) return [{ at, start: at - l.upMin * 60_000 }];
    return l.own && l.own.cpu === null ? [{ at, start: at }] : [];
  }).sort((a, b) => a.at - b.at);
  const startOf = (t: number) => {
    let start: number | null = null;
    for (const m of marks) if (m.at <= t) start = m.start; else break;
    return start;
  };
  const hoursAt = (t: number) => { const s = startOf(t); return s === null ? null : tenth((t - s) / 3_600_000); };
  return { startOf, hoursAt };
}

/** Main's growth in MB an hour over the longest stretch one launch logged, an hour at least. */
function mainGrowth(owned: Minute[], startOf: (t: number) => number | null) {
  const runs = new Map<number | null, Minute[]>();
  for (const l of owned) {
    const key = startOf(timeOf(l));
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key)!.push(l);
  }
  let best: { span: number; perHour: number } | null = null;
  for (const run of runs.values()) {
    const ends = run.filter((l) => num(l.own?.main?.mb) && Number.isFinite(timeOf(l)));
    if (ends.length < 2) continue;
    const first = ends[0];
    const last = ends[ends.length - 1];
    const span = (timeOf(last) - timeOf(first)) / 3_600_000;
    if (span < 1 || (best && span <= best.span)) continue;
    best = { span, perHour: (last.own!.main!.mb! - first.own!.main!.mb!) / span };
  }
  return best ? Math.round(best.perHour) : null;
}

/** The day's numbers, or null when the app logged no minute that day. */
export function summarizeHealthDay(dir: string, day: string): Record<string, number | string> | null {
  const all = readLines<Minute>(path.join(dir, `memory-${day}.jsonl`)).filter((l) => l && typeof l === 'object');
  const minutes = all.filter((l) => 'pressure' in l);
  if (!minutes.length) return null;
  const { startOf, hoursAt } = launchClock(all);
  const owned = minutes.filter((l) => l.own && num(l.own.mb));
  // A first reading has no interval behind it, so it says nothing of CPU or wake-ups.
  const timed = owned.filter((l) => num(l.own!.cpu));
  const idle = timed.filter((l) => !l.running);
  const busy = timed.filter((l) => num(l.running) && l.running > 0);
  const freezes = readLines<{ ms?: number; at?: string; where?: unknown }>(path.join(dir, `freeze-${day}.jsonl`)).filter((f) => num(f?.ms));
  const out: Record<string, number | string> = {};
  const appMb = owned.length ? Math.max(...owned.map((l) => l.own!.mb!)) : Math.max(0, ...minutes.map((l) => (num(l.app?.mb) ? l.app!.mb! : 0)));
  if (appMb) out.appMb = Math.round(appMb);
  const mains = owned.map((l) => l.own!.main?.mb).filter(num);
  if (mains.length) out.mainMb = Math.round(Math.max(...mains));
  const idleCpu = mean(idle.map((l) => l.own!.cpu as number));
  if (idleCpu !== null) out.idleCpu = tenth(idleCpu);
  const busyCpu = mean(busy.map((l) => l.own!.cpu as number));
  if (busyCpu !== null) out.busyCpu = tenth(busyCpu);
  const wakeups = mean(idle.map((l) => l.own!.wakeups).filter(num));
  if (wakeups !== null) out.wakeups = Math.round(wakeups);
  out.freezes = freezes.length;
  if (freezes.length) out.freezeSeconds = tenth(Math.max(...freezes.map((f) => f.ms!)) / 1000);
  out.tightMinutes = minutes.filter((l) => l.pressure === 'tight' || l.pressure === 'critical').length;
  out.hours = tenth(minutes.length / 60);

  // When and how: time since the app opened, never the hour of the day.
  const peak = owned.reduce<Minute | null>((a, l) => (!a || l.own!.mb! > a.own!.mb! ? l : a), null);
  if (peak) {
    const at = hoursAt(timeOf(peak));
    if (at !== null) out.peakHours = at;
    out.peakAgents = Number(peak.running) || 0;
    out.peakPart = biggest(peak.own!, 'mb');
  }
  const growth = mainGrowth(owned, startOf);
  if (growth !== null) out.mainMbPerHour = growth;
  const busiest = timed.reduce<Minute | null>((a, l) => (!a || (l.own!.cpu as number) > (a.own!.cpu as number) ? l : a), null);
  if (busiest) {
    out.cpuPeak = tenth(busiest.own!.cpu as number);
    out.cpuPeakPart = biggest(busiest.own!, 'cpu');
  }
  const worst = freezes.reduce<{ ms?: number; at?: string; where?: unknown } | null>((a, f) => (!a || f.ms! > a.ms! ? f : a), null);
  if (worst) {
    if (appCode(worst.where)) out.freezeWhere = worst.where;
    const at = timeOf(worst);
    if (Number.isFinite(at)) {
      const hours = hoursAt(at);
      if (hours !== null) out.freezeHours = hours;
      const before = minutes.filter((l) => timeOf(l) <= at).pop();
      out.freezeAgents = Number(before?.running) || 0;
    }
  }
  return out;
}

/**
 * Sends the newest day before today that has a memory log and was not sent
 * yet. Marked sent only when `track` says it went, so with the switch off it
 * is tried again on a later day's first count.
 */
export function sendLastDaysHealth({ dir, now = Date.now(), track }: {
  dir: string;
  now?: number;
  track: (name: string, props: Record<string, number | string>) => unknown;
}): boolean {
  const today = dayOf(now);
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { return false; }
  const day = names.map((n) => MEMORY.exec(n)?.[1]).filter((d): d is string => !!d && d < today).sort().pop();
  if (!day) return false;
  let sent: string | null = null;
  try { sent = JSON.parse(fs.readFileSync(path.join(dir, SENT), 'utf8'))?.day ?? null; } catch { sent = null; }
  if (sent && sent >= day) return false;
  const props = summarizeHealthDay(dir, day);
  if (!props || !track('app_health', props)) return false;
  try { fs.writeFileSync(path.join(dir, SENT), JSON.stringify({ day })); } catch { /* sent again next time */ }
  return true;
}
