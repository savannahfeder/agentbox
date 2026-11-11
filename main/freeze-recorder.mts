// WHAT THE MAIN THREAD WAS DOING WHEN THE APP FROZE.
//
// The spinning wheel is this thread not answering, and it comes when nobody is
// profiling. So a thread of its own watches all the time: the main thread
// stamps a clock every 100 ms, the
// watcher keeps a low-rate CPU profile of it running through the inspector,
// and when the stamps stop for longer than `thresholdMs` it cuts that stretch
// out of the profile and writes one line saying which of our functions held
// it, to `freeze-<day>.jsonl` beside the memory log, kept a week.
//
// It stays on this computer. Nothing here is sent anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { stripTypesFlags } from './strip-types.mts';

export const THRESHOLD_MS = 500;
export const KEEP_DAYS = 7;
const BEAT_MS = 100;
const FILE = /^freeze-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const IDLE = new Set(['(idle)', '(program)']);
const GC = '(garbage collector)';
const FRAMES_KEPT = 12;

export interface ProfileNode {
  id: number;
  children?: number[];
  callFrame?: { functionName?: string; url?: string; lineNumber: number };
}

export interface CpuProfile {
  nodes?: ProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
  startTime: number;
}

export interface ProfileSlice {
  profile?: CpuProfile;
  offsetUs?: number;
}

export interface FreezeStackFrame {
  fn: string;
  file: string;
  line: number;
}

interface FreezeStack {
  kind: string;
  frames: FreezeStackFrame[];
  where: string;
  key: string;
}

export interface FreezeRead {
  samples: number;
  busy: number;
  gc: number;
  where: string | null;
  stacks: { share: number; frames: string[] }[];
}

export interface FreezeLine extends FreezeRead {
  at: string;
  ms: number;
}

export interface FreezeSummary {
  at: string;
  ms: number;
  where: string | null;
}

export interface FreezeRecorderOptions {
  dir?: string;
  appDir?: string;
  thresholdMs?: number;
  rotateMs?: number;
  intervalUs?: number;
  onFreeze?: (freeze: FreezeSummary) => void;
}

export const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fileOf(url: string | undefined, appDirs: string[]) {
  if (!url) return '';
  let file = url;
  if (url.startsWith('file://')) { try { file = fileURLToPath(url); } catch { /* keep the url */ } }
  const appDir = appDirs.find((d) => file.startsWith(d + path.sep));
  if (appDir) return file.slice(appDir.length + 1);
  if (file.startsWith('node:') || !path.isAbsolute(file)) return file;
  // Never a home path in the log: a file outside the app is named by its last parts.
  return `…/${file.split(path.sep).slice(-2).join('/')}`;
}

// The profile names a file by its real path, which on macOS is /private/var for /var.
const realPath = (dir: string) => { try { return dir ? fs.realpathSync(dir) : ''; } catch { return ''; } };

const ours = (frame: FreezeStackFrame) => /\.[cm]?[jt]s$/.test(frame.file) && !/^(node:|…\/)/.test(frame.file) && !frame.file.includes('node_modules');
const named = (f: FreezeStackFrame) => (f.file ? `${f.fn} ${f.file}:${f.line}` : f.fn);

/**
 * What held the thread between `fromUs` and `toUs`, read off one or more CPU
 * profiles. Times are on the watcher's clock; `offsetUs` is each profile's
 * clock minus that one. `appDir` is one path or several. Pure.
 */
