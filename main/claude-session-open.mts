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
  return claudeSessionState(sessionId, homes) !== null;
}

/** What the open session says: its status (busy, shell, idle or waiting; ''
 *  from a CLI that says nothing), what it waits for and the name of the folder
 *  it is open in, or null when no live process holds it. */
export interface ClaudeSessionState { status: string; waitingFor: string; folder?: string; pid?: number }

export function claudeSessionState(sessionId: unknown, homes: (string | null | undefined)[] = []): ClaudeSessionState | null {
  const id = String(sessionId ?? '').trim();
  if (!id) return null;
  for (const home of new Set(homes.filter(Boolean) as string[])) {
    const dir = path.join(home, 'sessions');
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      let rec: { pid?: unknown; sessionId?: unknown; status?: unknown; waitingFor?: unknown; cwd?: unknown } | null = null;
      try { rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { continue; }
      const pid = Number(rec?.pid);
      if (rec?.sessionId !== id || !(pid > 0) || !alive(pid)) continue;
      const word = (v: unknown) => (typeof v === 'string' ? v : '');
      return { status: word(rec.status), waitingFor: word(rec.waitingFor), folder: path.basename(word(rec.cwd)), pid };
    }
  }
  return null;
}

export function claudeSessionStatus(sessionId: unknown, homes: (string | null | undefined)[] = []): string | null {
  return claudeSessionState(sessionId, homes)?.status ?? null;
}
