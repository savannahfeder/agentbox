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
// WHICH MEANS THE FOLDER HAS AN OWNER, AND TAKING IT IS AN ANSWER (2026-10-07).
// It used to be a side effect that could not fail: `lock` only wrote a lock
// when there was none, so the folder a restarted app picked up still named the
// pid of the app that had exited, and anybody reading that lock found a dead
// owner and was free to delete the folder a live agent was standing in. A live
// FOREIGN lock did not stop reuse either, so two app processes over one
// checkout — one from the app folder, one from a checkout, which happens here
// daily — both got the same folder and both were told it was theirs.
//
// So `acquireTaskFolder` answers: taken, or refused and by whom. Taking over a
// lock whose owner is gone is a deliberate step that WRITES the new owner. A
// lock somebody put on by hand carries no pid of ours and is nobody's to take.
// The half-built copy at `.building-<id>` carries the same ownership, so one
// app's build is never swept away by the other's.
//
// AND THE FOLDER IS THE COMMIT PLUS WHAT THE REPOSITORY ASKED FOR (2026-10-07,
// w-5952e6de3e). A worktree holds tracked content and nothing else, so every
// file a repository needs and git does not track was missing: measured that day,
// five of the seven task folders then live had no `zero.config.json`, the app's
// own config, and ran on fallback defaults. The list of local files to carry is
// `.worktreeinclude` at the repository root, read by `main/worktree-include.mjs`,
// which is the same file Conductor and Claude Code read for the same purpose.
//
// Branches are never deleted here. Every commit survives the folder, so the
// worst this can do is make somebody run `git worktree add` again.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { nameSlug } from '../shared/product-name.mjs';
import { carryLocalFiles, copyTree, onlyTrackedContent, trackedTopLevel } from './worktree-include.mjs';

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

/**
 * What is in a directory. One we cannot even read is reported as holding
 * something, because the only decision taken on this answer is whether the
 * directory is safe to delete, and "we could not look" is not a yes.
 */
function tryRead(dir) {
  try { return fs.readdirSync(dir); } catch { return ['we could not look']; }
}

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
 * WHO HOLDS THIS FOLDER, which is the one question every answer here is built
 * on. Four answers and they are not the same shape:
 *
 *   no lock at all           free, and whoever asks may write their own
 *   our own pid              already ours
 *   a lock with no pid of    SOMEBODY ELSE'S, for good: a person who ran
 *   ours in it               `git worktree lock` meant it, and there is no
 *                            process to find dead
 *   another pid, alive       theirs while it lives
 *   another pid, gone        free, but only through a takeover that writes
 *                            the new owner (`stale`)
 */
function holder(root, folder, pid) {
  const held = record(root, folder)?.lock;
  if (held === undefined) return { ok: true, heldBy: null, free: true };
  const owner = pidInReason(held);
  if (owner === pid) return { ok: true, heldBy: pid };
  if (owner === null) return { ok: false, reason: 'locked', heldBy: null };
  if (alive(owner)) return { ok: false, reason: 'held', heldBy: owner };
  return { ok: true, heldBy: owner, stale: true };
}

/**
 * TAKE THE FOLDER, OR SAY WHO HAS IT. Never a side effect: the caller gets
 * `taken` either way, and a refusal names the process in the way.
 *
 * A takeover writes the new owner, because the pid in that lock is the whole
 * of the protection `releaseTaskFolder` and `parkTaskFolder` have. It is read
 * back afterwards rather than assumed: `git worktree unlock` and `lock` are two
 * commands, so two processes taking over the same dead owner's folder at the
 * same moment is possible, and the one that did not end up in the lock has to
 * hear that it did not get the folder.
 */
export function acquireTaskFolder(root, folder, { pid = process.pid } = {}) {
  const held = holder(root, folder, pid);
  if (!held.ok) return { taken: false, reason: held.reason, heldBy: held.heldBy };
  if (!held.free && !held.stale) return { taken: true, heldBy: pid };

  if (held.stale) tryGit(root, ['worktree', 'unlock', folder]);
  tryGit(root, ['worktree', 'lock', '--reason', lockReason(pid), folder]);

  const after = record(root, folder)?.lock;
  const now = pidInReason(after);
  if (now === pid) return { taken: true, heldBy: pid };
  if (after === undefined) return { taken: false, reason: 'refused', heldBy: null };
  return { taken: false, reason: now ? 'held' : 'locked', heldBy: now ?? null };
}

