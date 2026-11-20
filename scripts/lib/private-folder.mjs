// The ship's half of the private folder a repository names in
// `.agentbox/private.json` (main/private-folder.mts gives each task folder its
// copy). That repository has no branches: what a task changed in it is
// committed and pushed to its main, so it is not lost with the folder.
// Plain JavaScript, because `npm run ship` runs on a plain node.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { named, plantedIn } from './private-folder-check.mjs';

const PUSH_MS = 2 * 60_000;
const LOCAL_MS = 20_000;
// The push runs the skill tests it reaches (scripts/private-push-gate.mjs).
const CHECKED_PUSH_MS = 10 * 60_000;

export function pushPrivateFolder(dir, { message, env = process.env, trusted = dir } = {}) {
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
  const quiet = { ...env, GIT_TERMINAL_PROMPT: '0' };
  const git = (args, timeout = LOCAL_MS) => {
    const r = spawnSync('git', ['-c', `core.hooksPath=${gate}`, ...args], { cwd: at, encoding: 'utf8', env: quiet, timeout, killSignal: 'SIGKILL' });
    return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
  };
  const status = git(['status', '--porcelain']);
  if (!status.ok) return { pushed: false, why: `git could not read ${rel}: ${status.out}` };
  if (status.out) {
    git(['add', '-A']);
    const committed = git(['commit', '--quiet', '-m', message]);
    if (!committed.ok) return { pushed: false, why: `could not commit what changed in ${rel}: ${committed.out}` };
  }
  const fetched = git(['fetch', '--quiet'], PUSH_MS);
  if (!fetched.ok) return { pushed: false, why: `could not reach ${rel}'s repository: ${fetched.out}` };
  const ahead = git(['rev-list', '--count', '@{u}..HEAD']);
  const commits = Number(ahead.out) || 0;
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
