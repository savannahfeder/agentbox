// HOW HEAVY THE APP WAS ON A DAY, as the numbers the `app_health` count
// carries (shared/analytics-events.mts), read from the app's own memory log
// (main/memory-log.mts) and freeze log (main/freeze-recorder.mts). Only
// numbers: nothing in either log that names anything leaves this file.
import fs from 'node:fs';
import path from 'node:path';
import { dayOf } from './freeze-recorder.mts';

const MEMORY = /^memory-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const SENT = 'health-sent.json';

interface Use { mb?: number; cpu?: number | null; wakeups?: number; main?: { mb?: number } }
interface Minute { pressure?: string | null; running?: number; own?: Use | null; app?: { mb?: number } }

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

/** The day's numbers, or null when the app logged no minute that day. */
export function summarizeHealthDay(dir: string, day: string): Record<string, number> | null {
  const minutes = readLines<Minute>(path.join(dir, `memory-${day}.jsonl`)).filter((l) => l && 'pressure' in l);
  if (!minutes.length) return null;
  const owned = minutes.filter((l) => l.own && num(l.own.mb));
  // A first reading has no interval behind it, so it says nothing of CPU or wake-ups.
  const timed = owned.filter((l) => num(l.own!.cpu));
  const idle = timed.filter((l) => !l.running);
  const busy = timed.filter((l) => num(l.running) && l.running > 0);
  const freezes = readLines<{ ms?: number }>(path.join(dir, `freeze-${day}.jsonl`)).filter((f) => num(f?.ms));
  const out: Record<string, number> = {};
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
  track: (name: string, props: Record<string, number>) => unknown;
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
