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
import { Name, nameSlug } from '../shared/product-name.mjs';
import { carryLocalFiles, copyTree, onlyTrackedContent, trackedTopLevel } from './worktree-include.mjs';

/** Where Claude Code puts its own, so both engines and a human agree. */
const WORKTREES = ['.claude', 'worktrees'];

/** The branch prefix this repository already uses for agent work. */
const BRANCH_PREFIX = `${nameSlug}/`;

/** Ids are `w-` plus hex today. This is the guard for the day they are not. */
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** What an unfinished folder is called. A task name may never start with a dot. */
const BUILDING = '.building-';

// A HOOK RUN BY THE APP IN A TASK FOLDER IS A WORKER'S CODE RUN AS THE APP.
// core.hooksPath is often the relative 'scripts/hooks', which git resolves
// against the working tree it runs in, so in a task folder it is that folder's
// own scripts/hooks -- which a worker edits. parkTaskFolder commits there
// (post-commit, reference-transaction), so the app's every git in a linked
// worktree runs hook-free. The primary checkout, where `worktree add` runs its
// own post-checkout, keeps its hooks: a linked worktree's `.git` is a file.
const inLinkedWorktree = (cwd) => {
  try { return fs.lstatSync(path.join(cwd, '.git')).isFile(); } catch { return false; }
};
const git = (cwd, args) => execFileSync('git', [
  ...(inLinkedWorktree(cwd) ? ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'] : []),
  ...args,
], {
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

// Files that say nothing of anyone's work: Finder's, and the one an agent
// writes when it recreates its deleted folder to keep its shell alive. A
// folder holding only these is as good as empty.
const LEFTOVER_MARKERS = new Set(['.DS_Store', '.keep-session']);
const isPlainFile = (file) => { try { return fs.lstatSync(file).isFile(); } catch { return false; } };

/** Git that answers rather than throws, for the questions where "no" is fine. */
function tryGit(cwd, args) {
  try { return { ok: true, out: git(cwd, args) }; }
  catch (error) { return { ok: false, out: String(error?.stderr ?? error?.message ?? '').trim() }; }
}

/**
 * DOES THIS FAILED `worktree add` MEAN SOMEBODY ELSE IS MAKING THE FOLDER?
 *
 * Git's wordings for "something is already at that path", measured on git
 * 2.39.5 across six processes racing for one id:
 *
 *   fatal: '<staging>' already exists                   (2026-10-09)
 *   fatal: '<staging>' is already registered            (2026-10-09)
 *   fatal: '<branch>' is already checked out at '<staging>'
 *   fatal: '<branch>' is already used by worktree at '<staging>'
 *   fatal: '<staging>' is not a working tree            (2026-10-17)
 *
 * THE NARROWNESS IS THE POINT, AND IT TOOK TWO GOES. Everything else `worktree
 * add` can fail with -- a full disk, an invalid ref, a branch collision -- is a
 * real failure with a different answer, and reporting one of those as "another
 * session has this" would send whoever reads the row hunting for a session that
 * does not exist. So a wording is not enough on its own: the path git names has
 * to be a STAGING folder. Named anywhere else, the two branch wordings mean the
 * branch is checked out in somebody's finished work, which is a failure a
 * person must act on -- `a-task-folder-is-made-when-the-repository-has-a-
 * failing-post-checkout-hook` is main's test for exactly that, and the first
 * draft of this guard swallowed it.
 *
 * A branch collision is deliberately not matched either: `a branch named ...
 * already exists` has its own road a few lines above (ask again, then attach),
 * and that road is the 2026-10-07 fix which must not be routed around.
 */
export function somebodyIsBuilding(out) {
  const said = String(out ?? '');
  if (!said) return false;
  // A BRANCH THAT ALREADY EXISTS IS NOT A FOLDER THAT ALREADY EXISTS, and it
  // shares the words. It has its own road a few lines above `addOwned`'s caller
  // -- ask again, then attach -- and that road is the 2026-10-07 fix, so routing
  // around it would hand a session the shared checkout. Checked first, because
  // the phrase it carries would otherwise match the clause below it.
  if (/a branch named/i.test(said)) return false;
  // The marker rather than the path itself, because git prints the path it
  // resolved: on a Mac a staging folder under /tmp comes back under /private.
  if (!said.includes(BUILDING)) return false;
  return /already exists/i.test(said)
    || /already registered/i.test(said)
    || /already used by worktree/i.test(said)
    || /already checked out/i.test(said)
    // Git's bookkeeping for staging caught mid-flight: registered by the winner
    // and already gone from the disk, so the loser's second add finds neither.
    || /is not a working tree/i.test(said);
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
 * A PROJECT FOLDER THAT IS NOT A REPOSITORY IS MADE ONE (2026-10-14).
 *
 * A teammate's first task failed with "no folder could be made" until they ran
 * `git init` and a first commit by hand, and so did every task in any project
 * picked from a plain folder: a task folder is a worktree, and a worktree needs
 * a repository and a commit to start from. New Project even creates the folder
 * when it is missing, so an empty one failed its first task every time.
 *
 * So the app takes the same two steps. Local only: nothing is pushed, and a
 * `.gitignore` the folder already has is respected by the first commit. Inside
 * a repository already, `repoRoot` answers first and this never runs. A folder
 * too big to commit by itself (`FIRST_COMMIT_LIMIT`) is left exactly as it was,
 * the repository just started here removed again, and the refusal says why.
 */
function startRepository(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const why = gitWillNotRun(dir);
  if (why) throw Error(why);
  if (!tryGit(dir, ['init', '-q']).ok) return null;
  const root = repoRoot(dir);
  try { firstCommitIfNone(root); }
  catch (error) { fs.rmSync(path.join(root, '.git'), { recursive: true, force: true }); throw error; }
  return root;
}

/**
 * WHEN GIT ITSELF CANNOT RUN HERE, THE ONE THING TO DO ABOUT IT (2026-10-15).
 *
 * `repoRoot` reads every failure as "not a repository", and two everyday setups
 * fail before git looks at anything: a Mac without the Command Line Tools,
 * whose `/usr/bin/git` only prints "xcrun: error: invalid active developer
 * path", and a repository owned by another account, which git refuses as
 * "dubious ownership". Both ended as "no folder could be made" with a list of
 * causes that named neither, and the second ran `git init` over somebody
 * else's repository on the way. The sentence returned here is what the task's
 * row says, after "could not be given a folder of its own to work in: ".
 */
function gitWillNotRun(dir) {
  const asked = tryGit(dir, ['rev-parse', '--show-toplevel']);
  if (asked.ok) return null;
  if (/xcrun: error|invalid active developer path|no developer tools were found/i.test(asked.out)) {
    return `git is not set up on this Mac yet. Open Terminal, run xcode-select --install, and reply here once it has finished`;
  }
  if (/\bENOENT\b/.test(asked.out)) {
    return `git is not installed on this computer, and ${Name} needs it to give each task a folder. Install git, then reply here`;
  }
  const owned = /dubious ownership in repository at '([^']+)'/.exec(asked.out);
  if (owned) {
    return `git will not work in ${owned[1]} because that folder belongs to another account on this computer. If it is yours, run git config --global --add safe.directory '${owned[1]}' in Terminal, then reply here`;
  }
  return null;
}

/**
 * HOW MUCH A FIRST COMMIT MAY TAKE ON BY ITSELF. Measured on the founder's
 * store on 2026-10-14: the one project whose folder was not a repository held
 * 18 GB, mostly media libraries, and committing that copies all of it into
 * `.git` and runs for minutes. A code project with its dependencies left in is
 * a few hundred MB.
 */
const FIRST_COMMIT_LIMIT = 500 * 1024 * 1024;

const sizeSaid = (bytes) => (bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
  : `${Math.round(bytes / 1024 ** 2)} MB`);

/** What a first commit would take, in bytes, stopping once past the limit. */
function sizeOfFirstCommit(root) {
  // Its own call rather than `tryGit`, for the buffer: a folder of media lists
  // far past the default megabyte of output.
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
  });
  let total = 0;
  for (const file of listed.split('\0')) {
    if (!file) continue;
    try { total += fs.lstatSync(path.join(root, file)).size; } catch { /* gone since the listing */ }
    if (total > FIRST_COMMIT_LIMIT) break;
  }
  return total;
}

