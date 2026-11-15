// THE OTHER END OF main/task-folders-offthread.mts, one per lane. That side
// sends a thread one job at a time and never two jobs for the same folder at once.
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
