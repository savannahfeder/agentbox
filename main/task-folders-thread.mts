// THE OTHER END OF main/task-folders-offthread.mts. One job at a time, in the
// order they were posted, which is what keeps two git commands from fighting
// over the same repository's lock files.
import { parentPort } from 'node:worker_threads';
import * as folders from './task-folders.mts';
import type { FolderJobName } from './task-folders-offthread.mts';

parentPort!.on('message', ({ id, name, args }: { id: number; name: FolderJobName; args: unknown[] }) => {
  try {
    parentPort!.postMessage({ id, ok: true, value: (folders[name] as (...args: unknown[]) => unknown)(...args) });
  } catch (error) {
    parentPort!.postMessage({ id, ok: false, error: String((error as Error)?.message ?? error) });
  }
});
