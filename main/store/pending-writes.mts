// A write the ledger refused, kept on disk until somebody delivers it.
//
// The claim fence is right and stays: a worker whose lease has lapsed must not
// stamp over whoever picked the row up next. What was wrong is what happened
// after the refusal, which was nothing. The write was thrown away, the session
// usually ended on that call, and neither the founder nor the agent ever learned
// a message had existed. Measured across 3,191 worker transcripts on this
// machine between 2 and 24 August 2026: 233 writes refused for a lapsed claim,
// 50 of them never landed on the row by any route, carrying 101,606 characters
// of finished notes and results. Half were the session's closing message.
//
// So a refused write is parked here instead, and the next session to claim that
// row is handed it. Parking is deliberately NOT delivery: writing it onto the
// row behind the fence would be the overwrite the fence exists to stop. The
// message waits for someone who legitimately holds the claim to decide what of
// it is still true.
//
// One file per refused write, in the app's own home, because a home survives a
// reboot and /tmp does not. It used to be the product's own folder, which
// survives one just as well and is also the worker's working directory
// (main/store/home.mts).

import fs from 'node:fs';
import path from 'node:path';
import { machineryPath } from './home.mts';
import { isWorkItemId, type PatchInput } from '../../shared/work-items.mts';

export interface PendingWrite {
  item: string;
  ts: number;
  writtenAt: string;
  holder: string | null;
  epoch: number | null;
  refusedBecause: string;
  patch: PatchInput;
  file: string;
  relPath: string;
}

const DIR = 'pending-writes';
// Delivered messages move here rather than being deleted: the next session
// after that one should not be handed a message already carried, and nothing
// about this should ever be the reason something becomes unrecoverable.
const COLLECTED = 'collected';

// A holder id reaches us from an MCP client and ends up in a filename.
function safeHolder(holder: string | null | undefined): string {
  return String(holder ?? 'unknown').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40) || 'unknown';
}

// In the app's home beside the ledger, not in the product folder. The reason
// the header gives still holds — this must survive a reboot and /tmp does not —
// and `~/.astral` survives one exactly as well (main/store/home.mts).
function itemDir(projectDir: string, id: string): string {
  if (!isWorkItemId(id)) throw new Error(`invalid work item id: ${id}`);
  return machineryPath(projectDir, path.join(DIR, id));
}

/**
 * Keep a refused write. Returns where it went, so the caller can say so in the
 * error it raises: an agent that is told its message survived and where can
 * re-claim and re-send, which is the whole difference between a lost night and
 * a retry.
 */
export function parkPendingWrite(
  projectDir: string, id: string, patch: PatchInput | null | undefined,
  { holder, epoch = null, reason = '', now = Date.now() }: { holder?: string | null; epoch?: number | null; reason?: string; now?: number } = {},
): PendingWrite {
  const dir = itemDir(projectDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${now}-${safeHolder(holder)}.json`;
  const file = path.join(dir, name);
  const record = {
    item: id,
    ts: now,
    writtenAt: new Date(now).toISOString(),
    holder: holder ?? null,
    epoch,
    refusedBecause: reason,
    patch: patch ?? {},
  };
  fs.writeFileSync(file, `${JSON.stringify(record, null, 1)}\n`, 'utf8');
  return { ...record, file, relPath: path.join(DIR, id, name) };
}

/** Every write still waiting on this row, oldest first. */
export function readPendingWrites(projectDir: string, id: string): PendingWrite[] {
  let dir: string;
  try { dir = itemDir(projectDir, id); } catch { return []; }
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: PendingWrite[] = [];
  for (const name of names.sort()) {
    let record: Omit<PendingWrite, 'file' | 'relPath'> | null = null;
    try { record = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { continue; }
    if (!record || typeof record !== 'object') continue;
    out.push({ ...record, file: path.join(dir, name), relPath: path.join(DIR, id, name) });
  }
  return out.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
}

/**
 * Mark everything waiting on this row as delivered, by the session that was
 * handed it. Called when that session actually writes to the row: it has been
 * given the message and has now spoken, so a third session must not be handed
 * the same words again. The files move rather than vanish.
 */
export function collectPendingWrites(projectDir: string, id: string, { by = null, now = Date.now() }: { by?: string | null; now?: number } = {}): string[] {
  const waiting = readPendingWrites(projectDir, id);
  if (!waiting.length) return [];
  const dir = itemDir(projectDir, id);
  const done = path.join(dir, COLLECTED);
  fs.mkdirSync(done, { recursive: true });
  const moved: string[] = [];
  for (const record of waiting) {
    const target = path.join(done, path.basename(record.file));
    try {
      fs.writeFileSync(record.file, `${JSON.stringify({ ...stripPaths(record), collectedBy: by, collectedAt: new Date(now).toISOString() }, null, 1)}\n`, 'utf8');
      fs.renameSync(record.file, target);
      moved.push(target);
    } catch { /* a message we cannot move is left where it is, which is safe */ }
  }
  return moved;
}

function stripPaths({ file, relPath, ...rest }: PendingWrite): Omit<PendingWrite, 'file' | 'relPath'> {
  return rest;
}

export const _internals = { DIR, COLLECTED, itemDir };
