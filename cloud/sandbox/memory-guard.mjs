// THE CLOUD MACHINE'S MEMORY GUARD.
//
// The machine has 8 GB and the server is its first process: a run that fills
// the memory thrashes the machine until the server stops answering, and the
// run's unsent work goes with it. Under a floor of free memory this stops the
// biggest program the agent started, never the agent or the server, and waits
// for the memory to come back before it stops another
// (tests/a-cloud-run-out-of-memory-loses-its-biggest-program-not-its-machine).
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

// A container's own limit when it has one, else the machine's. Cache the
// kernel can drop is counted as free, as MemAvailable counts it.
export function availableMemory({ proc = '/proc', cgroup = '/sys/fs/cgroup' } = {}) {
  const max = read(path.join(cgroup, 'memory.max'))?.trim();
  const current = Number(read(path.join(cgroup, 'memory.current'))?.trim());
  if (max && /^\d+$/.test(max) && Number.isFinite(current)) {
    const inactive = Number(read(path.join(cgroup, 'memory.stat'))?.match(/^inactive_file (\d+)/m)?.[1] ?? 0);
    return Number(max) - (current - inactive);
  }
  const kb = read(path.join(proc, 'meminfo'))?.match(/^MemAvailable:\s+(\d+) kB/m)?.[1];
  return kb ? Number(kb) * 1024 : null;
}

function processes(proc) {
  let names = [];
  try { names = fs.readdirSync(proc).filter((n) => /^\d+$/.test(n)); } catch { return []; }
  const out = [];
  for (const n of names) {
    const s = read(path.join(proc, n, 'status'));
    if (!s) continue;
    const field = (k) => s.match(new RegExp(`^${k}:\\s+(\\S+)`, 'm'))?.[1];
    out.push({
      pid: Number(n),
      name: field('Name') ?? '?',
      ppid: Number(field('PPid') ?? -1),
      uid: Number(field('Uid') ?? -1),
      rssBytes: Number(field('VmRSS') ?? 0) * 1024,
    });
  }
  return out;
}

/**
 * `agentPid` is the agent CLI. With `ownerUid` every process of that user is
 * the run's (a job it left running with nohup is too); without one, only the
 * agent's descendants are.
 */
export function memoryGuard({
  proc = '/proc', cgroup = '/sys/fs/cgroup', floorBytes, everyMs = 2_000, settleMs = 10_000,
  agentPid, ownerUid = null, keep = [process.pid],
  kill = (pid) => process.kill(pid, 'SIGKILL'), onStop = () => {}, now = Date.now,
}) {
  let lastStop = -Infinity;
  const spared = new Set([agentPid, ...keep]);

  function runs(all) {
    if (ownerUid != null) return all.filter((p) => p.uid === ownerUid);
    const kids = new Map();
    for (const p of all) kids.set(p.ppid, [...(kids.get(p.ppid) ?? []), p]);
    const found = [];
    const walk = (pid) => { for (const k of kids.get(pid) ?? []) { found.push(k); walk(k.pid); } };
    walk(agentPid);
    return found;
  }

  function check() {
    if (now() - lastStop < settleMs) return null;
    const available = availableMemory({ proc, cgroup });
    if (available == null || available >= floorBytes) return null;
    const biggest = runs(processes(proc))
      .filter((p) => !spared.has(p.pid))
      .sort((a, b) => b.rssBytes - a.rssBytes)[0];
    if (!biggest) return null;
    try { kill(biggest.pid); } catch { return null; }
    lastStop = now();
    const stopped = { pid: biggest.pid, name: biggest.name, rssBytes: biggest.rssBytes, availableBytes: available };
    onStop(stopped);
    return stopped;
  }

  const timer = everyMs > 0 ? setInterval(() => { try { check(); } catch { /* never the server's end */ } }, everyMs) : null;
  timer?.unref?.();
  return { check, stop() { if (timer) clearInterval(timer); } };
}
