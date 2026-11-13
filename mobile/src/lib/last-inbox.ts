// The inbox as it last read, kept on the phone so an app opened offline shows
// your threads, under "This is how it was … ago", instead of an empty list.
import type { PhoneRows } from '../../../renderer/src/phone-rows';

export interface InboxFile { read(): string | null; write(text: string | null): void }
export interface LastInbox { owner: string; fetchedAt: number; rows: PhoneRows }

// Unchanged rows are written again this often, so the age it says stays close to true.
export const KEEP_AGAIN_MS = 60_000;

export function readLastInbox(file: InboxFile, owner: string | null | undefined): LastInbox | null {
  if (!owner) return null;
  try {
    const kept = JSON.parse(file.read() ?? 'null') as LastInbox | null;
    if (!kept || kept.owner !== owner || !(kept.fetchedAt > 0)) return null;
    const { projects, threads, commands } = kept.rows ?? {};
    if (!Array.isArray(projects) || !Array.isArray(threads) || !Array.isArray(commands)) return null;
    return kept;
  } catch { return null; }
}

const shapeOf = (owner: string, rows: PhoneRows) => JSON.stringify([
  owner,
  rows.projects.map((p) => [p.device, p.project, p.name, p.updated_at, p.cloud]),
  rows.threads.map((t) => [t.device, t.project, t.item, t.updated_at]),
  rows.commands.map((c) => [c.id, c.claimed_at, c.claimed_by, c.taken_at, c.outcome]),
]);

export function inboxKeeper(file: InboxFile) {
  let wrote = { shape: '', at: 0 };
  return {
    keep(owner: string | null | undefined, rows: PhoneRows, fetchedAt: number) {
      if (!owner) return;
      const shape = shapeOf(owner, rows);
      if (shape === wrote.shape && fetchedAt - wrote.at < KEEP_AGAIN_MS) return;
      try {
        file.write(JSON.stringify({ owner, fetchedAt, rows } satisfies LastInbox));
        wrote = { shape, at: fetchedAt };
      } catch { /* a full store keeps nothing; the live inbox still reads */ }
    },
    forget() {
      wrote = { shape: '', at: 0 };
      try { file.write(null); } catch { /* nothing kept to forget */ }
    },
  };
}
