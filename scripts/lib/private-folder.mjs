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

const read = (file) => { try { return fs.readFileSync(file); } catch { return null; } };
const kind = (file) => { try { const s = fs.lstatSync(file); return s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'dir' : 'file'; } catch { return null; } };

// Git runs commands named in a repository's config, hooks and common folder,
// and in any repository nested in its tree. A Codex worker's sandbox lets it
// write all of those in the task's copy, and this runs outside the sandbox, so
// they must be byte for byte the ones the app folder's copy has.
function plantedIn(at, trusted) {
  const own = path.join(at, '.git');
  const given = path.join(trusted, '.git');
  if (kind(at) !== 'dir' || kind(own) !== 'dir' || kind(given) !== 'dir') return 'its .git is not a folder like the app folder\'s copy';
  for (const name of ['commondir', 'config.worktree', 'hooks']) {
    if (kind(path.join(own, name)) !== kind(path.join(given, name))) return `its .git/${name} is not the app folder's`;
  }
  if (kind(path.join(own, 'config')) !== 'file') return 'its git settings are not a plain file';
  const config = read(path.join(own, 'config'));
  if (!config || !config.equals(read(path.join(given, 'config')) ?? Buffer.alloc(0))) return 'its git settings differ from the app folder\'s copy';
  const hooks = (gitDir) => { try { return fs.readdirSync(path.join(gitDir, 'hooks')).sort(); } catch { return []; } };
  const mine = hooks(own);
  if (mine.join('\n') !== hooks(given).join('\n')) return 'its git hooks differ from the app folder\'s copy';
  for (const name of mine) {
    const file = path.join(own, 'hooks', name);
    if (kind(file) !== 'file' || !read(file)?.equals(read(path.join(given, 'hooks', name)) ?? Buffer.alloc(0))) return 'its git hooks differ from the app folder\'s copy';
  }
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === '.git') return path.relative(at, folder) || '.';
      if (entry.isDirectory() && !entry.isSymbolicLink()) { const found = walk(path.join(folder, entry.name)); if (found) return found; }
    }
    return null;
  };
  for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
    if (entry.name === '.git' || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const nested = walk(path.join(at, entry.name));
    if (nested) return `it holds a repository of its own at ${nested}`;
  }
  return null;
}

export function pushPrivateFolder(dir, { message, env = process.env, trusted = dir } = {}) {
  const rel = named(dir);
  const at = rel && path.join(dir, rel);
  if (!at || !fs.existsSync(path.join(at, '.git'))) return { pushed: false };
  const planted = plantedIn(at, path.join(trusted, rel));
  if (planted) return { pushed: false, why: `${rel} was left as it is, because ${planted}` };
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
