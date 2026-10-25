// WHICH CODING AGENT YOU USED LAST, which the sidebar's usage row names
// (w-dcaa2c122e): the newest thread running now, else the thread touched last,
// read off the agent main says it runs on.
import type { Snapshot } from './types';

export function lastUsedEngine(snap: Pick<Snapshot, 'supervisor' | 'items' | 'engines'> | null | undefined): string | null {
  if (!snap) return null;
  let run: { engine?: string; startedAt: number } | null = null;
  for (const r of snap.supervisor?.running ?? []) if (r.engine && (!run || r.startedAt > run.startedAt)) run = r;
  if (run?.engine) return run.engine;
  const byItem = snap.engines?.byItem ?? {};
  let latest: { id: string; updatedAt: number } | null = null;
  for (const item of snap.items ?? []) if (byItem[item.id] && (!latest || item.updatedAt > latest.updatedAt)) latest = item;
  return latest ? byItem[latest.id] : null;
}
