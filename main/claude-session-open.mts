// Whether Claude Code still has a session open somewhere, read off the state
// file it keeps for each open session (`<home>/sessions/<pid>.json`, with the
// session id and the pid holding it). A state file whose process has gone is a
// session somebody closed.
import fs from 'node:fs';
import path from 'node:path';

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (err) { return (err as NodeJS.ErrnoException)?.code === 'EPERM'; }
}

export function claudeSessionOpen(sessionId: unknown, homes: (string | null | undefined)[] = []) {
  const id = String(sessionId ?? '').trim();
  if (!id) return false;
  for (const home of new Set(homes.filter(Boolean) as string[])) {
    const dir = path.join(home, 'sessions');
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      let rec: { pid?: unknown; sessionId?: unknown } | null = null;
      try { rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { continue; }
      const pid = Number(rec?.pid);
      if (rec?.sessionId === id && pid > 0 && alive(pid)) return true;
    }
  }
  return false;
}
