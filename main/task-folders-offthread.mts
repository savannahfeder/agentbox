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
// thread instead: `execFileSync` there blocks that thread and nothing else.
//
// TWO LANES, AND NO JOB HOLDS ONE FOR EVER (w-6f4acda096b7). With one thread
// for every job, one slow park or one stuck git left every later start in every
// project waiting. Making a thread's folder has a lane of its own; putting
// folders away and listing them has the other. Each lane runs one job at a
// time. A job that holds its lane past STUCK_MS is left to finish on its thread
// and the jobs behind it go to a fresh one. Two jobs for the same thread never
// run at once, in either lane: a park and a start of one folder must not race.
// A job still out at its deadline is given up on and its thread ended
// (w-7054e8638d), so a thread left behind is never kept for good.
//
// IF A THREAD CANNOT START, THE JOB RUNS HERE, the old way. A packaged build
// reads its code out of an asar archive, and a folder made slowly is better
// than a task that never gets one.
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import * as folders from './task-folders.mts';
import { stripTypesFlags } from './strip-types.mts';
import { noteThread } from './thread-heaps.mts';

export type FolderJobName =
  | 'restoreTaskFolder' | 'releaseTaskFolder' | 'parkTaskFolder' | 'listTaskFolders'
  | 'inventoryWorktrees' | 'strayWorktrees' | 'pruneMissingWorktrees'
  | 'makeSpareFolder' | 'dropSpareFolder';

const JOBS = new Set<string>([
  'restoreTaskFolder', 'releaseTaskFolder', 'parkTaskFolder', 'listTaskFolders',
  // Looking over every copy of the project, which is a `git worktree list` plus
  // a `stat` each and belongs on this thread for the same reason as the rest.
  'inventoryWorktrees', 'strayWorktrees', 'pruneMissingWorktrees',
  'makeSpareFolder', 'dropSpareFolder',
]);

export type FolderLaneName = 'start' | 'tidy';

export const laneOf = (name: FolderJobName): FolderLaneName => (name === 'restoreTaskFolder' ? 'start' : 'tidy');

/** How long one job may hold its lane before the jobs behind it go to a fresh thread. */
export const STUCK_MS = 2 * 60_000;
/** Threads left holding a stuck job, at most. Past this the lane waits, so a git that hangs every time cannot spawn threads without end. */
export const MOST_LEFT_BEHIND = 2;

/** A folder job that ran past its deadline and was given up on. */
export class FolderJobTimedOut extends Error {
  readonly timedOut = true;
}

/** From when a job is handed to a thread, not from when it was asked for: waiting in line is not being stuck. */
export const jobDeadline = () => Number(process.env.AGENTBOX_FOLDER_JOB_MS) || 5 * 60_000;

interface Answer { id: number; ok: boolean; value?: unknown; error?: string }

export interface FolderThread {
  postMessage(message: { id: number; name: FolderJobName; args: unknown[] }): void;
  on(event: 'message', listener: (answer: Answer) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: () => void): unknown;
  ref(): void;
  unref(): void;
  terminate(): unknown;
}

interface Job {
  id: number;
  name: FolderJobName;
  args: unknown[];
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  thread?: FolderThread;
  deadline?: ReturnType<typeof setTimeout>;
}

interface Lane { thread: FolderThread | null; current: Job | null; queue: Job[]; timer: ReturnType<typeof setTimeout> | null }

const ONE_FOLDER = new Set<FolderJobName>(['restoreTaskFolder', 'parkTaskFolder', 'releaseTaskFolder']);
const SPARE = new Set<FolderJobName>(['makeSpareFolder', 'dropSpareFolder']);

/** A thread whose folder is not there yet, which is the only kind that may take the one made ahead. */
function couldTakeTheSpare(job: Job): boolean {
  if (job.name !== 'restoreTaskFolder') return false;
  try { return !fs.existsSync(folders.taskFolderPath(String(job.args[0]), job.args[1])); } catch { return true; }
}

