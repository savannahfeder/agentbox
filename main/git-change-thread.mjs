// THE OTHER END OF main/git-change-offthread.mjs. One job at a time, in order.
import { parentPort } from 'node:worker_threads';
import * as change from './git-change.mjs';

parentPort.on('message', ({ id, name, args }) => {
  try {
    parentPort.postMessage({ id, ok: true, value: change[name](...args) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: String(error?.message ?? error) });
  }
});
