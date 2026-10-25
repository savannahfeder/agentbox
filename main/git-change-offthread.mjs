// THE CHECKOUT IS PHOTOGRAPHED OFF THE THREAD THAT DRAWS HER WINDOW.
//
// Measured 2026-10-01 on a test copy: one snapshot of the app took 2.56 seconds
// while an agent was starting, against a few milliseconds either side. The
// spawn ran `snapshotRepo` inline, which is four git commands and a read of
// every untracked file, and on a busy Mac each git command costs half a second.
// That is the "long delay" after pressing Send. The same shape as
// main/task-folders-offthread.mjs: main/git-change.mjs stays synchronous and
// runs whole inside a worker thread, and if the thread cannot start the job
// runs here, the old way.
import { Worker } from 'node:worker_threads';
import * as git from './git-change.mjs';
import { saveRunChange } from './run-change.mjs';

const change = { ...git, saveRunChange };
const JOBS = new Set(['snapshotRepo', 'saveRunChange']);

let worker = null;
let broken = false;
let seq = 0;
const waiting = new Map();

function runHere({ name, args, resolve, reject }) {
  try { resolve(change[name](...args)); } catch (error) { reject(error); }
}

function giveUp() {
  broken = true;
  worker = null;
  const left = [...waiting.values()];
  waiting.clear();
  for (const job of left) runHere(job);
}

function thread() {
  if (worker || broken) return worker;
  try {
    worker = new Worker(new URL('./git-change-thread.mjs', import.meta.url));
  } catch (error) {
    console.warn('zero: the checkout will be read on the main thread:', error.message);
    broken = true;
    return null;
  }
  worker.on('message', ({ id, ok, value, error }) => {
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    if (!waiting.size) worker?.unref();
    if (ok) job.resolve(value); else job.reject(new Error(error));
  });
  worker.on('error', (error) => {
    console.warn('zero: the checkout thread failed:', error.message);
    giveUp();
  });
  worker.on('exit', () => { if (worker) giveUp(); });
  worker.unref();
  return worker;
}

/** Settles once no job is waiting on the thread. */
export async function __gitJobsIdle() {
  while (waiting.size) await new Promise((resolve) => { setTimeout(resolve, 10); });
}

/** Run one of git-change.mjs's exports without blocking this thread. */
export function gitJob(name, ...args) {
  if (!JOBS.has(name)) return Promise.reject(new Error(`not a git job: ${name}`));
  return new Promise((resolve, reject) => {
    const job = { name, args, resolve, reject };
    const w = thread();
    if (!w) { runHere(job); return; }
    const id = ++seq;
    waiting.set(id, job);
    w.ref();
    try {
      w.postMessage({ id, name, args });
    } catch (error) {
      // Arguments a thread cannot be handed (a function, say) run here.
      waiting.delete(id);
      if (!waiting.size) w.unref();
      runHere(job);
    }
  });
}