/**
 * The folder this task works in, TAKEN by this process, and made if it is not
 * there yet. Either `{ taken: true, path, branch, created, heldBy }`, or
 * `{ taken: false, reason, heldBy, path: null }` when somebody else has it:
 *
 *   held         another live process is working in it
 *   building     another live process is part way through making it
 *   locked       a person locked it by hand, so it is not ours to take
 *   in-the-way   something that is not a task folder sits at that path
 *
 * `path: null` on every refusal, because there is no folder the asker may work
 * in and a caller reaching for `.path` should get nothing rather than the
 * folder somebody else is standing in.
 *
 * `how` SAYS WHICH OF THE TWO WAYS MADE IT: `clone` for the block-sharing copy,
 * `checkout` for the ordinary one, `kept` for a folder that was already there.
 * It is reported because the two ways are not equally good and a test that only
 * checks the RESULT cannot tell them apart: the clone could break for good and
 * every assertion about the folder's contents would still pass. Codex made that
 * point reviewing this file on 2026-10-07 and it was right.
 */
export function ensureTaskFolder(dir, id, { pid = process.pid, dependencies = true } = {}) {
  const name = safeTaskName(id);
  const root = repoRoot(dir);
  if (!root) return null;
  const folder = taskFolderPath(root, name);
  const branch = taskBranch(name);
  const refused = (held) => ({ taken: false, reason: held.reason, heldBy: held.heldBy ?? null, path: null });

  if (fs.existsSync(folder) && record(root, folder)) {
    const held = acquireTaskFolder(root, folder, { pid });
    if (!held.taken) return refused(held);
    return {
      taken: true, heldBy: pid, path: folder, created: false, how: 'kept',
      branch: record(root, folder)?.branch ?? branch,
    };
  }

  // A DIRECTORY GIT KNOWS NOTHING ABOUT, sitting where this folder goes. The
  // move below cannot be trusted to refuse it: measured 2026-10-07 on git
  // 2.39.5, `worktree move` onto an existing directory behaves like `mv` and
  // moves INTO it, so the finished copy landed at `<folder>/.building-<id>` and
  // the session would have started in a directory holding almost none of the
  // code. Whatever it is, it is not ours to delete and not ours to fill — an
  // EMPTY one excepted, since there is nothing there to lose and a stray empty
  // directory would otherwise wedge the row for good.
  if (fs.existsSync(folder)) {
    const empty = tryRead(folder).length === 0;
    if (!empty) return refused({ reason: 'in-the-way', heldBy: null });
    try { fs.rmdirSync(folder); } catch { return refused({ reason: 'in-the-way', heldBy: null }); }
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
  // and which would refuse the next attempt, so it goes first — unless it
  // belongs to an app process that is still building it.
  const staging = buildingFolderPath(root, name);
  const cleared = clearUnfinished(root, staging, pid);
  if (!cleared.cleared) return refused({ reason: cleared.reason, heldBy: cleared.heldBy });

  const hasBranch = () => tryGit(root, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]).ok;
  const branchExists = hasBranch();
  const from = branchExists ? branch : baseRef(root);
  let how = 'clone';
  if (!cloneCheckout(root, staging, branch, from, branchExists, pid)) {
    how = 'checkout';
    // THE BRANCH IS ASKED ABOUT AGAIN, AND THAT IS NOT BELT AND BRACES.
    //
    // The clone's first act is `worktree add --no-checkout -b`, which CREATES
    // the branch; the copy and the verification come after. So a clone that
    // got past its own door and then failed has left the branch behind, on
    // purpose: `clearUnfinished` keeps it, because a branch outlives every
    // folder and may already carry commits.
    //
    // Reusing the answer from before the clone is how that became the worst
    // failure in this file. `-b` a second time is refused ("a branch named ...
    // already exists"), this function throws, and main/supervisor.mjs catches
    // the throw in two places and hands the session the SHARED CHECKOUT with
    // nothing but a console line. One recoverable copy failure, and two agents
    // are editing the same files. Found 2026-10-07 reviewing with Codex
    // (w-5952e6de3e); the trigger is reproduced in
    // tests/a-task-whose-first-attempt-failed-still-gets-its-own-folder.
    //
    // ATTACH, NEVER `-B` AND NEVER RESET. Whatever is on that branch is work.
    //
    // Found twice, independently: the Linux work on main reached the same line
    // from the other direction, because `cp` there fails differently.
    const add = hasBranch()
      ? addOwned(root, staging, [staging, branch], pid)
      : addOwned(root, staging, ['-b', branch, staging, baseRef(root)], pid);
    if (!add.ok) throw Error(`Could not make a folder for ${name}: ${add.out}`);
  }

  // AND THE LOCAL FILES THE REPOSITORY ASKS FOR, THE SAME WAY WHICHEVER PATH RAN.
  //
  // This is the half that was missing, and the half people were complaining
  // about. The two paths used to disagree: the clone carried every untracked file
  // in the checkout, the ordinary checkout carried `node_modules` and nothing
  // else, and which one a task got depended on whether somebody happened to have
  // an edit open. `.worktreeinclude` makes it one answer, written down, in the
  // repository, in a file Conductor and Claude Code already read.
  //
  // It runs in STAGING, before the folder exists at its own path, so a folder
  // nobody can see yet is the one that is incomplete. A file that was named and
  // cannot be given THROWS, and the staging copy goes with it.
  //
  // REFUSING THE WHOLE FOLDER IS THE REPORT. There was a version of this that
  // made the folder anyway and returned the list of what it had refused, and
  // nothing in the app read that list: a folder starting without its
  // dependencies, with nobody told, is the fault this was written to end, so it
  // cannot be how this fails. The throw reaches `_couldNotGetAFolder` in
  // main/supervisor.mjs, which puts every path and reason on the row where
  // somebody will read it, and the task waits instead of running wrong.
  if (dependencies) {
    try { carryLocalFiles(root, staging); }
    catch (error) { clearUnfinished(root, staging); throw Error(`Could not make a folder for ${name}: ${error.message}`); }
  }

  // `worktree move` rather than a rename, so git's own record of where this
  // worktree lives moves with it. Twice forced, because a locked worktree is
  // exactly what this one is and git refuses to move one otherwise; the lock
  // itself survives the move (git 2.39.5, measured 2026-10-07), which is what
  // keeps the folder owned from the moment it exists to the moment it is
  // handed over. The destination was checked above and is checked again here,
  // since the whole build has run since.
  if (fs.existsSync(folder)) {
    clearUnfinished(root, staging, pid);
    return refused({ reason: 'in-the-way', heldBy: null });
  }
  const moved = tryGit(root, ['worktree', 'move', '--force', '--force', staging, folder]);
  if (!moved.ok) {
    clearUnfinished(root, staging, pid);
    throw Error(`Could not make a folder for ${name}: ${moved.out}`);
  }

  const held = acquireTaskFolder(root, folder, { pid });
  if (!held.taken) return refused(held);
  return { taken: true, heldBy: pid, path: folder, branch, created: true, how };
}

