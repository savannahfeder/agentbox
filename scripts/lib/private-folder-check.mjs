// What the ship checks before running git in a task's private checkout. Reads
// files only.

import fs from 'node:fs';
import path from 'node:path';

/** The private folder `dir/.agentbox/private.json` names, relative to `dir`, or null. */
export function named(dir) {
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
export function plantedIn(at, trusted) {
  const own = path.join(at, '.git');
  const given = path.join(trusted, '.git');
  if (kind(at) !== 'dir' || kind(own) !== 'dir' || kind(given) !== 'dir') return 'its .git is not a folder like the app folder\'s copy';
  for (const name of ['commondir', 'config.worktree', 'hooks']) {
    if (kind(path.join(own, name)) !== kind(path.join(given, name))) return `its .git/${name} is not the app folder's`;
  }
  for (const name of ['commondir', 'config.worktree']) {
    const mine = read(path.join(own, name));
    if (mine && !mine.equals(read(path.join(given, name)) ?? Buffer.alloc(0))) return `its .git/${name} is not the app folder's`;
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
  // A Mac's and a Windows disk hand git `.GIT`, `.git.` or the short name `GIT~1` when it asks for `.git`.
  const isGit = (name) => name.toLowerCase().replace(/[. ]+$/, '') === '.git' || /^git~\d+$/i.test(name);
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (isGit(entry.name)) return path.relative(at, folder) || '.';
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
