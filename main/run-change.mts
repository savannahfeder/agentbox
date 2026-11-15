// WHAT A RUN CHANGED: the checkout read back against its photograph, then the
// change file written. Git commands and a whole transcript, so it runs on the
// git thread (main/git-change-offthread.mts), not on the app's main thread.
import { changeFromRepo } from './git-change.mts';
import { writeChangeForRun } from './code-change.mts';

export interface RunChangeInput {
  repoBefore?: Parameters<typeof changeFromRepo>[0] | null;
  transcript?: string;
  docsDir?: string;
  itemId?: string;
  roots?: string[];
  since?: number;
  change?: unknown;
}

export function saveRunChange({ repoBefore = null, ...run }: RunChangeInput) {
  let repos: ReturnType<typeof changeFromRepo>[] = [];
  try {
    if (repoBefore) repos = [changeFromRepo(repoBefore)];
  } catch (e) { console.warn('zero: could not read the repository back:', (e as Error).message); }
  return writeChangeForRun({ ...run, repos } as Parameters<typeof writeChangeForRun>[0]);
}
