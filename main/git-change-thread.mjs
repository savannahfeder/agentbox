// THE OTHER END OF main/git-change-offthread.mjs. One job at a time, in order.
import { parentPort } from 'node:worker_threads';
import * as git from './git-change.mjs';
import { saveRunChange } from './run-change.mjs';

const jobs = { ...git, saveRunChange };

parentPort.on('message', ({ id, name, args }) => {
  try {
    parentPort.postMessage({ id, ok: true, value: jobs[name](...args) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: String(error?.message ?? error) });
  }
});