/**
 * The first commit, made only when there is none: a repository with any commit
 * at all is never committed to here, so work somebody has not committed stays
 * theirs. `--allow-empty` because an empty folder is a real first project.
 * Made `asTheApp`, like every commit in this file.
 */
function firstCommitIfNone(root) {
  if (tryGit(root, ['rev-parse', '--verify', '-q', 'HEAD']).ok) return;
  hideFromTheCheckout(root);
  const size = sizeOfFirstCommit(root);
  if (size > FIRST_COMMIT_LIMIT) {
    throw Error(`this project's folder is not a git repository yet, and at more than ${sizeSaid(size)} it is too big for ${Name} to make one by itself. In a terminal in that folder run git init, add a .gitignore for the big folders, and make a first commit`);
  }
  if (!tryGit(root, ['add', '-A']).ok) return;
  tryGit(root, [...asTheApp(root), 'commit', '-q', '--no-verify', '--allow-empty', '-m', `First commit, made by ${Name} so each task can have a folder of its own`]);
}

/**
 * EVERY COMMIT THE APP MAKES IS MADE WITH NOBODY WATCHING, so it cannot ask
 * anybody anything. Two things a person's git setup can make a commit ask:
 *
 *   Who are you. A git with no name or email set refuses with "Please tell me
 *   who you are" wherever it cannot make one up, which is any repository with
 *   `user.useConfigOnly` and any Linux whose host name has no domain. A park
 *   refused that way left the folder on the disk for good (2026-10-15). So
 *   whatever is missing is filled in with the app's name, and whatever the
 *   person set is kept.
 *
 *   A passphrase. With `commit.gpgsign` on, the signer can open a pinentry
 *   window or wait on 1Password, and measured on 2026-10-15 with a signer that
 *   waits, a park never came back. Folder jobs run one at a time, so that one
 *   park left every later task in every project without a folder. Signing is
 *   off for the app's commits only; the person's own still sign.
 */
