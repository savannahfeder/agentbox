import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';

/** Dropping a file of this name into the log folder asks for one snapshot. A
 *  file and not a signal: SIGUSR2 sent to a build without a handler quits it. */
export const SNAPSHOT_ASK = 'take-heap-snapshot';
const KEEP_SNAPSHOTS = 2;
const KEEP_DAYS = 14;

export type ProcessReading = { type: string; mb: number };

type MemoryRecorderOptions = {
  dir: string;
  /** Every process the app runs, as Electron's getAppMetrics names and sizes them. */
  processes?: () => ProcessReading[];
  /** The window's heap, written to `file`. */
  windowSnapshot?: (file: string) => Promise<unknown>;
  everyMs?: number;
  askMs?: number;
};

const mb = (bytes: number) => Math.round(bytes / 1048576);
const stampOf = (d: Date) => d.toISOString().slice(0, 19).replace(/:/g, '-');

export function startMemoryRecorder({ dir, processes = () => [], windowSnapshot, everyMs = 15 * 60_000, askMs = 60_000 }: MemoryRecorderOptions) {
  const startedAt = Date.now();
  let snapping = false;

  const append = (line: Record<string, unknown>) => {
    const now = new Date();
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, `memory-${now.toISOString().slice(0, 10)}.jsonl`), `${JSON.stringify({ at: now.toISOString(), ...line })}\n`);
    } catch (err) {
      console.warn(`zero: could not write the memory log: ${(err as Error).message}`);
    }
  };

  const record = () => {
    const heap = v8.getHeapStatistics();
    let procs: ProcessReading[] = [];
    try { procs = processes(); } catch { /* the heap line is still worth having */ }
    append({
      upMin: Math.round((Date.now() - startedAt) / 60_000),
      heapMb: mb(heap.used_heap_size),
      heapTotalMb: mb(heap.total_heap_size),
      externalMb: mb(process.memoryUsage().external),
      processes: procs,
    });
    prune();
  };

  const prune = () => {
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { return; }
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const name of names) {
      const day = /^memory-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)?.[1];
      if (day && day < cutoff) fs.rmSync(path.join(dir, name), { force: true });
    }
    for (const kind of ['main', 'window']) {
      const old = names.filter((n) => n.startsWith(`${kind}-`) && n.endsWith('.heapsnapshot')).sort().slice(0, -KEEP_SNAPSHOTS);
      for (const name of old) fs.rmSync(path.join(dir, name), { force: true });
    }
  };

  const snapshotIfAsked = async () => {
    if (snapping) return;
    const ask = path.join(dir, SNAPSHOT_ASK);
    if (!fs.existsSync(ask)) return;
    snapping = true;
    // The ask goes first, so a snapshot that fails is not tried again every minute.
    fs.rmSync(ask, { force: true });
    const stamp = stampOf(new Date());
    const written: string[] = [];
    try {
      const main = path.join(dir, `main-${stamp}.heapsnapshot`);
      v8.writeHeapSnapshot(main);
      written.push(main);
      if (windowSnapshot) {
        const win = path.join(dir, `window-${stamp}.heapsnapshot`);
        try { await windowSnapshot(win); written.push(win); } catch (err) {
          console.warn(`zero: the window gave no heap snapshot: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.warn(`zero: could not write a heap snapshot: ${(err as Error).message}`);
    } finally {
      snapping = false;
    }
    append({ snapshots: written.map((f) => path.basename(f)) });
    prune();
  };

  record();
  const every = setInterval(record, everyMs);
  const asks = setInterval(() => { void snapshotIfAsked(); }, askMs);
  every.unref?.();
  asks.unref?.();
  return { stop() { clearInterval(every); clearInterval(asks); } };
}
