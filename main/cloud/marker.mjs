// "A CLOUD RUN'S WORK IS STILL ON ITS WAY BACK TO THIS FOLDER."
//
// A cloud run (docs/cloud/PLAN.md) commits in the sandbox, and the commits
// reach the task folder only when the run is over. Until then the folder's
// branch is stale, and two things in the app would act on it as if it were
// not: the ship queue (a worker adds `ship` BEFORE it exits, and "there is
// nothing to ship" counts as shipped) and the folder cleaner (a clean, merged
// folder is removed). This record is what both of them check.
//
// It lives in the folder's own git directory, not in the working tree, so no
// commit, park or `git clean` can carry it off or delete it, and it names the
// run, so a later run in the same folder can bring that run's work home first.
import fs from 'node:fs';
import path from 'node:path';

const NAME = 'agentbox-cloud.json';

// Read off the folder's `.git` rather than asked of `git rev-parse`: this runs
// for every task folder on the app's main process and at every marker read in
// the relay all cloud runs share, and a busy Mac takes half a second to start git.
export function gitDirOf(folder) {
  if (!folder) return null;
  for (let dir = path.resolve(folder); ; dir = path.dirname(dir)) {
    const dotGit = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(dotGit); } catch { /* not here */ }
    if (st?.isDirectory() && fs.existsSync(path.join(dotGit, 'HEAD'))) return dotGit;
    if (st?.isFile()) {
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'));
      const linked = m && path.resolve(dir, m[1]);
      return linked && fs.existsSync(linked) ? linked : null;
    }
    if (path.dirname(dir) === dir) return null;
  }
}

// The main repository's git directory, which a linked worktree's names in `commondir`.
export function commonGitDirOf(folder) {
  const dir = gitDirOf(folder);
  if (!dir) return null;
  try { return path.resolve(dir, fs.readFileSync(path.join(dir, 'commondir'), 'utf8').trim()); } catch { return dir; }
}

// `folder` is a task folder, or `{ folder, file }` for a project with no
// repository: its threads share one documents folder, so each keeps its own
// marker at `file` (Supervisor#_plainMarker).
export function markerPath(folder) {
  if (folder && typeof folder === 'object') return folder.file || null;
  const dir = gitDirOf(folder);
  return dir ? path.join(dir, NAME) : null;
}

export function readMarker(folder) {
  const file = markerPath(folder);
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function writeMarker(folder, record) {
  const file = markerPath(folder);
  if (!file) throw new Error(`${folder} is not a git folder`);
  if (typeof folder === 'object') fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...record, at: Date.now() }, null, 2));
  fs.renameSync(tmp, file);
}

export function clearMarker(folder) {
  const file = markerPath(folder);
  if (file) fs.rmSync(file, { force: true });
}

// The one question the ship queue and the folder cleaner ask. A folder that
// is not there, or not a git folder, has nothing pending.
export function cloudWorkPending(folder) {
  if (folder && typeof folder === 'object') return !!folder.file && !!readMarker(folder);
  if (!folder || !fs.existsSync(folder)) return false;
  return !!readMarker(folder);
}

// WHAT A RUN BROUGHT HOME THAT ITS ROW MUST SAY (main/cloud/run.mjs `park`):
// written by the relay, which cannot reach the store, and said by the
// supervisor (`_sayCloudNews`). Beside the marker, and outliving it.
const NEWS = 'agentbox-cloud-news.json';
const newsPath = (folder) => { const dir = gitDirOf(folder); return dir ? path.join(dir, NEWS) : null; };

export function addCloudNews(folder, news) {
  const file = newsPath(folder);
  if (!file) return;
  let all = [];
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...(Array.isArray(all) ? all : []), { ...news, at: Date.now() }], null, 2));
  fs.renameSync(tmp, file);
}

export function takeCloudNews(folder) {
  const file = folder && fs.existsSync(folder) ? newsPath(folder) : null;
  if (!file || !fs.existsSync(file)) return [];
  let all = [];
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* unreadable: dropped */ }
  fs.rmSync(file, { force: true });
  return Array.isArray(all) ? all : [];
}
