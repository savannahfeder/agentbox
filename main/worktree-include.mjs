// The untracked local files a new task folder is given: dependencies, a `.env`,
// a machine's own config. A worktree holds only the commit, so without this
// they are missing.
//
// `.worktreeinclude` is the file Conductor and Claude Code already read: a file
// at the repository root in .gitignore syntax naming the ignored files to carry.
// Git matches the patterns (`git ls-files --others --ignored --exclude-from`),
// so negation, anchoring and globs behave exactly as git defines them.
//
// That command does not consult the repository's own .gitignore. A path it
// selects that the repository does not ignore would stay untracked in the
// folder, and `parkTaskFolder` runs `git add -A`, so closing the task would
// commit it, credentials included. Every selected path is therefore checked
// with `git check-ignore` in both checkouts.
//
// Every path that is not carried, and every link that cannot be vouched for,
// refuses the whole folder by name. Nothing is dropped quietly.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const INCLUDE_FILE = '.worktreeinclude';

/**
 * macOS `cp -c` asks APFS for a block-sharing clone. GNU `cp` has no `-c`;
 * `-a --reflink=auto` shares blocks where the filesystem can and copies where
 * it cannot. Lives here rather than in `main/task-folders.mjs`, the other
 * caller, because that file imports this one.
 */
export function copyTree(from, to) {
  const args = process.platform === 'darwin'
    ? ['-c', '-R', from, to]
    : ['-a', '--reflink=auto', from, to];
  execFileSync('cp', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/**
 * For a repository with no `.worktreeinclude`: the root's dependencies. No
 * trailing slash on purpose. `/node_modules/` matches directories only, so a
 * `node_modules` that is a symlink to a shared one would be skipped without a
 * word. Without the slash it is selected and then refused by name.
 */
export const DEFAULT_PATTERNS = ['/node_modules'];

/** The app's own task folders. They are ignored, so a pattern like `**` selects
 *  them, and carrying them would copy every other task into this one. */
const MANAGED = '.claude/worktrees';

const git = (cwd, args, input) => execFileSync('git', args, {
  cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
});

const patternsIn = (text) => text.split('\n')
  .map((line) => line.replace(/\r$/, ''))
  .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));

/**
 * An empty `.worktreeinclude` carries nothing rather than the default, so a
 * repository can ask for a bare folder. One that exists and cannot be read
 * throws rather than falling back to a guess.
 */
export function askedFor(root) {
  const file = path.join(root, INCLUDE_FILE);
  if (!fs.existsSync(file)) return { patterns: DEFAULT_PATTERNS, source: 'the default list' };
  try { return { patterns: patternsIn(fs.readFileSync(file, 'utf8')), source: INCLUDE_FILE }; }
  catch (error) { throw Error(`${INCLUDE_FILE} is there and could not be read: ${error.message}`); }
}

/**
 * `--directory` collapses a wholly untracked directory to one entry, so
 * node_modules is one `cp`. `-z` because a filename may contain a newline.
 */
export function localFilesIn(root) {
  const { patterns, source } = askedFor(root);
  if (!patterns.length) return { paths: [], patterns, source };
  const held = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-include-'));
  const file = path.join(held, 'patterns');
  try {
    fs.writeFileSync(file, `${patterns.join('\n')}\n`);
    const out = git(root, ['ls-files', '-z', '--others', '--ignored', '--directory', `--exclude-from=${file}`]);
    const paths = out.split('\0')
      .map((p) => p.replace(/\/$/, ''))
      .filter(Boolean)
      .filter(keepable);
    return { paths, patterns, source };
  } catch (error) {
    throw Error(`${source} could not be read against this checkout: ${String(error?.stderr ?? error?.message ?? '').trim()}`);
  } finally {
    try { fs.rmSync(held, { recursive: true, force: true }); } catch { /* a temp dir */ }
  }
}

/**
 * Exclusions no pattern can override: `.git` and the task folders. A path that
 * contains the task folders (`**` collapses to `.claude`) is dropped whole
 * rather than narrowed by a matcher of ours. A repository that needs one file
 * from `.claude` names it exactly, and that still comes through.
 */
function keepable(rel) {
  if (rel.split('/')[0] === '.git') return false;
  if (rel === MANAGED || rel.startsWith(`${MANAGED}/`)) return false;
  if (MANAGED.startsWith(`${rel}/`)) return false;
  return true;
}

/**
 * Which of these paths the checkout's own rules ignore. `git check-ignore`
 * exits 1 for "none of them"; any other failure throws rather than reading as
 * "not ignored".
 */
function ignoredIn(cwd, paths) {
  if (!paths.length) return new Set();
  try {
    const out = git(cwd, ['check-ignore', '-z', '--stdin'], `${paths.join('\0')}\0`);
    return new Set(out.split('\0').filter(Boolean));
  } catch (error) {
    if (error?.status === 1) return new Set();
    throw Error(`git could not say what this checkout ignores: ${String(error?.stderr ?? error?.message ?? '').trim()}`);
  }
}

