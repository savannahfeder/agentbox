import fs from 'node:fs';
import path from 'node:path';

// The .git / .env deny-list, shared by EVERY creation-file access point: the
// agent tools (main/agent/tools.mjs), the folder-backed materialize walk
// (main/creations/materialize.mjs, which re-exports these), the creation-file://
// protocol (main/index.mjs), and the single-file store SINK
// (readCreationContent/saveCreation in main/store/project.mjs). It lives HERE,
// the lowest-level path module both store/ and creations/ already import, so
// there is exactly ONE copy of the rules and no import cycle (store must not
// import up into creations/). A trailing-segment match on a DIRECTORY named
// e.g. .env.local blocks everything nested under it, not just a file literally
// named that.
export const GIT_PATH_RE = /(^|\/)\.git(\/|$)/;
export const ENV_PATH_RE = /(^|\/)\.env[^/]*(\/|$)/;

// Deny checks run on a normalized form: backslashes folded to forward slashes
// (assertInside treats both as separators) and lowercased, so a case-
// insensitive filesystem (the default on macOS/Windows) can never let
// `.Git/config` alias the real `.git` past a case-sensitive regex.
export function normalizeForDenyCheck(rel) {
  return String(rel).replace(/\\/g, '/').toLowerCase();
}

// True iff `rel` names a .git or .env path in ANY segment. null/undefined -> false.
// The single canonical predicate; other modules re-export it rather than
// duplicating the regexes.
export function deniesGitOrEnvPath(rel) {
  if (rel == null) return false;
  const norm = normalizeForDenyCheck(rel);
  return GIT_PATH_RE.test(norm) || ENV_PATH_RE.test(norm);
}

// Containment: resolve rel against root; realpath the nearest EXISTING
// ancestor so a symlinked directory cannot smuggle the path outside; reject
// a symlink as the final component (lstat). Throws on any violation, returns
// the absolute (real-ancestor-based) path on success.
export function assertInside(root, rel) {
  if (typeof rel !== 'string' || !rel) throw new Error('empty path');
  if (path.isAbsolute(rel)) throw new Error(`absolute path rejected: ${rel}`);
  if (rel.split(/[\\/]/).some((seg) => seg === '..')) throw new Error(`dot-dot rejected: ${rel}`);
  const realRoot = fs.realpathSync(root);
  const target = path.resolve(realRoot, rel);
  // nearest existing ancestor, realpathed, must stay inside
  let probe = target;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const realProbe = fs.realpathSync(probe);
  if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) {
    throw new Error(`path escapes project: ${rel}`);
  }
  try {
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error(`symlink rejected: ${rel}`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return target;
}

// Same check as a boolean, for canUseTool-style callers.
export function isInside(root, rel) {
  try { assertInside(root, rel); return true; } catch { return false; }
}

// A folder-backed creation's `dir` must be a real, non-empty subdirectory of
// creations/ (creations/<slug>), NEVER the creations root itself
// (dir: "creations", "creations/", "creations/.", ...) or some other project
// subtree (a run directory, the project root, ...). plain assertInside alone
// is not enough here: it only proves `dir` does not escape the PROJECT, not
// that it is a legitimate creation root, and every consumer that trusts
// envelope.dir as a creation root (read/write/list/delete a file inside it)
// must reject a bad one itself, not rely on validation having already run
// once when the envelope was first cataloged. A stale or externally-supplied
// envelope (e.g. merged in from a sync peer, or written before this check
// existed) must never grant access outside its own creation folder.
export function assertCreationDir(root, dir) {
  const rel = String(dir ?? '').replace(/\\/g, '/');
  const segments = rel.split('/').filter(Boolean);
  if (segments[0] !== 'creations' || segments.length < 2 || segments[1] === '.' || segments[1] === '..') {
    throw new Error(`unsafe creation dir (must be a real subdirectory of creations/): ${dir}`);
  }
  return assertInside(root, rel);
}
