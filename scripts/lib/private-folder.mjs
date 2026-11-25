// The ship's half of the private folder a repository names in
// `.agentbox/private.json` (main/private-folder.mts gives each task folder its
// copy). That repository has no branches: what a task changed in it is
// committed and pushed to its main, so it is not lost with the folder.
// Plain JavaScript, because `npm run ship` runs on a plain node.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { named, plantedIn } from './private-folder-check.mjs';

const PUSH_MS = 2 * 60_000;
const LOCAL_MS = 20_000;
// The push runs the skill tests it reaches (scripts/private-push-gate.mjs).
const CHECKED_PUSH_MS = 10 * 60_000;

// A Codex worker's sandbox writes its task folder and the temp folders, so the
// push's own copy of the git folder goes in the person's cache instead.
const outOfWorkersReach = () => process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Caches')
  : process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');

// The parts of a git folder that carry settings or programs; the copy takes none of them.
const SETTINGS = new Set(['config', 'config.worktree', 'commondir', 'hooks']);

/**
 * A copy of the checkout's git folder with the app folder's settings in place
 * of its own. The check compared the two; git then reads only the copy, so a
 * worker process still running cannot change what it reads in between.
 */
function checkedCopy(own, trustedConfig) {
  let copy;
  try {
    const base = outOfWorkersReach();
    fs.mkdirSync(base, { recursive: true });
    copy = fs.mkdtempSync(path.join(base, 'agentbox-private-push-'));
  } catch (err) {
    // Only inside the ship's own sandbox (a test of this push run by the push
    // hook) is the cache shut, and there no worker process can reach the copy.
    if (err?.code !== 'EPERM' && err?.code !== 'EACCES') throw err;
    copy = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-private-push-'));
  }
  // Its times too: git trusts an index newer than the files it lists, and would miss an edit made the second it was written.
  fs.cpSync(own, copy, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, filter: (src) => !SETTINGS.has(path.relative(own, src).split(path.sep)[0]) });
  fs.writeFileSync(path.join(copy, 'config'), trustedConfig);
  return copy;
}

/** What the push did, back in the checkout: its objects, branches and index. */
function handBack(copy, own) {
  fs.cpSync(path.join(copy, 'objects'), path.join(own, 'objects'), { recursive: true, force: false, verbatimSymlinks: true });
  fs.cpSync(path.join(copy, 'refs'), path.join(own, 'refs'), { recursive: true, force: true, verbatimSymlinks: true });
  for (const name of ['packed-refs', 'HEAD', 'index']) {
    if (fs.existsSync(path.join(copy, name))) fs.cpSync(path.join(copy, name), path.join(own, name), { preserveTimestamps: true });
    else fs.rmSync(path.join(own, name), { force: true });
  }
}

// `signIn` runs the fetch and the push with the ship's GitHub sign-in (scripts/lib/push-sign-in.mjs).
export function pushPrivateFolder(dir, { message, env = process.env, trusted = dir, signIn = null } = {}) {
  // The task's own private.json is the worker's to write, so the name is the app folder's.
  const rel = named(trusted);
  const at = rel && path.join(dir, rel);
  if (!at || !fs.existsSync(path.join(at, '.git'))) return { pushed: false };
  // A linked folder on the way would compare the app folder's checkout with itself.
  if (fs.realpathSync(at) !== path.join(fs.realpathSync(dir), rel)) return { pushed: false, why: `${rel} was left as it is, because it leads outside the task folder` };
  const planted = plantedIn(at, path.join(trusted, rel));
  if (planted) return { pushed: false, why: `${rel} was left as it is, because ${planted}` };
  // The gate, not the public hooks the ship names in the environment, which
  // refuse a commit on any main the public main does not hold.
  const gate = path.join(trusted, 'scripts', 'private-hooks');
  if (!fs.existsSync(path.join(gate, 'pre-push'))) return { pushed: false, why: `${rel} was left as it is, because the checks its push runs are missing here` };
  const own = path.join(at, '.git');
  let copy;
  try { copy = checkedCopy(own, fs.readFileSync(path.join(trusted, rel, '.git', 'config'))); } catch (err) { return { pushed: false, why: `${rel} was left as it is, because its git folder could not be copied (${err?.message ?? err})` }; }
  try {
    return pushFrom(copy, { at, rel, gate, env, message, signIn });
  } finally {
    try { handBack(copy, own); } catch { /* the push went out or not; the checkout catches up next ship */ }
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

function pushFrom(copy, { at, rel, gate, env, message, signIn }) {
  const quiet = { ...env, GIT_TERMINAL_PROMPT: '0' };
  const git = (args, timeout = LOCAL_MS) => {
    const opts = { cwd: at, encoding: 'utf8', env: quiet, timeout, killSignal: 'SIGKILL' };
    const line = ['-c', `core.hooksPath=${gate}`, `--git-dir=${copy}`, `--work-tree=${at}`, ...args];
    const r = signIn && (args[0] === 'fetch' || args[0] === 'push') ? signIn(line, { ...opts, pushing: args[0] === 'push' }) : spawnSync('git', line, opts);
    // A warning on stderr is not an answer: `answer` is what decides, `out` is what a refusal quotes.
    return { ok: r.status === 0, answer: `${r.stdout ?? ''}`.trim(), out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
  };
  // Status goes into every repository the index lists and runs its settings,
  // and the tree's `.git` files can appear after the check. The copy's index
  // is out of a worker's reach, so it is what decides.
  const listed = git(['ls-files', '--stage']);
  if (!listed.ok) return { pushed: false, why: `git could not read ${rel}: ${listed.out}` };
  if (/^160000 /m.test(listed.answer)) return { pushed: false, why: `${rel} was left as it is, because its index lists a repository of its own` };
  const status = git(['status', '--porcelain']);
  if (!status.ok) return { pushed: false, why: `git could not read ${rel}: ${status.out}` };
  if (status.answer) {
    git(['add', '-A']);
    const committed = git(['commit', '--quiet', '-m', message]);
    if (!committed.ok) return { pushed: false, why: `could not commit what changed in ${rel}: ${committed.out}` };
  }
  const fetched = git(['fetch', '--quiet'], PUSH_MS);
  if (!fetched.ok) return { pushed: false, why: `could not reach ${rel}'s repository: ${fetched.out}` };
  const ahead = git(['rev-list', '--count', '@{u}..HEAD']);
  const commits = Number(ahead.answer) || 0;
  if (!ahead.ok || !commits) return { pushed: false };
  const rebased = git(['rebase', '--quiet', '@{u}']);
  if (!rebased.ok) {
    git(['rebase', '--abort']);
    return { pushed: false, why: `could not put ${rel}'s commits after what was pushed meanwhile: ${rebased.out}` };
  }
  const pushed = git(['push', '--quiet'], CHECKED_PUSH_MS);
  if (!pushed.ok) {
    const refused = /private push refused: (.*)/.exec(pushed.out)?.[1];
    return { pushed: false, why: refused ? `${rel} was not pushed, because ${refused}` : `could not push ${rel}: ${pushed.out}` };
  }
  return { pushed: true, commits, path: rel };
}