/**
 * A path that cannot be looked at is not a path with nothing at it. ENOENT and
 * ENOTDIR are real absences; any other error throws, because these answers
 * decide whether something may be written through a link nobody inspected.
 * Pinned by tests/a-file-the-app-cannot-look-at-is-not-a-file-that-is-missing.test.mjs.
 */
function lookAt(p) {
  try { return fs.lstatSync(p); }
  catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw Error(`${p} could not be looked at: ${error.message}`);
  }
}

const isLink = (p) => lookAt(p)?.isSymbolicLink() === true;
/** On disk at all, including a link with nothing at the end of it. */
const stillThere = (p) => lookAt(p) !== null;

/**
 * Where a link points, or null if it went away (ENOENT) or is no longer a link
 * (EINVAL). A link that cannot be read cannot be judged, so that throws.
 */
function linkTarget(p) {
  try { return fs.readlinkSync(p); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EINVAL'].includes(error?.code)) return null;
    throw Error(`${p} is a link whose target could not be read: ${error.message}`);
  }
}

function reachedThroughALink(folder, rel) {
  let at = folder;
  for (const part of rel.split('/').slice(0, -1)) {
    at = path.join(at, part);
    if (isLink(at)) return true;
  }
  return false;
}

/**
 * Whether a path is under a folder, by its text only. `..` is checked as a
 * whole component so a directory named `..deps` is not read as a climb out.
 */
const climbsOut = (rel) => rel === '..' || rel.startsWith(`..${path.sep}`);
const within = (folder, abs) => {
  const rel = path.relative(folder, abs);
  return rel !== '' && !climbsOut(rel) && !path.isAbsolute(rel);
};
const withinOrIs = (folder, abs) => {
  const rel = path.relative(folder, abs);
  return !climbsOut(rel) && !path.isAbsolute(rel);
};

/**
 * The real path of the nearest ancestor on disk. This lets a dangling link be
 * judged: with a tracked `bridge -> /shared`, a carried link to
 * `../../bridge/newfile` dangles but would write into `/shared`.
 */
function nearestReal(abs) {
  let at = abs;
  for (;;) {
    if (stillThere(at)) {
      try { return fs.realpathSync(at); }
      catch (error) {
        // ENOENT means it went away between the two calls. Any other error
        // would skip the containment check, so it throws.
        if (error?.code === 'ENOENT') return null;
        throw Error(`${at} could not be followed: ${error.message}`);
      }
    }
    const up = path.dirname(at);
    if (up === at) return null;
    at = up;
  }
}

/**
 * Links in a carried entry that would let the folder write somewhere else, such
 * as `node_modules -> ../other-checkout/node_modules`, where an install rewrites
 * another folder's dependencies.
 *
 * An absolute link is never carried, even into this checkout, because after the
 * copy it still points at the original. A relative one is carried when it lands
 * inside the folder, as workspace links do. Every link in the subtree is checked,
 * because `node_modules/@scope/` hides links a level down. `find` does not follow
 * links while walking, so a link cannot lead the walk out.
 */
