// Whether a process that holds something is still there. Signal 0 asks the
// kernel without touching it; EPERM means it exists and is somebody else's.
// A zombie also answers that it exists: it has exited and nothing collected it
// yet, and on Linux it says so in /proc. That pid holds nothing.
import fs from 'node:fs';

function zombie(pid: number): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) === 'Z';
  } catch { return false; }
}

export function alive(pid: number | null | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException)?.code !== 'EPERM') return false; }
  return !zombie(pid);
}