// A prune drops registrations whose folder is missing, and a folder being made
// is briefly missing while git moves it into place. A new thread may take the
// folder made ahead, so making or dropping that one and making the new
// thread's folder wait for each other. A reply to a thread whose folder is
// there waits for neither.
function clash(a: Job, b: Job): boolean {
  if (String(a.args[0]) !== String(b.args[0])) return false;
  if (a.name === 'pruneMissingWorktrees' || b.name === 'pruneMissingWorktrees') return true;
  const takes = (j: Job) => SPARE.has(j.name) || couldTakeTheSpare(j);
  if (SPARE.has(a.name) || SPARE.has(b.name)) return takes(a) && takes(b);
  return ONE_FOLDER.has(a.name) && ONE_FOLDER.has(b.name) && String(a.args[1]) === String(b.args[1]);
}

export class FolderLanes {
  declare makeThread: () => FolderThread;
  declare runHere: (name: FolderJobName, args: unknown[]) => unknown;
  declare jobMs: () => number;
  declare lanes: Record<FolderLaneName, Lane>;
  declare out: Map<number, Job>;
  declare leftBehind: Set<FolderThread>;
  declare broken: boolean;
  declare seq: number;

  constructor({ makeThread, runHere, jobMs = jobDeadline }: { makeThread: () => FolderThread; runHere: (name: FolderJobName, args: unknown[]) => unknown; jobMs?: () => number }) {
    this.makeThread = makeThread;
    this.runHere = runHere;
    this.jobMs = jobMs;
    const lane = (): Lane => ({ thread: null, current: null, queue: [], timer: null });
    this.lanes = { start: lane(), tidy: lane() };
    this.out = new Map();
    this.leftBehind = new Set();
    this.broken = false;
    this.seq = 0;
  }

