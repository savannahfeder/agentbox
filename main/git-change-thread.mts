// THE OTHER END OF main/git-change-offthread.mts. One job at a time, in order.
import { parentPort } from 'node:worker_threads';
import * as git from './git-change.mjs';
import { saveRunChange } from './run-change.mts';

const jobs = { ...git, saveRunChange } as unknown as Record<string, (...args: unknown[]) => unknown>;

parentPort!.on('message', ({ id, name, args }: { id: number; name: string; args: unknown[] }) => {
  try {
    parentPort!.postMessage({ id, ok: true, value: jobs[name](...args) });
  } catch (error) {
    parentPort!.postMessage({ id, ok: false, error: String((error as { message?: unknown } | null)?.message ?? error) });
  }
});
