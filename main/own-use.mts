// WHAT THE APP ITSELF USES: memory, CPU and idle wake-ups of each of its
// Electron processes, from Electron's own counters, so reading it starts no
// program and can go on every minute's memory log line (main/memory-log.mts).

export interface MetricLike {
  pid: number;
  type: string;
  creationTime?: number;
  cpu: { cumulativeCPUUsage?: number; idleWakeupsPerSecond?: number };
  memory: { workingSetSize: number };
}

export interface Use { mb: number; cpu: number | null; wakeups: number }
export interface OwnUse extends Use { main: Use; windows: Use; gpu: Use; helpers: Use }

type Kind = 'main' | 'windows' | 'gpu' | 'helpers';
const KIND: Record<string, Kind> = { Browser: 'main', Tab: 'windows', GPU: 'gpu' };

/**
 * A reader to call once a minute. CPU is a share of one core since the last
 * call, null on the first; wake-ups are Electron's, which only a Mac counts.
 */
export function ownUseReader(metrics: () => MetricLike[], now: () => number = Date.now) {
  let last: { at: number; cpu: Map<number, number> } | null = null;
  return (): OwnUse => {
    const at = now();
    const list = metrics();
    const sums = { main: { kb: 0, sec: 0, wakeups: 0 }, windows: { kb: 0, sec: 0, wakeups: 0 }, gpu: { kb: 0, sec: 0, wakeups: 0 }, helpers: { kb: 0, sec: 0, wakeups: 0 } };
    const cpu = new Map<number, number>();
    for (const m of list) {
      const s = sums[KIND[m.type] ?? 'helpers'];
      s.kb += Number(m.memory?.workingSetSize) || 0;
      s.wakeups += Number(m.cpu?.idleWakeupsPerSecond) || 0;
      const total = m.cpu?.cumulativeCPUUsage;
      if (typeof total !== 'number') continue;
      cpu.set(m.pid, total);
      // A process started since the last reading spent all of its time inside it.
      const was = last?.cpu.get(m.pid) ?? (last && Number(m.creationTime) >= last.at ? 0 : null);
      if (was !== null) s.sec += Math.max(0, total - was);
    }
    const secs = last ? (at - last.at) / 1000 : 0;
    const share = (sec: number) => (secs > 0 ? Math.round((sec / secs) * 1000) / 10 : null);
    const use = (s: { kb: number; sec: number; wakeups: number }): Use => ({ mb: Math.round(s.kb / 1024), cpu: share(s.sec), wakeups: Math.round(s.wakeups) });
    const all = Object.values(sums).reduce((a, s) => ({ kb: a.kb + s.kb, sec: a.sec + s.sec, wakeups: a.wakeups + s.wakeups }), { kb: 0, sec: 0, wakeups: 0 });
    last = { at, cpu };
    return { ...use(all), main: use(sums.main), windows: use(sums.windows), gpu: use(sums.gpu), helpers: use(sums.helpers) };
  };
}
