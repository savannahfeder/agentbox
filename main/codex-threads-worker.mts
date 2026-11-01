// Reads Codex transcripts for the watch, off the app's main process
// (codex-threads.mts readCodexThreadsOffThread).
import { parentPort } from 'node:worker_threads';
import { readCodexThreads } from './codex-threads.mts';
import type { CodexThreadsOptions } from './codex-threads.mts';

parentPort!.on('message', ({ id, opts }: { id: number; opts: CodexThreadsOptions }) => {
  try {
    parentPort!.postMessage({ id, ok: true, value: readCodexThreads(opts) });
  } catch (err) {
    parentPort!.postMessage({ id, ok: false, error: String((err as { message?: unknown } | null)?.message ?? err) });
  }
});
