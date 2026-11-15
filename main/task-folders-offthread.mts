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
// fed one job at a time, so git never runs two at once, but `restoreTaskFolder`
// (a thread whose agent cannot start until it answers) goes ahead of the
// tidying up. Measured on her Mac with 18 agents and 50 folders: every agent
// that finished queued a full sweep, `listTaskFolders` alone was 32 s of it,
// and new threads sat behind them for minutes saying the copy "is taking much
// longer than it should". tests/a-new-thread-gets-its-folder-before-the-tidying-up.
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

/** A folder job that ran past its deadline and was given up on. */
export class FolderJobTimedOut extends Error {
  readonly timedOut = true;
}

/** From when a job is handed to the thread, not from when it was asked for: waiting in line is not being stuck. */
const jobDeadline = () => Number(process.env.AGENTBOX_FOLDER_JOB_MS) || 5 * 60_000;

/** Jobs a thread is waiting on to start its agent: they skip the tidying up. */
const SOMEBODY_WAITS = new Set<string>(['restoreTaskFolder']);

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const queue: FolderJobRequest[] = [];
let current: { id: number; job: FolderJobRequest; timer: NodeJS.Timeout } | null = null;

function runHere({ name, args, resolve, reject }: FolderJobRequest) {
  try { resolve((folders[name] as (...args: unknown[]) => unknown)(...args)); } catch (error) { reject(error); }
}

function giveUp() {
  broken = true;
  worker = null;
  const left = [...(current ? [current.job] : []), ...queue];
  if (current) clearTimeout(current.timer);
  current = null;
  queue.length = 0;
  for (const job of left) runHere(job);
}

// The stuck thread cannot be interrupted while it sits in a child process; the
// child's own deadline ends that. It is let go, and the line moves on without it.
function abandon(stuck: Worker) {
  if (worker === stuck) worker = null;
  stuck.unref();
  stuck.terminate().catch(() => {});
}

function thread(): Worker | null {
  if (worker || broken) return worker;
  let w: Worker;
  try {
    w = new Worker(new URL('./task-folders-thread.mts', import.meta.url), { execArgv: [...process.execArgv, ...stripTypesFlags()] });
  } catch (error) {
    console.warn('zero: task folders will be made on the main thread:', (error as Error).message);
    broken = true;
    return null;
  }
  worker = w;
  w.on('message', ({ id, ok, value, error }: { id: number; ok: boolean; value: unknown; error: string }) => {
    if (worker !== w || current?.id !== id) return;
    const { job, timer } = current;
    clearTimeout(timer);
    current = null;
    if (ok) job.resolve(value); else job.reject(new Error(error));
    next();
  });
  w.on('error', (error: Error) => {
    if (worker !== w) return;
    console.warn('zero: the task folder thread failed:', error.message);
    giveUp();
  });
  w.on('exit', () => { if (worker === w) giveUp(); });
  // Holding the process open only while a job is out, so a finished job is never
  // the reason the app, or a test run, stays up. After the listeners, because
  // adding a 'message' listener refs the port again.
  w.unref();
  return w;
}

function next() {
  if (current) return;
  const urgent = queue.findIndex((j) => SOMEBODY_WAITS.has(j.name));
  const [job] = queue.splice(urgent === -1 ? 0 : urgent, 1);
  if (!job) { worker?.unref(); return; }
  const w = thread();
  if (!w) { runHere(job); next(); return; }
  const id = ++seq;
  const limit = jobDeadline();
  const timer = setTimeout(() => {
    if (current?.id !== id) return;
    current = null;
    const minutes = Math.max(1, Math.round(limit / 60_000));
    console.warn(`zero: a ${job.name} folder job ran past ${limit} ms; starting a fresh folder thread`);
    abandon(w);
    job.reject(new FolderJobTimedOut(`making this thread's folder took more than ${minutes} minute${minutes === 1 ? '' : 's'}, so it was stopped`));
    next();
  }, limit);
  current = { id, job, timer };
  w.ref();
  w.postMessage({ id, name: job.name, args: job.args });
}

/** Run one of task-folders.mts's exports without blocking this thread. */
export function folderJob<N extends FolderJobName>(name: N, ...args: Parameters<(typeof folders)[N]>): Promise<Awaited<ReturnType<(typeof folders)[N]>>> {
  if (!JOBS.has(name)) return Promise.reject(new Error(`not a folder job: ${name}`));
  return new Promise<unknown>((resolve, reject) => {
    const job: FolderJobRequest = { name, args, resolve, reject };
    if (!thread()) { runHere(job); return; }
    queue.push(job);
    next();
  }) as Promise<Awaited<ReturnType<(typeof folders)[N]>>>;
}
