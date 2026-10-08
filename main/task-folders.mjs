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

/** What an unfinished folder is called. A task name may never start with a dot. */
const BUILDING = '.building-';

const git = (cwd, args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

/** Git that answers rather than throws, for the questions where "no" is fine. */
function tryGit(cwd, args) {
  try { return { ok: true, out: git(cwd, args) }; }
  catch (error) { return { ok: false, out: String(error?.stderr ?? error?.message ?? '').trim() }; }
}

/** `safeTaskName`'s question, asked of a folder already on the disk without throwing. */
const couldBeATaskName = (name) => SAFE_NAME.test(name) && String(name).length <= 64;

export function safeTaskName(id) {
  const name = String(id ?? '');
  if (!couldBeATaskName(name)) {
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

/**
 * WHERE A FOLDER IS BUILT, WHICH IS NEVER WHERE IT IS RUN IN.
 *
 * Making one is a worktree plus a block clone of the checkout. It used to be
 * built AT the path a session runs in, so for the whole of that a directory sat
 * there, registered with git and holding almost none of the code. MEASURED on
 * astral-video, the repository this happened in, 2026-10-01: the build takes 115
 * seconds now that the checkout is 14 GB, and the path a session runs in
 * appeared 2.7 seconds in. That is 112 seconds of a folder that looked ready and
 * was not, against a supervisor tick of fifteen seconds, so seven ticks could
 * read it. Everything that asks whether a row's folder is ready asks the disk,
 * which means for those 112 seconds every one of them said yes:
 * the supervisor started a session in a half written folder, and when the build
 * finished it started a second session on the same row (2026-09-30,
 * w-4d722ecf92, where the second one's claim came back refused and the first
 * one's folder was deleted under it a minute in).
 *
 * Built here and MOVED into place once it is finished and checked, so a
 * directory at the real path means a folder that is complete. That makes every
 * existing question correct without any of them learning a new one, and it
 * leaves the rollback below nothing to delete but its own unfinished copy.
 */
export function buildingFolderPath(repoPath, id) {
  return path.join(real(repoPath), ...WORKTREES, `${BUILDING}${safeTaskName(id)}`);
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

  // EVERY STEP BELOW HAPPENS SOMEWHERE ELSE, and the folder appears at its own
  // path in one move at the end. `buildingFolderPath` is why. A build the app
  // died in the middle of leaves an unfinished copy there, which nobody wants
  // and which would refuse the next attempt, so it goes first.
  const staging = buildingFolderPath(root, name);
  clearUnfinished(root, staging);

  const branchExists = tryGit(root, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]).ok;
  const from = branchExists ? branch : baseRef(root);
  if (!cloneCheckout(root, staging, branch, from, branchExists)) {
    // The fast path may have created the branch and then failed the copy.
    // The branch stays: this file never deletes one. The slow path uses it
    // when it is already there, which is what `worktree add -b` would refuse.
    const existsNow = tryGit(root, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]).ok;
    const add = existsNow
      ? tryGit(root, ['worktree', 'add', staging, branch])
      : tryGit(root, ['worktree', 'add', '-b', branch, staging, baseRef(root)]);
    if (!add.ok) throw Error(`Could not make a folder for ${name}: ${add.out}`);
    if (dependencies) cloneDependencies(root, staging);
  }

  // `worktree move` rather than a rename, so git's own record of where this
  // worktree lives moves with it. It refuses if anything is already at the
  // destination, which is the last guard against walking over a live folder.
  const moved = tryGit(root, ['worktree', 'move', staging, folder]);
  if (!moved.ok) {
    clearUnfinished(root, staging);
    throw Error(`Could not make a folder for ${name}: ${moved.out}`);
  }

  lock(root, folder, pid);
  return { path: folder, branch, created: true };
}

/**
 * Throw away an unfinished copy. Nothing is ever lost here: a staging folder
 * has never been handed to anybody, so the most it can hold is a checkout that
 * did not finish. The branch is left alone, as everywhere else in this file.
 */
function clearUnfinished(root, staging) {
  if (!fs.existsSync(staging) && !record(root, staging)) return;
  tryGit(root, ['worktree', 'remove', '--force', staging]);
  try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* already gone */ }
  tryGit(root, ['worktree', 'prune']);
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
 *
 * THE COPY IS THE PLATFORM'S OWN CLONE. macOS `cp -c` is APFS clonefile.
 * GNU `cp -a --reflink=auto` shares blocks where the filesystem can and
 * copies where it cannot. `-c` is not an option there, and a copy that
 * failed used to leave the branch the fast path had just created, so the
 * ordinary checkout then died with "a branch named … already exists".
 */
function copyTree(from, to) {
  const args = process.platform === 'darwin'
    ? ['-c', '-R', from, to]
    : ['-a', '--reflink=auto', from, to];
  execFileSync('cp', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

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
      copyTree(path.join(root, entry), folder);
    }
    if (!tryGit(folder, ['reset', '-q', 'HEAD']).ok) throw Error('the index would not fill in');
    const after = tryGit(folder, ['status', '--porcelain', '--untracked-files=no']);
    if (!after.ok || after.out.length > 0) throw Error('the clone did not match the commit');
    return true;
  } catch {
    // Back to nothing, so the ordinary path starts from a clean sheet. What is
    // thrown away here is the UNFINISHED COPY and never a folder anybody is in:
    // `folder` is the staging path, which no session has ever been given. It
    // used to be the real one, and a `remove --force` of that is how a running
    // agent lost the ground under it.
    clearUnfinished(root, folder);
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
    copyTree(from, to);
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
 * THE FOLDER A CALL IS ABOUT IS THE ONE IT WAS HANDED, NEVER ONE REBUILT FROM A
 * BASENAME (w-330eea6c66).
 *
 * `releaseTaskFolder` and `parkTaskFolder` used to take a task id and work out
 * `.claude/worktrees/<id>` from it. That is correct while the only caller is a
 * row's own session, and it is the bug the moment anything passes on a folder it
 * found: the sweep walks a list of folders, and a stray whose basename happened
 * to read like a task id would have had the app committing in, and deleting,
 * whatever sat at the reconstructed path instead.
 *
 * So a caller holding a path says so, and a path that is not this task's own
 * folder is refused rather than quietly swapped for one. Called with no path at
 * all it answers exactly as it always did, which is every ordinary call.
 */
function ownFolder(root, name, given) {
  const mine = taskFolderPath(root, name);
  if (given === null || given === undefined) return mine;
  return real(given) === mine ? mine : null;
}

/**
 * Give the folder back when the session is done with it. Removal is the rare
 * case on purpose: it happens when the work is already in main and nothing is
 * uncommitted. Every other answer names what is in the way, so the app can say
 * it rather than leave another invisible folder on her disk.
 */
export function releaseTaskFolder(dir, id, { pid = process.pid, path: given = null } = {}) {
  const name = safeTaskName(id);
  const root = repoRoot(dir);
  if (!root) return { removed: false, reason: 'no-repo' };
  const folder = ownFolder(root, name, given);
  if (!folder) return { removed: false, reason: 'not-ours', path: given };
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
export function parkTaskFolder(dir, id, { pid = process.pid, path: given = null } = {}) {
  const name = safeTaskName(id);
  const root = repoRoot(dir);
  if (!root) return { parked: false, reason: 'no-repo' };
  // `ownFolder`, and never the basename of whatever we were pointed at: parking
  // commits and then removes, so being wrong here costs somebody their folder.
  const folder = ownFolder(root, name, given);
  if (!folder) return { parked: false, reason: 'not-ours', path: given };
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
 * EVERY COPY OF THIS PROJECT ON THE DISK, WHOEVER MADE IT. INVENTORY, NOT
 * OWNERSHIP, AND THE TWO BEING ONE QUESTION IS WHAT STRANDED 740 MB.
 *
 * MEASURED 2026-10-07 (w-5952e6de3e). Thirteen worktrees of this repository
 * existed outside `.claude/worktrees/`: nine beside the checkout as
 * `agentbox-team-<name>`, one under `/private/tmp`, one as `wt-<task id>`. About
 * 740 MB of tracked files, every one made by hand by some session rather than by
 * the app. `listTaskFolders` filtered on the folder's parent being the app's own
 * home, so not one of them could be listed, shown or swept: the same
 * invisibility that stranded 26 GB on 2026-09-22, in a new place. One of them had
 * `node_modules` symlinked back to the shared checkout, so an `npm install`
 * inside it rewrote every other folder's dependencies.
 *
 * AND WIDENING THAT FILTER WOULD HAVE BEEN WORSE THAN THE BUG, which is why this
 * is a second question rather than a looser version of the first one. The
 * supervisor feeds the list into automatic parking, and parking rebuilt
 * `.claude/worktrees/<id>` out of the folder's BASENAME rather than using the
 * path it was handed. A folder nobody's row owns passes every eligibility check
 * parking has, so a wider list would have had the app committing to a branch it
 * invented and deleting a folder somebody made on purpose.
 *
 * So: this answers what is there, and `ours` answers what the app may act on.
 * Only the second is ever parked or removed, and the first is what lets a person
 * see what is holding their disk.
 *
 * `ours` IS PROOF BY LOCATION, and the location is the app's own. Nothing but
 * `ensureTaskFolder` puts a folder at `<primary>/.claude/worktrees/<task name>`,
 * so a folder there was made here. It is deliberately not inferred from the lock
 * (dropped on the way to every removal) or from a marker file (which an agent
 * working in the folder could delete, turning a folder the app made into one it
 * will never reclaim).
 */
export function inventoryWorktrees(dir) {
  const root = repoRoot(dir);
  if (!root) return [];
  const list = registered(root);
  // GIT LISTS THE MAIN WORKTREE FIRST, and the home hangs off that one rather
  // than off whichever folder we were asked from: `rev-parse --show-toplevel`
  // inside a linked worktree answers with that worktree, so deriving the home
  // from it would call every real task folder a stray.
  const primary = real(list[0]?.path ?? root);
  const home = path.join(primary, ...WORKTREES);
  return list.map((w) => {
    const at = real(w.path);
    const name = path.basename(at);
    const unfinished = name.startsWith(BUILDING);
    const missing = !fs.existsSync(at);
    const holder = pidInReason(w.lock);
    return {
      path: at,
      // What the registration spells it, which on a Mac can be the other side of
      // a symlink: `/tmp/x` against `/private/tmp/x`.
      registeredAs: w.path,
      primary: at === primary,
      branch: w.branch ?? '',
      lock: w.lock ?? null,
      heldBy: holder && alive(holder) ? holder : null,
      // A folder still being built is the app's and is wanted by nobody: it has
      // no row standing in it, so it may never be listed, shown or swept.
      unfinished,
      missing,
      prunable: !!w.prunable,
      // WHERE THE APP PUTS ITS OWN, whether or not anything is there now. Kept
      // apart from `ours` because a registration whose folder has gone is still
      // the app's bookkeeping to tidy, and is nothing anybody may act on.
      atOurPath: path.dirname(at) === home && couldBeATaskName(name),
      ours: !unfinished && !missing && !w.prunable
        && path.dirname(at) === home && couldBeATaskName(name),
    };
  });
}

/**
 * Copies of this project the app did not make, so a person can see what is
 * holding their disk. The checkout itself is not one of them, and neither is a
 * registration pointing at nothing: that is a different fact with its own field
 * and its own answer, `pruneMissingWorktrees`.
 */
export function strayWorktrees(dir) {
  return inventoryWorktrees(dir)
    .filter((w) => !w.primary && !w.ours && !w.unfinished && !w.missing && !w.prunable);
}

/**
 * REGISTRATIONS POINTING AT NOTHING, DROPPED. One of the thirteen lived under
 * `/private/tmp`, which macOS may purge from under it, and git goes on holding
 * the registration: that is what refuses the next `worktree add` at that path
 * with "already registered".
 *
 * Nothing can be lost here, by git's own definition of `prune`: it only ever
 * drops the bookkeeping for a worktree whose directory is already gone, and the
 * branch it stood on survives, as every branch survives everything in this file.
 * A folder of OURS is unlocked first, because `prune` skips a locked worktree and
 * the app locks every folder it makes, which would otherwise leave the
 * registration of a deleted folder wedged there forever.
 */
export function pruneMissingWorktrees(dir) {
  const root = repoRoot(dir);
  if (!root) return [];
  const gone = inventoryWorktrees(dir).filter((w) => !w.primary && (w.missing || w.prunable));
  if (!gone.length) return [];
  for (const w of gone) if (w.atOurPath) tryGit(root, ['worktree', 'unlock', w.path]);
  tryGit(root, ['worktree', 'prune']);
  const left = new Set(inventoryWorktrees(dir).map((w) => w.path));
  return gone.map((w) => w.path).filter((at) => !left.has(at));
}

/**
 * Every task folder in this repository and what would be lost by deleting it.
 * This is what the app reads to show her a folder that is holding work, which
 * is the half that did not exist: hers held 26 GB and she had never seen one.
 *
 * THE OWNERSHIP VIEW, and the only list anything automatic is allowed to act on.
 * `inventoryWorktrees` above is the wider one, and the comment there is why they
 * are not the same list.
 */
export function listTaskFolders(dir) {
  const root = repoRoot(dir);
  if (!root) return [];
  return inventoryWorktrees(dir)
    .filter((w) => w.ours)
    .map((w) => {
      const { dirty, merged } = folderState(root, w.path);
      let touchedAt = null;
      try { touchedAt = fs.statSync(w.path).mtimeMs; } catch { /* it can vanish under us */ }
      return {
        id: path.basename(w.path),
        path: w.path,
        branch: w.branch,
        dirty,
        merged,
        touchedAt,
        heldBy: w.heldBy,
      };
    });
}
