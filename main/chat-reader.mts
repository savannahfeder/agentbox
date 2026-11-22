// THE CHATS ON THIS COMPUTER, READ IN A THREAD OF THEIR OWN.
//
// Claude Code and Codex keep every conversation as files, and a heavy user's
// run to tens of thousands of them and many GB. Reading them on the main
// process is the app not answering for as long as the read takes, so every
// read the import card, setup and the Codex watch make happens here instead.
// One worker per kind, kept for the life of the app: the Codex one remembers
// transcripts between its minute reads, and a slow Codex read never holds up
// a Claude Code one. Where a worker cannot start, the read runs here.
import { Worker } from 'node:worker_threads';
import { stripTypesFlags } from './strip-types.mts';
import { noteThread } from './thread-heaps.mts';
import { readChatEnds, readSessionThreads } from './agent-sessions.mts';
import type { ImportThread, SessionThreadOptions } from './agent-sessions.mts';
import { readCodexThreads } from './codex-threads.mts';
import type { CodexThreadsOptions, CodexThreadsRead } from './codex-threads.mts';

export type SessionThreadsRead = ReturnType<typeof readSessionThreads>;

export type ChatRead =
  | { op: 'codex'; opts: CodexThreadsOptions }
  | { op: 'claude'; opts: SessionThreadOptions }
  | { op: 'ends'; threads: ImportThread[] };

/** What the worker runs, and what runs here when there is no worker. */
export function readChats(ask: ChatRead): CodexThreadsRead | SessionThreadsRead | ImportThread[] {
  if (ask.op === 'codex') return readCodexThreads(ask.opts);
  if (ask.op === 'claude') return readSessionThreads(ask.opts);
  return readChatEnds(ask.threads);
}

const DEADLINE_MS = 5 * 60_000;

interface Wait { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
interface Reply { id: number; ok: boolean; value: unknown; error?: string }

const readers = new Map<string, { worker: Worker; waiting: Map<number, Wait> }>();
let asked = 0;

function readerFor(kind: 'codex' | 'claude') {
  const had = readers.get(kind);
  if (had) return had;
  const worker = new Worker(new URL('./chat-reader-worker.mts', import.meta.url), { execArgv: [...process.execArgv, ...stripTypesFlags()] });
  worker.unref();
  noteThread(`${kind} reader`, worker);
  const reader = { worker, waiting: new Map<number, Wait>() };
  worker.on('message', ({ id, ok, value, error }: Reply) => {
    const w = reader.waiting.get(id);
    if (!w) return;
    reader.waiting.delete(id);
    clearTimeout(w.timer);
    if (ok) w.resolve(value); else w.reject(new Error(error));
  });
  const fail = (err: Error) => {
    for (const w of reader.waiting.values()) { clearTimeout(w.timer); w.reject(err); }
    reader.waiting.clear();
    if (readers.get(kind) === reader) readers.delete(kind);
  };
  worker.on('error', fail);
  worker.on('exit', () => fail(new Error(`the ${kind} reader stopped`)));
  readers.set(kind, reader);
  return reader;
}

function offThread<T>(kind: 'codex' | 'claude', ask: ChatRead): Promise<T> {
  let reader: ReturnType<typeof readerFor>;
  try { reader = readerFor(kind); } catch { return Promise.resolve().then(() => readChats(ask) as T); }
  const id = (asked += 1);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { reader.waiting.delete(id); reject(new Error(`the ${kind} reader did not answer in time`)); }, DEADLINE_MS);
    timer.unref?.();
    reader.waiting.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    reader.worker.postMessage({ id, ask });
  });
}

export const readCodexThreadsOffThread = (opts: CodexThreadsOptions = {}) => offThread<CodexThreadsRead>('codex', { op: 'codex', opts });
export const readClaudeThreadsOffThread = (opts: SessionThreadOptions = {}) => offThread<SessionThreadsRead>('claude', { op: 'claude', opts });
/** The picked chats with their ends read (`readChatEnds`). */
export const readChatEndsOffThread = (threads: ImportThread[]) => offThread<ImportThread[]>('claude', { op: 'ends', threads });
