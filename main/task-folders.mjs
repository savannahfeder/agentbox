// ONE FOLDER PER TASK, OWNED BY THE APP RATHER THAN BY THE AGENT IN IT.
//
// Between letting Claude Code make its own worktree and doing it ourselves, the
// app makes the folder for both agents. The two engines are not equal here. Claude Code has isolation built in
// (`--worktree`), makes the folder under `.claude/worktrees/`, locks it, reuses
// it by name and deletes it when it leaves nothing behind. Codex has none of
// that, only `--cd` for choosing where to work. So the rules have to live on
// our side for one engine whatever we do, and two mechanisms would be two sets
// of failures to test. This is the one mechanism, and it puts the folder
// exactly where Claude Code would, so a person who opens the repository in a
// terminal sees the layout they already know.
//
// WHAT WAS MEASURED, 2026-09-22. This repository had 25 leftover
// agent copies holding 26 GB: twelve with edits committed nowhere, twelve on
// branches never merged, one safe to delete. Isolation was a rule in the worker
// brief; the rule's first half (make a copy) was kept and its second half (fold
// it back, delete the copy) was not, because the fold only happens once she
// approves and approval rarely lands in the hour the session dies. Nothing in
// the app knew those folders existed, so nothing could ever show them to her.
//
// THE THREE RULES THAT MATTER, and the reason each one is not negotiable:
//
//   The name is the TASK, never the session. Her reply, live steering and
//   remote control all have to land where the work already is, and a session id
//   changes every time while a row id does not. It is also what keeps Claude
//   Code's transcript path stable, since that path is derived from the cwd.
//
//   A folder is deleted only when losing it costs nothing: clean, and its
//   branch already in main. Anything else is KEPT AND REPORTED. A folder kept
//   quietly is precisely what stranded twelve of hers.
//
//   A folder a live session stands in is never touched. `git worktree remove
//   --force` would happily pull the ground out from under a running agent, so
//   the lock carries the owning pid and a release from anyone else checks
//   whether that process is still alive.
//
// Branches are never deleted here. Every commit survives the folder, so the
// worst this can do is make somebody run `git worktree add` again.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { nameSlug } from '../shared/product-name.mjs';

/** Where Claude Code puts its own, so both engines and a human agree. */
const WORKTREES = ['.claude', 'worktrees'];

/** The branch prefix this repository already uses for agent work. */
const BRANCH_PREFIX = `${nameSlug}/`;

/** Ids are `w-` plus hex today. This is the guard for the day they are not. */
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const git = (cwd, args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

/** Git that answers rather than throws, for the questions where "no" is fine. */
function tryGit(cwd, args) {
  try { return { ok: true, out: git(cwd, args) }; }
  catch (error) { return { ok: false, out: String(error?.stderr ?? error?.message ?? '').trim() }; }
}

export function safeTaskName(id) {
  const name = String(id ?? '');
  if (!SAFE_NAME.test(name) || name.length > 64) {
    throw Error(`Not a name a task folder may be given: ${JSON.stringify(id)}`);
  }
  return name;
}

/**
 * Always through the real path. On a Mac `/tmp` and `/var` are symlinks into
 * `/private`, and git answers with the resolved spelling, so a folder made by
 * one spelling and looked for by the other is two different folders as far as
 * every comparison in the supervisor is concerned.
 */
export const real = (dir) => { try { return fs.realpathSync(dir); } catch { return dir; } };

export function taskFolderPath(repoPath, id) {
  return path.join(real(repoPath), ...WORKTREES, safeTaskName(id));
}

export function taskBranch(id) { return `${BRANCH_PREFIX}${safeTaskName(id)}`; }

/** The repository root, or null when this is not a checkout at all. */
export function repoRoot(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const found = tryGit(dir, ['rev-parse', '--show-toplevel']);
  return found.ok && found.out ? found.out : null;
}

/**
 * What a new folder starts from: LOCAL main, not the remote. Local main carries
 * whatever has not been pushed, and on this Mac that is routinely 20+ commits,
 * so branching from origin would start every task without the last day of work.
 */
export function baseRef(repoPath) {
  for (const name of ['main', 'master']) {
    if (tryGit(repoPath, ['rev-parse', '--verify', '-q', `refs/heads/${name}`]).ok) return `refs/heads/${name}`;
  }
  return 'HEAD';
}

const lockReason = (pid) => `agentbox pid=${pid}`;
const pidInReason = (reason) => {
  const found = /agentbox pid=(\d+)/.exec(reason ?? '');
  return found ? Number(found[1]) : null;
};
// Signal 0 asks the kernel whether a pid exists without touching it. EPERM
// means it exists and belongs to somebody else, which still counts as alive.
const alive = (pid) => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
};