function linksThatDoNotHold(root, folder, rel) {
  const to = path.join(folder, rel);
  let found = [];
  try {
    // `find <path>` on a path that is itself a link reports that link, so an
    // entry that is a link gets the same check as the links inside a directory.
    found = execFileSync('find', [to, '-type', 'l', '-print0'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\0').filter(Boolean);
  } catch (error) {
    throw Error(`the links inside ${rel} could not be checked: ${String(error?.stderr ?? error?.message ?? '').trim()}`);
  }
  const bad = [];
  for (const link of found) {
    const name = path.relative(folder, link);
    const target = linkTarget(link);
    if (target === null) continue; // gone from under us, or no longer a link
    if (path.isAbsolute(target)) { bad.push({ path: name, why: 'it is a link to somewhere outside this folder' }); continue; }
    const resolved = path.resolve(path.dirname(link), target);
    // Checked even when the link dangles: the first write through a dangling
    // link to `../../../w-neighbour/newfile` lands in another task's folder.
    if (!within(folder, resolved)) { bad.push({ path: name, why: 'it is a link that leads out of this folder' }); continue; }
    // A path inside the folder can still arrive outside it through a link on
    // the way, and those links exist even when the last name does not.
    const home = nearestReal(folder);
    const reached = nearestReal(resolved);
    if (home && reached && !withinOrIs(home, reached)) {
      bad.push({ path: name, why: 'it is a link that leads out of this folder through another link' });
      continue;
    }
    if (fs.existsSync(resolved)) continue;
    // Dangling but contained. It is refused only if the copy broke it, meaning
    // the target exists in the checkout and was not carried. A link already
    // dangling in the checkout is left as it was.
    const sourceSide = path.resolve(path.dirname(path.join(root, name)), target);
    if (fs.existsSync(sourceSide)) bad.push({ path: name, why: 'it points at something that was not carried in with it' });
  }
  return bad;
}

/**
 * Carries the selected local files into a folder that has just been made.
 * A pattern that matches nothing is fine, since a repository may name a `.env`
 * this machine lacks. Anything else that cannot be carried throws, with every
 * path and reason, so the caller gets a complete folder or none.
 */
export function carryLocalFiles(root, folder) {
  const { paths, source } = localFilesIn(root);
  const theirs = ignoredIn(root, paths);
  const carried = [];
  const refused = [];
  const no = (rel, why) => refused.push({ path: rel, why });

  for (const rel of paths) {
    const from = path.join(root, rel);
    const to = path.join(folder, rel);
    if (!fs.existsSync(from) && !isLink(from)) continue; // it went away; silent
    if (!theirs.has(rel)) { no(rel, 'the repository does not ignore it, so carrying it in could commit it'); continue; }
    // The folder may be on a different commit from the checkout, where this
    // path is tracked.
    if (tracksIt(folder, rel)) { no(rel, 'this branch tracks it'); continue; }
    if (reachedThroughALink(folder, rel)) { no(rel, 'a link stands where it would have to be written'); continue; }
    if (fs.existsSync(to)) continue; // already there; silent
    if (isLink(from) && !carriableLink(root, from)) { no(rel, 'it is a link to somewhere outside the repository'); continue; }
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      copyTree(from, to);
    } catch (error) {
      no(rel, `it could not be copied: ${String(error?.stderr ?? error?.message ?? '').trim()}`);
      continue;
    }
    // Asked only after the copy: a trailing-slash pattern like `node_modules/`
    // matches directories only, so git answers "not ignored" for a path not on
    // disk yet. What the folder's branch does not ignore is removed again,
    // because closing the task runs `git add -A`.
    if (!ignoredIn(folder, [rel]).has(rel)) {
      try { fs.rmSync(to, { recursive: true, force: true }); } catch { /* best effort */ }
      no(rel, 'the branch in this folder does not ignore it, so closing the task would commit it');
      continue;
    }
    carried.push(rel);
  }

  // Links are judged only after every copy. `node_modules/thing ->
  // ../packages/thing` dangles until `packages`, listed later, is copied.
  for (const rel of carried) refused.push(...linksThatDoNotHold(root, folder, rel));

  if (refused.length) {
    throw Error(`${source} names files this folder could not be given:\n${
      refused.map((r) => `  ${r.path}: ${r.why}`).join('\n')}`);
  }
  return { carried, source };
}

/**
 * An entry that is itself a link, judged in the checkout before copying. The
 * check that matters runs in the folder after every copy; this one keeps an
 * obviously shared link from being copied at all.
 */
function carriableLink(root, abs) {
  const target = linkTarget(abs);
  if (target === null) return false;
  if (path.isAbsolute(target)) return false;
  const resolved = path.resolve(path.dirname(abs), target);
  if (!within(root, resolved)) return false;
  const home = nearestReal(root);
  const reached = nearestReal(resolved);
  return !home || !reached || withinOrIs(home, reached);
}

const tracksIt = (folder, rel) => {
  try { git(folder, ['ls-files', '--error-unmatch', '-z', '--', rel]); return true; }
  catch (error) { if (error?.status === 1) return false; throw Error(`git could not say whether this branch tracks ${rel}: ${String(error?.stderr ?? error?.message ?? '').trim()}`); }
};

/**
 * Clears untracked files a clone brought along, such as `renderer/dist` inside
 * a tracked top-level directory, so a cloned folder matches a checked-out one.
 * Runs before anything is carried in, so it never removes what was asked for.
 */
export function onlyTrackedContent(folder) {
  let found;
  try { found = git(folder, ['ls-files', '-z', '--others', '--directory', '--no-empty-directory']); }
  catch (error) { throw Error(`what is in this folder could not be listed: ${String(error?.stderr ?? error?.message ?? '').trim()}`); }
  const gone = [];
  for (const rel of found.split('\0').map((p) => p.replace(/\/$/, '')).filter(Boolean)) {
    if (!keepable(rel)) continue;
    const at = path.join(folder, rel);
    try { fs.rmSync(at, { recursive: true, force: true }); }
    // `lstat`, because existsSync follows links and would report a dangling
    // link that failed to be removed as gone.
    catch (error) { if (stillThere(at)) throw Error(`${rel} came with the clone and could not be cleared: ${error.message}`); }
    gone.push(rel);
  }
  return gone;
}

/**
 * The top-level entries holding tracked content, which the clone copies.
 * Anything else wanted arrives by name through `.worktreeinclude`.
 *
 * A submodule (mode 160000) stops the clone: copying it would hand the folder
 * another repository's git data, and `git worktree move` refuses a worktree
 * holding one. A plain `git worktree add` handles submodules.
 */
export function trackedTopLevel(root) {
  let listed;
  try { listed = git(root, ['ls-files', '-s', '-z']); }
  catch (error) { throw Error(`the tracked files could not be listed: ${String(error?.stderr ?? error?.message ?? '').trim()}`); }
  const top = new Set();
  for (const line of listed.split('\0').filter(Boolean)) {
    const [modes, rel] = line.split('\t');
    if (modes?.startsWith('160000')) return { entries: [], submodules: true };
    if (rel) top.add(rel.split('/')[0]);
  }
  return { entries: [...top], submodules: false };
}
