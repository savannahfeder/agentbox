// THE CHECKOUT IS PHOTOGRAPHED OFF THE THREAD THAT DRAWS HER WINDOW.
//
// Measured 2026-10-01 on a test copy: one snapshot of the app took 2.56 seconds
// while an agent was starting, against a few milliseconds either side. The
// spawn ran `snapshotRepo` inline, which is four git commands and a read of
// every untracked file, and on a busy Mac each git command costs half a second.
// That is the "long delay" after pressing Send. The same shape as
// main/task-folders-offthread.mts: main/git-change.mts stays synchronous and
// runs whole inside a worker thread, and if the thread cannot start the job
// runs here, the old way.
import { Worker } from 'node:worker_threads';
import * as git from './git-change.mts';
import { saveRunChange } from './run-change.mts';
import { stripTypesFlags } from './strip-types.mts';
import { noteThread } from './thread-heaps.mts';

type Job = (...args: unknown[]) => unknown;

interface GitJobRequest {
  name: string;
  args: unknown[];
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const change = { ...git, saveRunChange } as unknown as Record<string, Job>;
const JOBS = new Set(['snapshotRepo', 'saveRunChange', 'whereTheWorkStands']);

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const waiting = new Map<number, GitJobRequest>();

function runHere({ name, args, resolve, reject }: GitJobRequest) {
  try { resolve(change[name](...args)); } catch (error) { reject(error); }
}

function giveUp() {
  broken = true;
  worker = null;
  if (idle) clearTimeout(idle);
  const left = [...waiting.values()];
  waiting.clear();
  for (const job of left) runHere(job);
}

// A THREAD WITH NOTHING TO RUN NEVER COLLECTS WHAT ITS LAST JOB LEFT, so one
// big job's memory stayed until the next job. After this long with no job the
// thread is ended, which frees all of it, and the next job starts another.
let idleMs = 60_000;
let idle: ReturnType<typeof setTimeout> | null = null;
let started = 0;

function restSoon() {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    idle = null;
    const mine = worker;
    if (!mine || waiting.size) return;
    // Forgotten first, so its exit is not read as the thread failing.
    worker = null;
    mine.terminate().catch(() => {});
  }, idleMs);
  idle.unref?.();
}

function thread(): Worker | null {
  if (worker || broken) return worker;
  let mine: Worker;
  try {
    mine = new Worker(new URL('./git-change-thread.mts', import.meta.url), { execArgv: [...process.execArgv, ...stripTypesFlags()] });
  } catch (error) {
    console.warn('zero: the checkout will be read on the main thread:', (error as Error).message);
    broken = true;
    return null;
  }
  worker = mine;
  started += 1;
  noteThread('git', mine);
  mine.on('message', ({ id, ok, value, error }: { id: number; ok: boolean; value: unknown; error: string }) => {
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    if (!waiting.size) {
      mine.unref();
      restSoon();
    }
    if (ok) job.resolve(value); else job.reject(new Error(error));
  });
  // Only the thread in use: one ended for being idle says nothing about the next.
  mine.on('error', (error: Error) => {
    if (worker !== mine) return;
    console.warn('zero: the checkout thread failed:', error.message);
    giveUp();
  });
  mine.on('exit', () => { if (worker === mine) giveUp(); });
  mine.unref();
  restSoon();
  return mine;
}

/** For tests: the idle time, how many threads have been started, and whether one is in use. */
export const __gitThread = { idleMs(ms: number) { idleMs = ms; }, started: () => started, inUse: () => !!worker };

/** Settles once no job is waiting on the thread. */
export async function __gitJobsIdle() {
  while (waiting.size) await new Promise((resolve) => { setTimeout(resolve, 10); });
}

/** The thread started before its first job needs it. False when none can start. */
export function warmGitThread(): boolean {
  return !!thread();
}

/** Run one of git-change.mts's exports without blocking this thread. */
export function gitJob(name: string, ...args: unknown[]): Promise<unknown> {
  if (!JOBS.has(name)) return Promise.reject(new Error(`not a git job: ${name}`));
  return new Promise((resolve, reject) => {
    const job: GitJobRequest = { name, args, resolve, reject };
    const w = thread();
    if (!w) { runHere(job); return; }
    const id = ++seq;
    waiting.set(id, job);
    w.ref();
    if (idle) {
      clearTimeout(idle);
      idle = null;
    }
    try {
      w.postMessage({ id, name, args });
    } catch (error) {
      // Arguments a thread cannot be handed (a function, say) run here.
      waiting.delete(id);
      if (!waiting.size) {
        w.unref();
        restSoon();
      }
      runHere(job);
    }
  });
}