/** Every worktree git knows about, as records rather than as text. */
function registered(repoPath) {
  const listed = tryGit(repoPath, ['worktree', 'list', '--porcelain']);
  if (!listed.ok) return [];
  const out = [];
  let current = null;
  for (const line of listed.out.split('\n')) {
    if (line.startsWith('worktree ')) { if (current) out.push(current); current = { path: line.slice(9) }; }
    else if (line.startsWith('branch ') && current) current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line.startsWith('locked') && current) current.lock = line.slice(6).trim();
    else if (line === 'prunable' && current) current.prunable = true;
  }
  if (current) out.push(current);
  return out;
}

const record = (repoPath, folder) => registered(repoPath).find((w) => w.path === folder) ?? null;

/**
 * The folder this task works in, made if it is not there yet. those
 * sessions keep running exactly where they ran before.
 */
export function ensureTaskFolder(dir, id, { pid = process.pid, dependencies = true } = {}) {
  const name = safeTaskName(id);
  const root = repoRoot(dir);
  if (!root) return null;
  const folder = taskFolderPath(root, name);
  const branch = taskBranch(name);

  if (fs.existsSync(folder) && record(root, folder)) {
    lock(root, folder, pid);
    return { path: folder, branch: record(root, folder)?.branch ?? branch, created: false };
  }

  // A registration whose directory somebody deleted by hand would refuse the
  // add below with "already registered", so clear those first. `prune` only
  // ever drops registrations whose folder is already gone.
  tryGit(root, ['worktree', 'prune']);
  fs.mkdirSync(path.dirname(folder), { recursive: true });

  hideFromTheCheckout(root);

  const branchExists = tryGit(root, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]).ok;
  const from = branchExists ? branch : baseRef(root);
  if (!cloneCheckout(root, folder, branch, from, branchExists)) {
    const add = branchExists
      ? tryGit(root, ['worktree', 'add', folder, branch])
      : tryGit(root, ['worktree', 'add', '-b', branch, folder, baseRef(root)]);
    if (!add.ok) throw Error(`Could not make a folder for ${name}: ${add.out}`);
    if (dependencies) cloneDependencies(root, folder);
  }

  lock(root, folder, pid);
  return { path: folder, branch, created: true };
}

/**
 * MAKING THE FOLDER WITHOUT PAYING FOR IT TWICE.
 *
 * Measured on her repository, 2026-09-22: a plain `git worktree add` takes 23
 * seconds and writes 960 MB, because 634 MB of this checkout is the archived
 * screenshots in `shots/` and no agent ever opens one. Twenty five of those
 * folders is most of the 26 GB she was carrying.
 *
 * So when the checkout beside us is already standing on the commit the folder
 * starts from, and is clean, the files are cloned from it instead: on APFS that
 * is a block-sharing clone, which measured 5 seconds and no measurable disk at
 * all for the same folder. `--no-checkout` leaves the index empty, so a `reset`
 * fills it in from the commit without writing a single file.
 *
 * IT IS CHECKED RATHER THAN TRUSTED. If the result is not identical to the
 * commit, down to an empty `git status`, the folder is thrown away and the
 * ordinary checkout runs. A fast folder that is subtly not the code would be
 * far worse than a slow one.
 */
