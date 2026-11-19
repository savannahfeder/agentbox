// The ship's half of the private folder a repository names in
// `.agentbox/private.json` (main/private-folder.mts gives each task folder its
// copy). That repository has no branches: what a task changed in it is
// committed and pushed to its main, so it is not lost with the folder.
// Plain JavaScript, because `npm run ship` runs on a plain node.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PUSH_MS = 2 * 60_000;
const LOCAL_MS = 20_000;

function named(dir) {
  try {
    const { path: rel, url } = JSON.parse(fs.readFileSync(path.join(dir, '.agentbox/private.json'), 'utf8'));
    return typeof rel === 'string' && typeof url === 'string' && rel && !path.isAbsolute(rel) && !rel.split(/[\\/]/).includes('..') ? rel : null;
  } catch { return null; }
}

export function pushPrivateFolder(dir, { message, env = process.env } = {}) {
  const rel = named(dir);
  const at = rel && path.join(dir, rel);
  if (!at || !fs.existsSync(path.join(at, '.git'))) return { pushed: false };
  const quiet = { ...env, GIT_TERMINAL_PROMPT: '0' };
  const git = (args, timeout = LOCAL_MS) => {
    const r = spawnSync('git', args, { cwd: at, encoding: 'utf8', env: quiet, timeout, killSignal: 'SIGKILL' });
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
  const pushed = git(['push', '--quiet'], PUSH_MS);
  if (!pushed.ok) return { pushed: false, why: `could not push ${rel}: ${pushed.out}` };
  return { pushed: true, commits, path: rel };
}
