// TASK FOLDERS ARE MADE AND PUT AWAY OFF THE THREAD THAT DRAWS HER WINDOW.
//
// Measured on her Mac, 2026-09-27 (w-7deaeca493), with three agents running:
// the app's main thread sat inside a synchronous child process for 19 seconds
// straight, from 14:49:33 to 14:49:52, and again for 6 seconds from 14:50:41,
// the second time caught in `ps` as `git worktree remove` on an astral-video
// task folder. macOS draws the spinning wheel over a window whose thread stops
// answering for about two seconds, so both were the thing she reported:
// "especially when I complete a task or maybe complete a task and go into a new
// one". On a throwaway copy of that repository `ensureTaskFolder` took 9.6
// seconds and the removal 3.3, because a folder carries a block clone of
// node_modules and a 1.4 GB `.next`, and `cp -c` still pays for every file.
//
// main/task-folders.mts stays synchronous, because it is one argument about git
// and a second, async copy of it would be two. It runs whole inside a worker
// thread instead: `execFileSync` there blocks that thread and nothing else. One
// thread, jobs in order, so folder work is serialised exactly as it was.
//
// A JOB SOMEBODY IS WAITING ON GOES FIRST (2026-11-15). The thread is still
// fed one job at a time, so git never runs two at once, but the queue is kept
// here rather than in the thread's mailbox, and `restoreTaskFolder` (a thread
// whose agent cannot start until it answers) goes ahead of the tidying up.
// Measured on her Mac with 18 agents and 50 folders: every agent that finished
// queued a full sweep, `listTaskFolders` alone was 32 s of it, and new threads
// sat behind them for minutes saying the copy "is taking much longer than it
// should". tests/a-new-thread-gets-its-folder-before-the-tidying-up pins it.
//
// IF THE THREAD CANNOT START, THE JOB RUNS HERE, the old way. A packaged build
// reads its code out of an asar archive, and a folder made slowly is better
// than a task that never gets one.
import { Worker } from 'node:worker_threads';
import * as folders from './task-folders.mts';
import { stripTypesFlags } from './strip-types.mts';

export type FolderJobName =
  | 'restoreTaskFolder' | 'releaseTaskFolder' | 'parkTaskFolder' | 'listTaskFolders'
  | 'inventoryWorktrees' | 'strayWorktrees' | 'pruneMissingWorktrees';

interface FolderJobRequest {
  name: FolderJobName;
  args: unknown[];
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const JOBS = new Set<string>([
  'restoreTaskFolder', 'releaseTaskFolder', 'parkTaskFolder', 'listTaskFolders',
  // Looking over every copy of the project, which is a `git worktree list` plus
  // a `stat` each and belongs on this thread for the same reason as the rest.
  'inventoryWorktrees', 'strayWorktrees', 'pruneMissingWorktrees',
]);

/** Jobs a thread is waiting on to start its agent: they skip the tidying up. */
const SOMEBODY_WAITS = new Set<string>(['restoreTaskFolder']);

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const waiting = new Map<number, FolderJobRequest>();
/** Not yet handed to the thread, oldest first. */
const queued: Array<FolderJobRequest & { id: number }> = [];

function runHere({ name, args, resolve, reject }: FolderJobRequest) {
  try { resolve((folders[name] as (...args: unknown[]) => unknown)(...args)); } catch (error) { reject(error); }
}

function giveUp() {
  broken = true;
  worker = null;
  const left = [...waiting.values(), ...queued.splice(0)];
  waiting.clear();
  for (const job of left) runHere(job);
}

/** Hand the thread its next job if it has none: a waited-on one first, else the oldest. */
function sendNext() {
  if (!worker || waiting.size || !queued.length) return;
  const urgent = queued.findIndex((job) => SOMEBODY_WAITS.has(job.name));
  const [job] = queued.splice(urgent === -1 ? 0 : urgent, 1);
  waiting.set(job.id, job);
  worker.ref();
  worker.postMessage({ id: job.id, name: job.name, args: job.args });
}

function thread(): Worker | null {
  if (worker || broken) return worker;
  try {
    worker = new Worker(new URL('./task-folders-thread.mts', import.meta.url), { execArgv: [...process.execArgv, ...stripTypesFlags()] });
  } catch (error) {
    console.warn('zero: task folders will be made on the main thread:', (error as Error).message);
    broken = true;
    return null;
  }
  worker.on('message', ({ id, ok, value, error }: { id: number; ok: boolean; value: unknown; error: string }) => {
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    sendNext();
    if (!waiting.size) worker?.unref();
    if (ok) job.resolve(value); else job.reject(new Error(error));
  });
  worker.on('error', (error: Error) => {
    console.warn('zero: the task folder thread failed:', error.message);
    giveUp();
  });
  worker.on('exit', () => { if (worker) giveUp(); });
  // Holding the process open only while a job is out, so a finished job is never
  // the reason the app, or a test run, stays up. After the listeners, because
  // adding a 'message' listener refs the port again.
  worker.unref();
  return worker;
}

/** Run one of task-folders.mts's exports without blocking this thread. */
export function folderJob<N extends FolderJobName>(name: N, ...args: Parameters<(typeof folders)[N]>): Promise<Awaited<ReturnType<(typeof folders)[N]>>> {
  if (!JOBS.has(name)) return Promise.reject(new Error(`not a folder job: ${name}`));
  return new Promise<unknown>((resolve, reject) => {
    const job: FolderJobRequest = { name, args, resolve, reject };
    const w = thread();
    if (!w) { runHere(job); return; }
    queued.push({ ...job, id: ++seq });
    sendNext();
  }) as Promise<Awaited<ReturnType<(typeof folders)[N]>>>;
}