function cloneCheckout(root, folder, branch, from, branchExists) {
  // TRACKED CONTENT ONLY, on both sides of this. Her checkout permanently
  // carries a couple of untracked files (a scratch `:memory:.ses`, a folder of
  // screenshots somebody left), and counting those as dirty turned the fast
  // path off on the one repository it was written for: measured 2026-09-22,
  // 979 MB and 7 seconds for a folder that should have cost neither. Untracked
  // files ride along into the new folder, which is what a worker wants anyway.
  const head = tryGit(root, ['rev-parse', 'HEAD']);
  const target = tryGit(root, ['rev-parse', from]);
  const clean = tryGit(root, ['status', '--porcelain', '--untracked-files=no']);
  if (!head.ok || !target.ok || head.out !== target.out) return false;
  if (!clean.ok || clean.out.length > 0) return false;

  const add = branchExists
    ? tryGit(root, ['worktree', 'add', '--no-checkout', folder, branch])
    : tryGit(root, ['worktree', 'add', '--no-checkout', '-b', branch, folder, from]);
  if (!add.ok) return false;

  try {
    for (const entry of fs.readdirSync(root)) {
      if (entry === '.git' || entry === WORKTREES[0]) continue;
      execFileSync('cp', ['-c', '-R', path.join(root, entry), folder], { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    if (!tryGit(folder, ['reset', '-q', 'HEAD']).ok) throw Error('the index would not fill in');
    const after = tryGit(folder, ['status', '--porcelain', '--untracked-files=no']);
    if (!after.ok || after.out.length > 0) throw Error('the clone did not match the commit');
    return true;
  } catch {
    // Back to nothing, so the ordinary path starts from a clean sheet.
    tryGit(root, ['worktree', 'remove', '--force', folder]);
    try { fs.rmSync(folder, { recursive: true, force: true }); } catch { /* already gone */ }
    tryGit(root, ['worktree', 'prune']);
    return false;
  }
}

/**
 * Task folders live inside the repository, where the checkout would otherwise
 * report them as untracked and every review card built in the shared checkout
 * would carry them. `.git/info/exclude` rather than `.gitignore`, because this
 * is a fact about this machine and not a line to commit into her project.
 */
function hideFromTheCheckout(root) {
  const line = `${WORKTREES.join('/')}/`;
  const gitDir = tryGit(root, ['rev-parse', '--git-common-dir']);
  if (!gitDir.ok) return;
  const file = path.resolve(root, gitDir.out, 'info', 'exclude');
  try {
    const held = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (held.split('\n').includes(line)) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${held}${held.endsWith('\n') || held === '' ? '' : '\n'}${line}\n`);
  } catch { /* an unwritable git dir is not a reason to refuse the folder */ }
}

/**
 * Dependencies, cloned rather than copied. Measured 2026-09-22: `cp -c` of this
 * repository's 929 MB node_modules took 2.9 seconds and moved the volume's free
 * space by nothing at all, because APFS shares the blocks until something
 * writes. A plain copy is a minute and a real gigabyte, which is most of what
 * the 26 GB on her Mac was. Failure here is never fatal: the folder is still a
 * good folder, it just has to install for itself.
 */
function cloneDependencies(root, folder) {
  const from = path.join(root, 'node_modules');
  const to = path.join(folder, 'node_modules');
  if (!fs.existsSync(from) || fs.existsSync(to)) return false;
  try {
    execFileSync('cp', ['-c', '-R', from, to], { stdio: ['ignore', 'ignore', 'pipe'] });
    return true;
  } catch {
    try { fs.rmSync(to, { recursive: true, force: true }); } catch { /* nothing to undo */ }
    return false;
  }
}

function lock(root, folder, pid) {
  const held = record(root, folder)?.lock;
  if (held !== undefined && pidInReason(held) !== pid) return;
  if (held === undefined) tryGit(root, ['worktree', 'lock', '--reason', lockReason(pid), folder]);
}

/** Is there anything in here that deleting the folder would lose? */
export function folderState(root, folder) {
  const status = tryGit(folder, ['status', '--porcelain']);
  const dirty = !status.ok || status.out.length > 0;
  const head = tryGit(folder, ['rev-parse', 'HEAD']);
  const merged = head.ok
    && tryGit(root, ['merge-base', '--is-ancestor', head.out, baseRef(root)]).ok;
  return { dirty, merged };
}

/**
 * Give the folder back when the session is done with it. Removal is the rare
 * case on purpose: it happens when the work is already in main and nothing is
 * uncommitted. Every other answer names what is in the way, so the app can say
 * it rather than leave another invisible folder on her disk.
 */
export function releaseTaskFolder(dir, id, { pid = process.pid } = {}) {
  const name = safeTaskName(id);
  const root = repoRoot(dir);
  if (!root) return { removed: false, reason: 'no-repo' };
  const folder = taskFolderPath(root, name);
  if (!fs.existsSync(folder)) return { removed: false, reason: 'gone' };

  const holder = pidInReason(record(root, folder)?.lock);
  if (holder && holder !== pid && alive(holder)) return { removed: false, reason: 'held', path: folder };

  const { dirty, merged } = folderState(root, folder);
  if (dirty) return { removed: false, reason: 'uncommitted', path: folder };
  if (!merged) return { removed: false, reason: 'unmerged', path: folder };

  tryGit(root, ['worktree', 'unlock', folder]);
  // No --force: git refuses a second time if anything is uncommitted, which is
  // the belt under this braces.
  const removed = tryGit(root, ['worktree', 'remove', folder]);
  if (!removed.ok) return { removed: false, reason: 'refused', path: folder, detail: removed.out };
  return { removed: true, reason: 'merged', path: folder };
}

/** The subject line that marks a commit as work parked rather than finished. */
export const PARKED = 'Parked when the task was closed';

/**
 * CLOSING A TASK PARKS ITS FOLDER, AND PARKING LOSES NOTHING.
 *
 * A closed row's folder is worth reclaiming, but a row can be closed by
 * accident, and a row closed on the understanding that it can be picked up
 * again later is not really finished with its code.
 *
 * The obvious answer is a window before deletion, and a window is the wrong
 * shape. A
 * timer deletes work while she is not looking, which is the exact outcome it
 * exists to prevent, and it has to be tuned against a case she calls a rarity.
 * What actually makes a folder disposable is that nothing in it exists only
 * there: the branch holds every commit. So the only thing at risk is what an
 * agent left uncommitted, and the answer is to commit that before letting go.
 *
 * Parking therefore means: commit whatever is uncommitted onto the task's own
 * branch, then remove the folder. `restoreTaskFolder` undoes that commit, so a
 * reopened task comes back to the files it left, staged exactly as they were.
 * The branch is never deleted, by this or by anything else in this file, so an
 * accidental close costs the ten seconds it takes to make the folder again.
 *
 * WHAT IT DOES NOT KEEP, said plainly: files git is told to ignore. Dependencies
 * are cloned fresh on the way back, which is most of them, but a `.env` an agent
 * wrote itself goes. That is the same boundary as removing any worktree, and the
 * alternative is committing secrets onto a branch.
 */
export function parkTaskFolder(dir, id, { pid = process.pid } = {}) {
  const name = safeTaskName(id);
  const root = repoRoot(dir);
  if (!root) return { parked: false, reason: 'no-repo' };
  const folder = taskFolderPath(root, name);
  if (!fs.existsSync(folder)) return { parked: false, reason: 'gone' };

  const holder = pidInReason(record(root, folder)?.lock);
  if (holder && holder !== pid && alive(holder)) return { parked: false, reason: 'held', path: folder };

  const { dirty } = folderState(root, folder);
  let kept = 'nothing uncommitted';
  if (dirty) {
    const staged = tryGit(folder, ['add', '-A']);
    // `--no-verify`, because a repository's own commit hooks are written for a
    // person finishing a piece of work, and this is the app tidying up after
    // one. A hook that refuses here would strand the folder it is protecting.
    const held = tryGit(folder, ['commit', '--no-verify', '-q', '-m', PARKED]);
    if (!staged.ok || !held.ok) return { parked: false, reason: 'refused', path: folder, detail: held.out };
    kept = 'work in progress';
  }

  tryGit(root, ['worktree', 'unlock', folder]);
  const removed = tryGit(root, ['worktree', 'remove', folder]);
  if (!removed.ok) return { parked: false, reason: 'refused', path: folder, detail: removed.out };
  return { parked: true, kept, path: folder };
}

/**
 * The way back. Makes the folder again off the branch, and when the last commit
 * on it is a parked one, takes that commit apart so the work is uncommitted
 * exactly as it was. Undoing it rather than leaving it is what stops a row she
 * opens and closes five times from growing five commits nobody wrote.
 */
export function restoreTaskFolder(dir, id, { pid = process.pid } = {}) {
  const made = ensureTaskFolder(dir, id, { pid });
  if (!made) return null;
  const last = tryGit(made.path, ['log', '-1', '--format=%s']);
  if (last.ok && last.out === PARKED) tryGit(made.path, ['reset', '-q', 'HEAD~1']);
  return made;
}

/**
 * Every task folder in this repository and what would be lost by deleting it.
 * This is what the app reads to show her a folder that is holding work, which
 * is the half that did not exist: hers held 26 GB and she had never seen one.
 */
export function listTaskFolders(dir) {
  const root = repoRoot(dir);
  if (!root) return [];
  const home = path.join(root, ...WORKTREES);
  return registered(root)
    .filter((w) => path.dirname(w.path) === home && !w.prunable)
    .map((w) => {
      const { dirty, merged } = folderState(root, w.path);
      let touchedAt = null;
      try { touchedAt = fs.statSync(w.path).mtimeMs; } catch { /* it can vanish under us */ }
      const holder = pidInReason(w.lock);
      return {
        id: path.basename(w.path),
        path: w.path,
        branch: w.branch ?? '',
        dirty,
        merged,
        touchedAt,
        heldBy: holder && alive(holder) ? holder : null,
      };
    });
}
