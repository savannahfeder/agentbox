// THE OTHER END OF main/task-folders-offthread.mjs. One job at a time, in the
// order they were posted, which is what keeps two git commands from fighting
// over the same repository's lock files.
import { parentPort } from 'node:worker_threads';
import * as folders from './task-folders.mjs';

parentPort.on('message', ({ id, name, args }) => {
  try {
    parentPort.postMessage({ id, ok: true, value: folders[name](...args) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: String(error?.message ?? error) });
  }
});