  run(name: FolderJobName, args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.lanes[laneOf(name)].queue.push({ id: ++this.seq, name, args, resolve, reject });
      this._pumpAll();
    });
  }

  /** Starts a lane's thread before its first job needs it. False when no thread can start, and jobs run here. */
  warm(name: FolderLaneName): boolean {
    return !!this._threadFor(this.lanes[name]);
  }

  _here(job: Job) {
    try { job.resolve(this.runHere(job.name, job.args)); } catch (error) { job.reject(error); }
  }

  _folderBusy(job: Job): boolean {
    return [...this.out.values()].some((other) => clash(job, other));
  }

  _pumpAll() {
    this._pump(this.lanes.start);
    this._pump(this.lanes.tidy);
  }

  _pump(lane: Lane) {
    while (!lane.current) {
      const at = lane.queue.findIndex((job) => !this._folderBusy(job));
      if (at < 0) { if (!lane.queue.length) lane.thread?.unref(); return; }
      const [job] = lane.queue.splice(at, 1);
      const thread = this._threadFor(lane);
      if (!thread) { this._here(job); continue; }
      lane.current = job;
      job.thread = thread;
      this.out.set(job.id, job);
      thread.ref();
      thread.postMessage({ id: job.id, name: job.name, args: job.args });
      this._watch(lane, job);
      this._deadline(job);
    }
  }

  // A thread cannot be interrupted while it sits in a child process; the
  // child's own deadline (main/worktree-include.mts) ends that.
  _deadline(job: Job) {
    const limit = this.jobMs();
    job.deadline = setTimeout(() => {
      if (this.out.get(job.id) !== job) return;
      this.out.delete(job.id);
      const thread = job.thread!;
      const lane = this._laneHolding(job);
      if (lane) {
        if (lane.timer) clearTimeout(lane.timer);
        lane.timer = null;
        lane.current = null;
      }
      for (const l of Object.values(this.lanes)) if (l.thread === thread) l.thread = null;
      this.leftBehind.delete(thread);
      thread.unref();
      void Promise.resolve(thread.terminate()).catch(() => {});
      console.warn(`zero: a ${job.name} folder job ran past ${limit} ms; its thread was ended`);
      const minutes = Math.max(1, Math.round(limit / 60_000));
      job.reject(new FolderJobTimedOut(`making this thread's folder took more than ${minutes} minute${minutes === 1 ? '' : 's'}, so it was stopped`));
      this._pumpAll();
    }, limit);
    (job.deadline as { unref?: () => void }).unref?.();
  }

  _watch(lane: Lane, job: Job) {
    lane.timer = setTimeout(() => {
      lane.timer = null;
      if (lane.current !== job) return;
      if (this.leftBehind.size >= MOST_LEFT_BEHIND) { this._watch(lane, job); return; }
      const thread = lane.thread!;
      this.leftBehind.add(thread);
      thread.unref();
      lane.thread = null;
      lane.current = null;
      console.warn(`zero: a folder job (${job.name}) has run ${Math.round(STUCK_MS / 1000)} s; the jobs behind it go to a new thread`);
      this._pumpAll();
    }, STUCK_MS);
    (lane.timer as { unref?: () => void }).unref?.();
  }

  _threadFor(lane: Lane): FolderThread | null {
    if (lane.thread || this.broken) return lane.thread;
    let thread: FolderThread;
    try {
      thread = this.makeThread();
    } catch (error) {
      console.warn('zero: task folders will be made on the main thread:', (error as Error).message);
      this.broken = true;
      return null;
    }
    thread.on('message', (answer) => this._answered(thread, answer));
    thread.on('error', (error) => {
      console.warn('zero: the task folder thread failed:', error.message);
      this._died(thread);
    });
    thread.on('exit', () => this._died(thread));
    // Holding the process open only while a job is out, so a finished job is never
    // the reason the app, or a test run, stays up. After the listeners, because
    // adding a 'message' listener refs the port again.
    thread.unref();
    lane.thread = thread;
    return thread;
  }

  _laneHolding(job: Job): Lane | null {
    return Object.values(this.lanes).find((lane) => lane.current === job) ?? null;
  }

  _answered(thread: FolderThread, { id, ok, value, error }: Answer) {
    const job = this.out.get(id);
    if (!job || job.thread !== thread) return;
    this.out.delete(id);
    clearTimeout(job.deadline);
    const lane = this._laneHolding(job);
    if (lane) {
      if (lane.timer) clearTimeout(lane.timer);
      lane.timer = null;
      lane.current = null;
    }
    if (this.leftBehind.delete(thread)) thread.terminate();
    if (ok) job.resolve(value); else job.reject(new Error(error));
    this._pumpAll();
  }

  _died(thread: FolderThread) {
    const stranded = [...this.out.values()].filter((job) => job.thread === thread);
    if (!stranded.length && !Object.values(this.lanes).some((lane) => lane.thread === thread)) return;
    for (const lane of Object.values(this.lanes)) {
      if (lane.thread !== thread) continue;
      this.broken = true;
      lane.thread = null;
      if (lane.timer) clearTimeout(lane.timer);
      lane.timer = null;
      lane.current = null;
    }
    this.leftBehind.delete(thread);
    for (const job of stranded) { this.out.delete(job.id); clearTimeout(job.deadline); this._here(job); }
    this._pumpAll();
  }
}

const lanes = new FolderLanes({
  makeThread: () => {
    const thread = new Worker(new URL('./task-folders-thread.mts', import.meta.url), { execArgv: [...process.execArgv, ...stripTypesFlags()] });
    noteThread('folders', thread);
    return thread;
  },
  runHere: (name, args) => (folders[name] as (...args: unknown[]) => unknown)(...args),
});

/** The thread that makes a thread's folder, started before the first one is asked for. */
export function warmFolderThread(): boolean {
  return lanes.warm('start');
}

/** Run one of task-folders.mts's exports without blocking this thread. */
export function folderJob<N extends FolderJobName>(name: N, ...args: Parameters<(typeof folders)[N]>): Promise<Awaited<ReturnType<(typeof folders)[N]>>> {
  if (!JOBS.has(name)) return Promise.reject(new Error(`not a folder job: ${name}`));
  return lanes.run(name, args) as Promise<Awaited<ReturnType<(typeof folders)[N]>>>;
}
