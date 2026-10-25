// WHAT A RUN CHANGED: the checkout read back against its photograph, then the
// change file written. Git commands and a whole transcript, so it runs on the
// git thread (main/git-change-offthread.mjs), not on the app's main thread.
import { changeFromRepo } from './git-change.mjs';
import { writeChangeForRun } from './code-change.mjs';

export function saveRunChange({ repoBefore = null, ...run }) {
  let repos = [];
  try {
    if (repoBefore) repos = [changeFromRepo(repoBefore)];
  } catch (e) { console.warn('zero: could not read the repository back:', e.message); }
  return writeChangeForRun({ ...run, repos });
}