/**
 * `git worktree add`, LOCKED IN THE SAME CALL, so the half-built copy is owned
 * from the moment it exists rather than a moment later. That moment is the one
 * two app processes over one checkout used to collide in. `--reason` on `add`
 * arrived in git 2.32; on an older one the lock is written straight after,
 * which narrows the window rather than closing it and is no reason to refuse
 * the folder.
 */
function addOwned(root, folder, rest, pid) {
  const owned = tryGit(root, ['worktree', 'add', '--lock', '--reason', lockReason(pid), ...rest]);
  if (owned.ok) return owned;
  const added = tryGit(root, ['worktree', 'add', ...rest]);
  if (added.ok) tryGit(root, ['worktree', 'lock', '--reason', lockReason(pid), folder]);
  return added;
}

/**
 * Throw away an unfinished copy, UNLESS SOMEBODY IS STILL MAKING IT. Nothing is
 * ever lost in the clearing: a staging folder has never been handed to anybody,
 * so the most it can hold is a checkout that did not finish. The branch is left
 * alone, as everywhere else in this file.
 *
 * The refusal is the part that was missing. Inside one process the folder
 * thread serialises these, so a staging folder on disk really was abandoned.
 * Across two it was not, and here that is routine: one app runs from the app
 * folder and one from a checkout. Since the local files started being carried
 * in, the build is slower, so the window is wider.
 */