export function freezeFrom(profiles: ProfileSlice[], { fromUs, toUs, appDir = '' }: { fromUs: number; toUs: number; appDir?: string | string[] }): FreezeRead {
  const appDirs = [appDir].flat().filter(Boolean);
  const groups = new Map<string, { samples: number; s: FreezeStack }>();
  let total = 0;
  let idle = 0;
  let gc = 0;
  for (const { profile, offsetUs = 0 } of profiles) {
    if (!profile?.nodes?.length || !profile.samples?.length) continue;
    const byId = new Map(profile.nodes.map((n): [number, ProfileNode] => [n.id, n]));
    const parent = new Map<number, number>();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const stacks = new Map<number, FreezeStack>();
    const stackOf = (id: number): FreezeStack => {
      if (stacks.has(id)) return stacks.get(id)!;
      const frames: FreezeStackFrame[] = [];
      for (let at: number | undefined = id; at != null; at = parent.get(at)) {
        const cf = byId.get(at)?.callFrame;
        if (!cf || cf.functionName === '(root)') continue;
        frames.push({ fn: cf.functionName || '(anonymous)', file: fileOf(cf.url, appDirs), line: cf.url ? cf.lineNumber + 1 : 0 });
      }
      const leaf = frames[0]?.fn ?? '(program)';
      const kind = frames.length <= 1 && IDLE.has(leaf) ? 'idle' : leaf === GC ? 'gc' : 'busy';
      const first = frames.findIndex(ours);
      const mine = first < 0 ? [] : frames.slice(first);
      const s: FreezeStack = { kind, frames, where: mine[0] ? named(mine[0]) : leaf, key: `${leaf}|${mine.slice(0, 10).map(named).join('<')}` };
      stacks.set(id, s);
      return s;
    };
    let t = profile.startTime - offsetUs;
    for (let i = 0; i < profile.samples.length; i += 1) {
      t += profile.timeDeltas?.[i] ?? 0;
      if (t < fromUs || t > toUs) continue;
      total += 1;
      const s = stackOf(profile.samples[i]);
      if (s.kind === 'idle') { idle += 1; continue; }
      if (s.kind === 'gc') gc += 1;
      const g = groups.get(s.key) ?? { samples: 0, s };
      g.samples += 1;
      groups.set(s.key, g);
    }
  }
  const busy = total - idle;
  const top = [...groups.values()].sort((a, b) => b.samples - a.samples).slice(0, 3);
  return {
    samples: total,
    busy: total ? Math.round((busy / total) * 100) / 100 : 0,
    gc: busy ? Math.round((gc / busy) * 100) / 100 : 0,
    where: top[0]?.s.where ?? null,
    stacks: top.map((g) => ({ share: Math.round((g.samples / busy) * 100) / 100, frames: g.s.frames.slice(0, FRAMES_KEPT).map(named) })),
  };
}

/** One freeze's line, appended to today's file; older files than a week go. */
export function writeFreeze(dir: string, line: FreezeLine, { keepDays = KEEP_DAYS }: { keepDays?: number } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const at = Date.parse(line.at) || Date.now();
  fs.appendFileSync(path.join(dir, `freeze-${dayOf(at)}.jsonl`), `${JSON.stringify(line)}\n`);
  const oldest = dayOf(new Date(at).setDate(new Date(at).getDate() - (keepDays - 1)));
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(FILE);
    if (m && m[1] < oldest) fs.rmSync(path.join(dir, f), { force: true });
  }
}

/**
 * Starts the watcher for this thread. `onFreeze` hears each line as it is
 * written. Never throws: a recorder that breaks the app is worse than a gap.
 */
export function startFreezeRecorder({ dir, appDir = '', thresholdMs = THRESHOLD_MS, rotateMs = 60_000, intervalUs = 10_000, onFreeze = () => {} }: FreezeRecorderOptions = {}) {
  const beat = new SharedArrayBuffer(8);
  const stamp = new BigInt64Array(beat);
  const tick = () => Atomics.store(stamp, 0, process.hrtime.bigint());
  tick();
  const timer = setInterval(tick, BEAT_MS);
  timer.unref?.();
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./freeze-recorder-thread.mts', import.meta.url), {
      execArgv: [...process.execArgv, ...stripTypesFlags()],
      workerData: { beat, dir, appDir: [appDir, realPath(appDir)], thresholdMs, rotateMs, intervalUs },
    });
  } catch (err) {
    clearInterval(timer);
    console.warn(`zero: freezes will not be recorded: ${(err as Error).message}`);
    return { stop() {} };
  }
  worker.unref();
  worker.on('message', (m: { freeze?: FreezeSummary; gaveUp?: string } | null) => {
    if (m?.freeze) { try { onFreeze(m.freeze); } catch { /* the line is already on disk */ } }
    if (m?.gaveUp) console.warn(`zero: freezes will not be recorded: ${m.gaveUp}`);
  });
  worker.on('error', (err) => { clearInterval(timer); console.warn(`zero: the freeze recorder stopped: ${err.message}`); });
  return {
    stop() { clearInterval(timer); worker?.terminate().catch(() => {}); },
  };
}