function asTheApp(cwd) {
  const set = (key) => { const got = tryGit(cwd, ['config', key]); return got.ok && got.out !== ''; };
  return [
    ...(set('user.name') ? [] : ['-c', `user.name=${Name}`]),
    ...(set('user.email') ? [] : ['-c', `user.email=${nameSlug}@localhost`]),
    '-c', 'commit.gpgsign=false',
  ];
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
 * WHO ENDED UP IN THE LOCK, read off our own `worktree lock` and the lock as it
 * stands a moment later. Four answers and one non-answer:
 *
 *   our pid in it            ours
 *   another pid in it        theirs, and the row can name it
 *   a lock with no pid       a person locked it by hand
 *   our lock would not write this machine failing, in git's own words
 *   nothing in it at all     NOT AN ANSWER YET: ask again
 *
 * THE NON-ANSWER IS THE WHOLE POINT. `unlock` and `lock` are two commands, so
 * while another session takes the same dead owner's folder over, there is a
 * moment when the folder carries no lock at all: ours is gone and theirs is not
 * written yet. A read landing in that moment has nobody to name, and it used to
 * answer `refused`, which reached the row as "its folder is refused" -- not
 * something anybody can act on, and not true either, since that session is
 * about to own it. Asked again, the lock has landed and the answer is real.
 *
 * GIT'S OWN REFUSAL IS READ RATHER THAN COUNTED AS A FAILURE. `is already
 * locked` is a session that got in a moment before us and usually carries its
 * pid, so it asks again too and names them when the asking runs out. Only a
 * lock git would not write for some other reason -- a permission, a full disk,
 * a path it does not know -- is this machine failing, and that one carries
 * git's words out rather than naming a session that does not exist.
 */
const alreadyLocked = (out) => /is already locked/i.test(String(out ?? ''));

export function whoEndedUpInTheLock({ pid, locked, after, triesLeft }) {
  const now = pidInReason(after);
  if (now === pid) return { taken: true, heldBy: pid };
  if (after !== undefined) return { taken: false, reason: now ? 'held' : 'locked', heldBy: now ?? null };
  if (!locked.ok && !alreadyLocked(locked.out)) {
    return { taken: false, reason: 'unlockable', heldBy: null, detail: locked.out };
  }
  if (triesLeft > 0) return { again: true };
  const them = pidInReason(locked.out);
  if (them) return { taken: false, reason: 'held', heldBy: them };
  // Git saw a lock we cannot read a pid out of, which is a person's own.
  if (!locked.ok) return { taken: false, reason: 'locked', heldBy: null };
  return { taken: false, reason: 'held', heldBy: null };
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
 *
 * Asked up to `tries` times, because the read-back can land between another
 * taker's unlock and its lock and see nobody at all. Each try is a fresh
 * `worktree list`, which is the only pause the gap needs: the gap is one git
 * command wide.
 */
export function acquireTaskFolder(root, folder, { pid = process.pid, tries = 5 } = {}) {
  for (let triesLeft = tries - 1; ; triesLeft -= 1) {
    const held = holder(root, folder, pid);
    if (!held.ok) return { taken: false, reason: held.reason, heldBy: held.heldBy };
    if (!held.free && !held.stale) return { taken: true, heldBy: pid };

    if (held.stale) tryGit(root, ['worktree', 'unlock', folder]);
    const locked = tryGit(root, ['worktree', 'lock', '--reason', lockReason(pid), folder]);

    const said = whoEndedUpInTheLock({ pid, locked, after: record(root, folder)?.lock, triesLeft });
    if (!said.again) return said;
  }
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
export function ensureTaskFolder(dir, id, { pid = process.pid, dependencies = true, again = false } = {}) {
  const name = safeTaskName(id);
  const root = repoRoot(dir) ?? startRepository(dir);
  if (!root) return null;
  firstCommitIfNone(root);
  const folder = taskFolderPath(root, name);
  const branch = taskBranch(name);
  // A LOCK GIT WOULD NOT WRITE IS NOT A REFUSAL. Nobody else has the folder,
  // and every reason above names somebody or something; this one names this
  // machine, so it leaves by the road failures leave by, which puts git's words
  // on the row (`_couldNotGetAFolder` in main/supervisor.mjs).
  const refused = (held) => {
    if (held.reason === 'unlockable') throw Error(`Could not take the folder for ${name}: ${held.detail}`);
    return { taken: false, reason: held.reason, heldBy: held.heldBy ?? null, path: null };
  };

  // SOMEBODY ELSE FINISHED THE FOLDER WHILE WE WERE MAKING IT, which is not the
  // same thing as somebody still making it (w-36c51443df). Measured 2026-10-17,
  // six processes on one id on a busy machine: a loser can get all the way to
  // its `worktree move` and find the winner has already moved its own copy into
  // place, so git refuses with a fatal about staging and nobody is building
  // anything any more. The answer is the road at the top of this function --
  // the folder is there, ask to hold it -- so the three exits below take it
  // rather than inventing a word for a race that is already over. Asked once:
  // a second failure is not a race.
  const somebodyFinishedIt = () => !again && fs.existsSync(folder) && !!record(root, folder);
  const askAgain = () => ensureTaskFolder(dir, id, { pid, dependencies, again: true });

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
  // EMPTY one excepted, or one holding only LEFTOVER_MARKERS, since there is
  // nothing there to lose and a stray one would otherwise wedge the row for good.
  if (fs.existsSync(folder)) {
    const left = tryRead(folder);
    if (!left.every((name) => LEFTOVER_MARKERS.has(name) && isPlainFile(path.join(folder, name)))) return refused({ reason: 'in-the-way', heldBy: null });
    try {
      for (const name of left) fs.rmSync(path.join(folder, name));
      fs.rmdirSync(folder);
    } catch { return refused({ reason: 'in-the-way', heldBy: null }); }
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
    if (!add.ok) {
      // SOMEBODY GOT HERE FIRST, AND THAT IS A REFUSAL RATHER THAN A FAILURE
      // (w-36c51443df). `clearUnfinished` above answers `building` only when
      // staging is already REGISTERED AND LOCKED, and the window this lands in
      // is narrower than that: between its "nothing there" and this add, another
      // process created the directory. Measured 2026-10-09, six processes on one
      // id: one won and five threw `fatal: '<staging>' already exists`, so the
      // documented `building` reason could not fire in the one case it was
      // written for.
      //
      // The row waited either way -- `_couldNotGetAFolder` sees the throw and
      // says so in plain words -- so this is about what she reads, not about
      // safety. "Another session is building this folder" is both true and
      // something to act on; a git fatal about a dot-prefixed path is neither.
      //
      // AND SOMETIMES THE WINNER HAS ALREADY FINISHED, which `somebodyFinishedIt`
      // above explains: the add was refused because the branch is checked out in
      // the folder the winner has just made.
      if (somebodyFinishedIt()) return askAgain();
      if (somebodyIsBuilding(add.out)) return refused({ reason: 'building', heldBy: null });
      throw Error(`Could not make a folder for ${name}: ${add.out}`);
    }
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
    const finished = somebodyFinishedIt();
    clearUnfinished(root, staging, pid);
    // A registered worktree at that path is another session's finished work, not
    // a stray directory in the way, and it has a better answer than `in-the-way`.
    if (finished) return askAgain();
    return refused({ reason: 'in-the-way', heldBy: null });
  }
  const moved = tryGit(root, ['worktree', 'move', '--force', '--force', staging, folder]);
  if (!moved.ok) {
    clearUnfinished(root, staging, pid);
    // THE EXIT THE RACE ACTUALLY TAKES, found 2026-10-17 and missed on 2026-10-09
    // because one run of a race is not a measurement of it: two sessions can both
    // build the same staging copy, and the one that moves second finds the path
    // gone -- `fatal: '<staging>' is not a working tree`.
    if (somebodyFinishedIt()) return askAgain();
    if (somebodyIsBuilding(moved.out)) return refused({ reason: 'building', heldBy: null });
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
 *
 * AN ADD THAT SAYS IT FAILED MAY HAVE MADE THE FOLDER ANYWAY (2026-10-15). git
 * runs the repository's post-checkout hook after the worktree is made and
 * hands back the hook's exit as its own, and git-lfs's hook exits 1 on a
 * machine without git-lfs. Read as a failure, the retry below was refused
 * because the first add had already made the branch, and every task in that
 * repository went without a folder. A checkout that itself fails is undone by
 * git and leaves nothing registered, so a registered folder with a commit in
 * it is one the hook complained about after the fact, and it is ours.
 */
function addOwned(root, folder, rest, pid) {
  const owned = tryGit(root, ['worktree', 'add', '--lock', '--reason', lockReason(pid), ...rest]);
  if (owned.ok) return owned;
  if (record(root, folder) && tryGit(folder, ['rev-parse', '--verify', '-q', 'HEAD']).ok) {
    if (record(root, folder)?.lock === undefined) tryGit(root, ['worktree', 'lock', '--reason', lockReason(pid), folder]);
    return { ok: true, out: owned.out };
  }
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
 * AND STILL ON THE TASK'S OWN BRANCH, asked right before anything is committed
 * or removed. The path alone was not proof (GitHub issue #43: another tool's
 * worktree sat at the same path), and a folder an agent moved off its branch
 * would be committed onto the wrong one, or, on no branch at all, onto nothing
 * and then deleted.
 */
const onItsOwnBranch = (root, folder, name) => record(root, folder)?.branch === taskBranch(name);

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
  if (!onItsOwnBranch(root, folder, name)) return { removed: false, reason: 'not-ours', path: folder };

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
  const removed = removeWorktree(root, folder);
  if (!removed.ok) return { removed: false, reason: 'refused', path: folder, detail: removed.out };
  return { removed: true, reason: 'merged', path: folder };
}

/**
 * `git worktree remove`, AND A FOLDER HOLDING SUBMODULES TOO, WHEN THAT LOSES
 * NOTHING (2026-10-15).
 *
 * git refuses to remove any worktree with a submodule filled in, clean or not:
 * "working trees containing submodules cannot be moved or removed". A task in a
 * repository with submodules starts with them empty, so an agent's first act is
 * `git submodule update --init`, and from then on park and release were refused
 * on every sweep and that folder was never reclaimed. Emptying the submodules
 * first does not help: git still refuses while their repositories live on
 * under the worktree's own `modules`.
 *
 * The refusal guards one real thing. Those repositories are the only copy of
 * anything committed inside a submodule and not pushed, and `--force` deletes
 * them. So it is forced only once that is provably nothing: no file anywhere in
 * the folder or its submodules uncommitted, no submodule whose repository sits
 * inside its own directory where this cannot look, and every commit in every
 * submodule repository already on one of its remotes. Anything else stays
 * refused, kept and reported as before.
 */
function removeWorktree(root, folder) {
  const removed = tryGit(root, ['worktree', 'remove', folder]);
  if (removed.ok || !/submodules/.test(removed.out)) return removed;
  if (!submodulesHoldNothingOfTheirOwn(folder)) return removed;
  return tryGit(root, ['worktree', 'remove', '--force', folder]);
}

function submodulesHoldNothingOfTheirOwn(folder) {
  try {
    const status = tryGit(folder, ['status', '--porcelain', '--ignore-submodules=none']);
    if (!status.ok || status.out !== '') return false;
    if (!everySubmoduleKeepsItsRepositoryOutside(folder)) return false;
    const gitDir = tryGit(folder, ['rev-parse', '--absolute-git-dir']);
    if (!gitDir.ok) return false;
    return repositoriesUnder(path.join(gitDir.out, 'modules')).every((repo) => {
      const own = tryGit(repo, ['--git-dir', repo, 'rev-list', '-n', '1', '--all', '--not', '--remotes']);
      return own.ok && own.out === '';
    });
  } catch { return false; }
}

/**
 * A submodule added from a repository already in place keeps that repository
 * in its own `.git` directory rather than under `modules`, and a forced removal
 * deletes it with the files. Asked of every level, since a submodule can hold
 * its own.
 */
function everySubmoduleKeepsItsRepositoryOutside(at) {
  const staged = tryGit(at, ['ls-files', '-s']);
  if (!staged.ok) return false;
  for (const line of staged.out.split('\n')) {
    if (!line.startsWith('160000 ')) continue;
    const inner = path.join(at, line.slice(line.indexOf('\t') + 1));
    const dotGit = path.join(inner, '.git');
    if (!fs.existsSync(dotGit)) continue;
    if (fs.lstatSync(dotGit).isDirectory() || !everySubmoduleKeepsItsRepositoryOutside(inner)) return false;
  }
  return true;
}

/** Every repository in a `modules` directory, nested ones included. Throws on one it cannot read. */
function repositoriesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  const walk = (at) => {
    if (fs.existsSync(path.join(at, 'HEAD')) && fs.existsSync(path.join(at, 'objects'))) {
      found.push(at);
      if (fs.existsSync(path.join(at, 'modules'))) walk(path.join(at, 'modules'));
      return;
    }
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(at, entry.name));
    }
  };
  walk(dir);
  return found;
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
export function parkTaskFolder(dir, id, { pid = process.pid, path: given = null } = {}) {
  const name = safeTaskName(id);
  const root = repoRoot(dir);
  if (!root) return { parked: false, reason: 'no-repo' };
  // `ownFolder`, and never the basename of whatever we were pointed at: parking
  // commits and then removes, so being wrong here costs somebody their folder.
  const folder = ownFolder(root, name, given);
  if (!folder) return { parked: false, reason: 'not-ours', path: given };
  if (!fs.existsSync(folder)) return { parked: false, reason: 'gone' };
  if (!onItsOwnBranch(root, folder, name)) return { parked: false, reason: 'not-ours', path: folder };

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
    const as = asTheApp(folder);
    tryGit(folder, [...as, 'commit', '--no-verify', '--allow-empty', '-q', '-m', PARKED_INDEX]);
    const staged = tryGit(folder, ['add', '-A']);
    // `--no-verify`, because a repository's own commit hooks are written for a
    // person finishing a piece of work, and this is the app tidying up after
    // one. A hook that refuses here would strand the folder it is protecting.
    const tree = tryGit(folder, [...as, 'commit', '--no-verify', '--allow-empty', '-q', '-m', PARKED]);
    if (!staged.ok || !tree.ok) return { parked: false, reason: 'refused', path: folder, detail: tree.out };
    kept = 'work in progress';
  }

  tryGit(root, ['worktree', 'unlock', folder]);
  const removed = removeWorktree(root, folder);
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
 * `ours` IS PROOF BY LOCATION AND BRANCH. The location alone is not enough:
 * Claude Code's desktop app makes its worktrees at that same
 * `<primary>/.claude/worktrees/<name>`, on `claude/<name>`, and the sweep parked
 * and removed three of them with live sessions in them (GitHub issue #43). So a
 * folder there is ours only when it is also on a branch `taskBranch` names; one
 * on any other branch, or on none, is a stray. It is deliberately not inferred from the lock
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
        && path.dirname(at) === home && couldBeATaskName(name)
        && String(w.branch ?? '').startsWith(BRANCH_PREFIX),
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