function clearUnfinished(root, staging, pid = process.pid) {
  if (!fs.existsSync(staging) && !record(root, staging)) return { cleared: true };
  const held = holder(root, staging, pid);
  if (!held.ok) {
    return { cleared: false, reason: held.reason === 'held' ? 'building' : held.reason, heldBy: held.heldBy };
  }
  // Unlocked first: `worktree remove` refuses a locked worktree even with one
  // `--force`, and this one is ours or its owner is gone.
  tryGit(root, ['worktree', 'unlock', staging]);
  tryGit(root, ['worktree', 'remove', '--force', staging]);
  try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* already gone */ }
  tryGit(root, ['worktree', 'prune']);
  return { cleared: true };
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
 * THE COPY IS THE PLATFORM'S OWN CLONE, and it lives in
 * `main/worktree-include.mjs` because both files need it and that one does not
 * import this one. macOS `cp -c` is APFS clonefile; GNU `cp -a --reflink=auto`
 * shares blocks where the filesystem can and copies where it cannot, and `-c`
 * is not an option there at all.
 */
function cloneCheckout(root, folder, branch, from, branchExists, pid = process.pid) {
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
    ? addOwned(root, folder, ['--no-checkout', folder, branch], pid)
    : addOwned(root, folder, ['--no-checkout', '-b', branch, folder, from], pid);
  if (!add.ok) return false;

  try {
    // THE ENTRIES THAT HOLD TRACKED CONTENT, AND NOT SIMPLY EVERYTHING.
    //
    // It used to be every top-level entry except `.git` and `.claude`, which had
    // two faults. The small one: every untracked file in the checkout rode along,
    // so this path and the ordinary one produced different folders. The large
    // one: skipping `.claude` WHOLESALE means a repository that commits a file
    // under it (a `.claude/settings.json`, which is ordinary) failed this
    // function's own verification every single time, because the clone was
    // missing a tracked file. That failure is how a task ended up in the shared
    // checkout; see the comment in `ensureTaskFolder` about asking for the
    // branch twice.
    const tracked = trackedTopLevel(root);
    // A repository with a submodule is the ordinary checkout's business: a
    // gitlink is a pointer, not a directory of files, and `worktree move`
    // refuses a worktree holding one.
    if (tracked.submodules) throw Error('this repository has submodules');
    for (const entry of tracked.entries) {
      if (entry === '.git') continue;
      copyIn(root, folder, entry);
    }
    if (!tryGit(folder, ['reset', '-q', 'HEAD']).ok) throw Error('the index would not fill in');
    const after = tryGit(folder, ['status', '--porcelain', '--untracked-files=no']);
    if (!after.ok || after.out.length > 0) throw Error('the clone did not match the commit');
    // An ignored file inside a tracked directory came with it (`renderer/dist`).
    // Cleared here, and whatever is genuinely wanted arrives by name afterwards.
    onlyTrackedContent(folder);
    return true;
  } catch {
    // Back to nothing, so the ordinary path starts from a clean sheet. What is
    // thrown away here is the UNFINISHED COPY and never a folder anybody is in:
    // `folder` is the staging path, which no session has ever been given. It
    // used to be the real one, and a `remove --force` of that is how a running
    // agent lost the ground under it.
    clearUnfinished(root, folder, pid);
    return false;
  }
}

/**
 * One top-level entry, cloned into the new folder.
 *
 * `.claude` IS THE ONE ENTRY THAT CANNOT BE COPIED WHOLE, because the folders
 * every other task is working in live inside it. Its children are copied one by
 * one instead, with `worktrees` left out, so a repository that tracks a file
 * under `.claude` gets it and no task ever receives a copy of another task's
 * work.
 */
