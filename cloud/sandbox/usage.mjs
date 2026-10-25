// WHAT ONE RUN USED OF ITS MACHINE, measured the way AWS bills it: the whole
// microVM's CPU time and its memory's high-water mark, plus how long it ran
// (tests/a-cloud-run-records-what-it-really-used).
//
// cgroup v2 first (cpu.stat's usage_usec, memory.peak), then /proc (the
// `cpu` line of /proc/stat, MemTotal - MemAvailable from /proc/meminfo).
// Memory is also sampled while the run goes, so a machine without
// memory.peak still has a peak. Anything it cannot read is null: a guess
// here would end up as a price.
import fs from 'node:fs';

const USER_HZ = 100;

export function usageMeter({ root = '/sys/fs/cgroup', proc = '/proc', now = Date.now, intervalMs = 5_000 } = {}) {
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
  const num = (t) => (t != null && /^\s*\d+/.test(t) ? Number(t.trim().split(/\s+/)[0]) : null);

  const cgroupCpu = () => {
    const m = read(`${root}/cpu.stat`)?.match(/^usage_usec (\d+)/m);
    return m ? Number(m[1]) / 1e6 : null;
  };
  const procCpu = () => {
    const line = read(`${proc}/stat`)?.split('\n')[0];
    if (!line?.startsWith('cpu ')) return null;
    const v = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = (v[3] || 0) + (v[4] || 0);
    return (v.reduce((a, b) => a + b, 0) - idle) / USER_HZ;
  };
  const memNow = () => {
    const current = num(read(`${root}/memory.current`));
    if (current != null) return current;
    const info = read(`${proc}/meminfo`);
    const total = info?.match(/^MemTotal:\s+(\d+) kB/m);
    const avail = info?.match(/^MemAvailable:\s+(\d+) kB/m);
    return total && avail ? (Number(total[1]) - Number(avail[1])) * 1024 : null;
  };

  const source = cgroupCpu() != null ? 'cgroup' : procCpu() != null ? 'proc' : null;
  const cpu = source === 'cgroup' ? cgroupCpu : source === 'proc' ? procCpu : () => null;
  const started = now();
  const cpu0 = cpu();
  let sampled = memNow();
  const sample = () => {
    const m = memNow();
    if (m != null && (sampled == null || m > sampled)) sampled = m;
  };
  const timer = intervalMs > 0 ? setInterval(sample, intervalMs) : null;
  timer?.unref?.();

  return {
    sample,
    stop() {
      if (timer) clearInterval(timer);
      sample();
      const peak = num(read(`${root}/memory.peak`));
      const cpu1 = cpu();
      const best = [peak, sampled].filter((v) => v != null);
      return {
        wallSeconds: Math.round((now() - started) / 100) / 10,
        cpuSeconds: cpu0 != null && cpu1 != null ? Math.round((cpu1 - cpu0) * 1000) / 1000 : null,
        peakMemoryBytes: best.length ? Math.max(...best) : null,
        source,
      };
    },
  };
}