function copyIn(root, folder, entry) {
  if (entry !== WORKTREES[0]) { copyTree(path.join(root, entry), folder); return; }
  const to = path.join(folder, entry);
  fs.mkdirSync(to, { recursive: true });
  for (const child of fs.readdirSync(path.join(root, entry))) {
    if (child === WORKTREES[1]) continue;
    copyTree(path.join(root, entry, child), to);
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

// DEPENDENCIES USED TO BE SPECIAL-CASED HERE, and now they are one line of a
// list the repository writes: `main/worktree-include.mjs`, whose default when a
// repository says nothing is `/node_modules`, so the behaviour this paragraph
// used to describe is still the behaviour. The measurement that justified it
// stands and belongs with the code that does it now: cloning this repository's
// 929 MB of dependencies took 2.9 seconds on 2026-09-22 and moved the volume's
// free space by nothing at all, because APFS shares the blocks until something
// writes.

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

  // Whose folder this is, asked in the one place that knows (`holder`). A lock
  // naming a process that has exited is not a claim on anything, and sweeping
  // those is most of what this function is for.
  const held = holder(root, folder, pid);
  if (!held.ok) return { removed: false, reason: held.reason, heldBy: held.heldBy, path: folder };

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
 * And the one under it, which holds what was STAGED when the task was closed.
 * Two commits rather than one because `git add -A` replaces the index with the
 * working tree, so a single commit cannot carry both and the staged arrangement
 * was the half that went.
 */
export const PARKED_INDEX = 'Parked when the task was closed (what was staged)';

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

  const owner = holder(root, folder, pid);
  if (!owner.ok) return { parked: false, reason: owner.reason, heldBy: owner.heldBy, path: folder };

  const { dirty } = folderState(root, folder);
  let kept = 'nothing uncommitted';
  if (dirty) {
    // TWO COMMITS, BECAUSE THE INDEX IS WORK TOO. `git add -A` replaces the
    // index with the working tree, so parking used to flatten them into one:
    // stage version A of a file, edit the working copy to B, park, and B was
    // all that came back. The staged arrangement an agent had built — a
    // half-prepared commit, a rename, a file added but not yet written to —
    // was gone, and the round trip was documented as keeping it.
    //
    // So the index is committed FIRST, exactly as it stands, and the working
    // tree second. The two trees are then both on the branch, and
    // `restoreTaskFolder` unwinds them into the index and the working tree they
    // came from. `--allow-empty` because an index that matches HEAD is the
    // ordinary case and is still the thing to come back to.
    // AND AN INDEX THAT WILL NOT COMMIT ON ITS OWN IS NOT A REASON TO REFUSE.
    // A merge or rebase an agent left mid-flight has unmerged paths, which git
    // will not commit, and the `add -A` below is what resolves them. Losing the
    // index there is exactly the old behaviour, and the old behaviour is better
    // than stranding the folder.
    tryGit(folder, ['commit', '--no-verify', '--allow-empty', '-q', '-m', PARKED_INDEX]);
    const staged = tryGit(folder, ['add', '-A']);
    // `--no-verify`, because a repository's own commit hooks are written for a
    // person finishing a piece of work, and this is the app tidying up after
    // one. A hook that refuses here would strand the folder it is protecting.
    const tree = tryGit(folder, ['commit', '--no-verify', '--allow-empty', '-q', '-m', PARKED]);
    if (!staged.ok || !tree.ok) return { parked: false, reason: 'refused', path: folder, detail: tree.out };
    kept = 'work in progress';
  }

  tryGit(root, ['worktree', 'unlock', folder]);
  const removed = tryGit(root, ['worktree', 'remove', folder]);
  if (!removed.ok) return { parked: false, reason: 'refused', path: folder, detail: removed.out };
  return { parked: true, kept, path: folder };
}

/**
 * The way back. Makes the folder again off the branch, and when the last
 * commits on it are parked ones, takes them apart so the work is uncommitted
 * exactly as it was: THE WORKING TREE FROM ONE AND THE INDEX FROM THE OTHER.
 *
 *   `reset HEAD~1` is mixed, so it leaves the files alone and fills the index
 *   in from the commit below — which is the index as it was parked.
 *   `reset --soft HEAD~1` then puts HEAD back where it started and touches
 *   neither, so the branch grows nothing and both halves survive.
 *
 * A FOLDER PARKED BEFORE THIS LANDED has one commit and no index commit under
 * it, and still has to come back: there are parked branches on this Mac from
 * the old shape. One mixed reset is what it always was.
 */
export function restoreTaskFolder(dir, id, { pid = process.pid } = {}) {
  const made = ensureTaskFolder(dir, id, { pid });
  if (!made || made.taken === false) return made ?? null;
  const last = tryGit(made.path, ['log', '-1', '--format=%s']);
  if (!last.ok || last.out !== PARKED) return made;
  const under = tryGit(made.path, ['log', '-1', '--format=%s', 'HEAD~1']);
  tryGit(made.path, ['reset', '-q', 'HEAD~1']);
  if (under.ok && under.out === PARKED_INDEX) tryGit(made.path, ['reset', '--soft', '-q', 'HEAD~1']);
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
    // A folder still being built is not one of hers: it has no row standing in
    // it and nothing in it is wanted, so it may never be listed, shown or swept.
    .filter((w) => path.dirname(w.path) === home && !w.prunable
      && !path.basename(w.path).startsWith(BUILDING))
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
