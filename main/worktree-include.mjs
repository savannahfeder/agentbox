// THE LOCAL FILES A NEW TASK FOLDER IS GIVEN, AND THE ONES IT IS REFUSED.
//
// A worktree is a fresh checkout, so it holds the commit and nothing else. Every
// file a repository needs that git does not track -- the dependencies, a `.env`,
// a key, a machine's own config -- is simply absent, and that is what people
// mean when they say agent worktrees are brittle. Measured on one Mac on
// 2026-10-07 (w-5952e6de3e): of the seven task folders then live, seven had
// node_modules because exactly one ignored path was ever carried, and five had
// no `zero.config.json`, so the app ran in them on fallback defaults.
//
// `.worktreeinclude` IS NOT OURS, AND THAT IS WHY IT WAS CHOSEN. It is a file at
// the repository root in .gitignore pattern syntax, naming the IGNORED files to
// carry into a new worktree. Conductor reads it; so does Claude Code. A
// repository already set up for either works here with nothing new to write.
//
// THE PATTERNS ARE MATCHED BY GIT, NEVER BY US. `git ls-files --others --ignored
// --exclude-from=<list>` answers with the files those patterns select, which gets
// comments, blank lines, anchoring, nested globs, directory patterns and `!`
// negation right by construction rather than by a matcher of ours that would
// drift. `--others` never lists tracked content, so a pattern naming a file the
// commit carries selects nothing.
//
// AND SELECTING IS NOT THE SAME AS BEING IGNORED, which cost a review to notice.
// That command means "untracked files matching THESE rules"; it does not consult
// the repository's own .gitignore at all. So a `.worktreeinclude` naming an
// untracked file that the repository does NOT ignore would have carried it in,
// where it stays untracked -- and `parkTaskFolder` runs `git add -A`, so closing
// the task would commit it. A credential named in this file would have been
// committed onto a branch. Every selected path is therefore put through
// `git check-ignore` IN BOTH CHECKOUTS, and anything the repository does not
// actually ignore is refused rather than carried (Codex's review, 2026-10-07).
//
// NOTHING IS DROPPED QUIETLY. Every path this module will not carry, and every
// link it cannot vouch for, refuses the folder and names itself. A folder
// quietly missing a file somebody asked for by name, or quietly sharing its
// dependencies with the checkout, is the exact fault this module exists to end,
// so it may not be the way this module fails.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The file a repository says what it needs in, at its root. */
export const INCLUDE_FILE = '.worktreeinclude';

/**
 * ONE COPY, THE PLATFORM'S OWN, FOR EVERY TREE EITHER FILE MOVES.
 *
 * macOS `cp -c` asks APFS for a block-sharing clone. GNU `cp` has no `-c` at
 * all and would simply fail; `-a --reflink=auto` shares blocks where the
 * filesystem can do it and copies where it cannot, which is the same bargain.
 * The inbox runs on Linux too (origin/main, bec6d92), so a hardcoded `-c` is a
 * copy that cannot work there.
 *
 * It lives in this file rather than in `main/task-folders.mjs`, which is the
 * other caller, because that file imports this one and the reverse would be a
 * circle.
 */
export function copyTree(from, to) {
  const args = process.platform === 'darwin'
    ? ['-c', '-R', from, to]
    : ['-a', '--reflink=auto', from, to];
  execFileSync('cp', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/**
 * What a repository that has never heard of this gets: its dependencies, which
 * is exactly what was carried before, so nothing is worse off for not asking.
 *
 * Anchored, because the old behaviour was the root's `node_modules` and not every
 * `node_modules` anywhere in the tree. And WITHOUT the trailing slash, which is
 * not cosmetic: measured 2026-10-07, `/node_modules/` matches a directory and
 * nothing else, so a `node_modules` that is really a SYMLINK to a shared one is
 * not selected, not carried, and -- the part that matters -- not reported either.
 * Without the slash it is selected, and then refused by name.
 */
export const DEFAULT_PATTERNS = ['/node_modules'];

/**
 * Where the app's own task folders live, which may never be carried into one.
 * It is ignored (the app ignores it itself), so a pattern as broad as `**`
 * selects it, and carrying it would copy every other task's folder into this
 * one. Said as a constant because it is the single unconditional exclusion.
 */
const MANAGED = '.claude/worktrees';

const git = (cwd, args, input) => execFileSync('git', args, {
  cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
});

/** Lines that are a pattern: not blank, not a comment. */
const patternsIn = (text) => text.split('\n')
  .map((line) => line.replace(/\r$/, ''))
  .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));

/**
 * What this repository asks for.
 *
 * A FILE THAT EXISTS AND SELECTS NOTHING CARRIES NOTHING. Present and empty is a
 * decision, not an absence: without that there is no way to say "give me a bare
 * folder", and a repository that deliberately wants its dependencies installed
 * fresh would be overruled by our default.
 *
 * A file that exists and cannot be READ is an error and not a default. Falling
 * back there would answer "we could not find out what you need" with "here is
 * what we guessed", which is the shape of every bug in this module's history.
 */
export function askedFor(root) {
  const file = path.join(root, INCLUDE_FILE);
  if (!fs.existsSync(file)) return { patterns: DEFAULT_PATTERNS, source: 'the default list' };
  try { return { patterns: patternsIn(fs.readFileSync(file, 'utf8')), source: INCLUDE_FILE }; }
  catch (error) { throw Error(`${INCLUDE_FILE} is there and could not be read: ${error.message}`); }
}

/**
 * The paths those patterns select in this checkout, as git sees them.
 *
 * `--directory` collapses a wholly untracked directory to one entry, which turns
 * a node_modules of sixty thousand files into a single `cp`. `-z` because a
 * newline is a legal character in a filename and this list decides what is
 * copied.
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
 * THE EXCLUSIONS NO PATTERN CAN OVERRIDE.
 *
 * `.git` is the repository, and the folder other tasks live in is other tasks'
 * work. A selected path that CONTAINS the managed folder is dropped whole rather
 * than picked apart: `**` collapses to `.claude`, and narrowing that by hand
 * would be a second matcher to get wrong. A repository that needs one file from
 * in there names it exactly, and an exact name is not an ancestor of the managed
 * folder, so it still comes through.
 */
function keepable(rel) {
  if (rel.split('/')[0] === '.git') return false;
  if (rel === MANAGED || rel.startsWith(`${MANAGED}/`)) return false;
  if (MANAGED.startsWith(`${rel}/`)) return false;
  return true;
}

/**
 * Which of these paths the repository's OWN rules ignore, asked in whichever
 * checkout is passed. Exit 1 means "none of them", which is an answer and not a
 * failure; anything else is a failure and is thrown, because treating a broken
 * git call as "not ignored" silently stops carrying everything.
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
 * WHAT IS AT THIS PATH, AND "WE COULD NOT LOOK" IS NOT "NOTHING IS THERE".
 *
 * Every `lstat` here used to be wrapped in a bare `catch` that answered false,
 * so a path the app has no permission to look at read exactly like a path with
 * nothing at it. Both of the questions below are asked to decide whether
 * something may be written, and answering them from an error nobody saw is how
 * a folder gets built through a link that was never inspected. ENOENT and
 * ENOTDIR are real absences: the name is not there, or a name on the way to it
 * is a file, and either way nothing can be. Anything else is this folder
 * failing to be made, which `carryLocalFiles` reports on the row.
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
 * Where a link points, with the same division. ENOENT is the link going away
 * under us and EINVAL is the path not being a link at all, which are both
 * ordinary; a link we are not allowed to read is a link we cannot judge, and
 * carrying one of those in unexamined is the whole risk this module manages.
 */
function linkTarget(p) {
  try { return fs.readlinkSync(p); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EINVAL'].includes(error?.code)) return null;
    throw Error(`${p} is a link whose target could not be read: ${error.message}`);
  }
}

/** Is any directory on the way to this path a link? Then nothing may be written through it. */
function reachedThroughALink(folder, rel) {
  let at = folder;
  for (const part of rel.split('/').slice(0, -1)) {
    at = path.join(at, part);
    if (isLink(at)) return true;
  }
  return false;
}

/**
 * Is this path under that folder, as a path, saying nothing about what is there?
 *
 * `..` IS A COMPONENT AND NOT A PREFIX. `startsWith('..')` reads a directory
 * honestly named `..deps` as a climb out of the folder, and refused the whole
 * task over it (Codex's review, 2026-10-07).
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
 * The nearest ancestor of this path that is really on disk, with every link on
 * the way to it followed.
 *
 * THIS IS WHAT MAKES A DANGLING LINK SAFE TO JUDGE. A target that does not exist
 * cannot be resolved, and skipping the check for those left a hole: with a
 * TRACKED `bridge -> /somewhere/shared` in the commit, a carried
 * `node_modules/pkg/cache -> ../../bridge/newfile` looks like a path inside the
 * folder, dangles, and the first write through it creates a file in the shared
 * directory. The last component being absent says nothing about the ones before
 * it, so the ones before it are the ones resolved.
 */
function nearestReal(abs) {
  let at = abs;
  for (;;) {
    if (stillThere(at)) {
      try { return fs.realpathSync(at); }
      catch (error) {
        // It was there a moment ago, so the only ordinary answer left is that
        // it went away between the two calls. Anything else is a path this
        // process cannot follow, and a containment check skipped because the
        // answer was unreadable is a containment check that did not happen.
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
 * A LINK OUT OF THE FOLDER IS NOT ISOLATION, IT IS THE OPPOSITE.
 *
 * Measured on one Mac, 2026-10-07: a hand-made worktree beside the checkout had
 * `node_modules -> ../agentbox-team/node_modules`, so an install in it rewrote
 * the dependencies of every other folder pointing at that target. Carrying such
 * a link forward recreates exactly that, in a folder whose whole purpose is that
 * nothing it does reaches anybody else.
 *
 * An ABSOLUTE link is never carried, even one pointing inside this very
 * checkout, because absolute is precisely what survives the move into place and
 * keeps pointing at the original. A RELATIVE one is carried when it still lands
 * inside the folder, which is what a workspace link is for: after the move it
 * points at the folder's own copy.
 *
 * EVERY LINK IN THE SUBTREE IS LOOKED AT, not just the top ones. One level of
 * children was tried first and is not enough: `node_modules/@scope/package` is
 * an ordinary layout, and a scope directory hides every link under it. `find`
 * does not follow links while walking, so a link cannot be used to escape the
 * walk either.
 */
function linksThatDoNotHold(root, folder, rel) {
  const to = path.join(folder, rel);
  let found = [];
  try {
    // `find <path>` on a path that is itself a link reports that link, so an
    // entry which IS a link is checked by the same walk as the links inside a
    // directory. That is not incidental: an entry that was a link got no
    // destination check at all while this gated on the entry being a directory.
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
    // CONTAINMENT IS CHECKED WHETHER OR NOT ANYTHING IS THERE. A link pointing
    // out of the folder is a way out of the folder even while it dangles:
    // `node_modules/pkg/out -> ../../../w-neighbour/newfile` points into the
    // folder the NEXT TASK is working in, and the first thing written through it
    // lands in that task's work. Checking only when the target exists let that
    // through (Codex's review, 2026-10-07).
    if (!within(folder, resolved)) { bad.push({ path: name, why: 'it is a link that leads out of this folder' }); continue; }
    // AND THE LINKS ON THE WAY TO IT, WHICH DANGLING DOES NOT EXCUSE. A path
    // inside the folder can still arrive outside it through a link on the way,
    // and the links on the way exist even when the last name does not.
    const home = nearestReal(folder);
    const reached = nearestReal(resolved);
    if (home && reached && !withinOrIs(home, reached)) {
      bad.push({ path: name, why: 'it is a link that leads out of this folder through another link' });
      continue;
    }
    if (fs.existsSync(resolved)) continue;
    // Dangling, and everything on the way to it is this folder's, so nothing it
    // reaches can be anybody else's. Only our business if the copy BROKE it,
    // which means the target was there in the checkout and was left behind.
    const sourceSide = path.resolve(path.dirname(path.join(root, name)), target);
    if (fs.existsSync(sourceSide)) bad.push({ path: name, why: 'it points at something that was not carried in with it' });
    // A link that was already dangling where it came from is left exactly as it
    // was found. It is the checkout's own state, not something this made.
  }
  return bad;
}

/**
 * Carry the selected local files into a folder that has just been made.
 *
 * `cp -c` asks APFS for a block-sharing clone: measured 2026-09-22, this
 * repository's 929 MB of dependencies took 2.9 seconds and moved the volume's
 * free space by nothing at all, because the blocks are shared until something
 * writes.
 *
 * A PATTERN THAT MATCHES NOTHING IS SILENT, and it is the only silence here: a
 * repository may name a `.env` that this machine does not have. Everything else
 * that will not or cannot be carried THROWS, with every path and reason in the
 * message, because the caller's only honest options are a complete folder or no
 * folder, and a list of reasons is what makes the second one actionable.
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
    // IGNORED BY THE REPOSITORY ITSELF, on both sides. Being named in
    // `.worktreeinclude` is not enough: an untracked file the repository does not
    // ignore stays untracked in the folder, and closing the task commits it.
    if (!theirs.has(rel)) { no(rel, 'the repository does not ignore it, so carrying it in could commit it'); continue; }
    // NEVER OVER THE COMMIT. The patterns cannot select tracked content in the
    // checkout beside us, but the folder may stand on a DIFFERENT commit, and a
    // path this branch tracks is content rather than a local file.
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
    // AND IGNORED HERE TOO, ASKED NOW IT IS HERE. This cannot be asked before
    // the copy: `node_modules/` with a trailing slash is the way nearly every
    // repository writes it, and a trailing slash matches directories only, so
    // git cannot match a path that is not on disk yet and answers "not ignored"
    // for every one of them. Asked after, the answer is the real one. A file the
    // folder's own branch would not ignore is taken straight back out, because
    // closing the task runs `git add -A` and would commit it.
    if (!ignoredIn(folder, [rel]).has(rel)) {
      try { fs.rmSync(to, { recursive: true, force: true }); } catch { /* best effort */ }
      no(rel, 'the branch in this folder does not ignore it, so closing the task would commit it');
      continue;
    }
    carried.push(rel);
  }

  // EVERY COPY FIRST, AND ONLY THEN THE LINKS, because a link is a statement
  // about the finished folder. Checking each entry as it landed refused a
  // perfectly good repository: with `node_modules` and `packages` both asked for
  // and `node_modules/thing -> ../packages/thing`, git lists `node_modules`
  // first, so the link was judged against a folder that did not have `packages`
  // in it yet, found dangling, and refused -- and nothing ever cleared that when
  // `packages` arrived a moment later. No task in such a repository could have
  // started (Codex's review, 2026-10-07).
  for (const rel of carried) refused.push(...linksThatDoNotHold(root, folder, rel));

  if (refused.length) {
    throw Error(`${source} names files this folder could not be given:\n${
      refused.map((r) => `  ${r.path}: ${r.why}`).join('\n')}`);
  }
  return { carried, source };
}

/**
 * An entry that is itself a link, judged where it came FROM: relative, and
 * landing back inside the repository. The same link is judged again in the
 * folder once everything has been copied, which is the check that matters;
 * this one keeps an obviously shared one from being copied at all.
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
 * THE FOLDER IS THE COMMIT, PLUS WHAT WAS ASKED FOR, AND NOTHING ELSE.
 *
 * The clone copies whole top-level directories, so an ignored build output
 * living inside a tracked one (`renderer/dist`) rides along. That used to be the
 * difference between the two ways of making a folder: the clone carried every
 * untracked file in the checkout and the ordinary checkout carried one. Two
 * folders that are not the same thing is the bug underneath "worktrees don't
 * work", so the extras are cleared and the asked-for files are put back by name.
 *
 * Run BEFORE anything is carried in, so it can never remove what was asked for.
 * A failure throws: leaving an extra behind would quietly hand one folder
 * something another did not get, which is the difference being removed.
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
    // `lstat` and not `existsSync`: existsSync follows a link, so a DANGLING
    // link still sitting there reads as absent and the failure to remove it
    // would be reported as a success.
    catch (error) { if (stillThere(at)) throw Error(`${rel} came with the clone and could not be cleared: ${error.message}`); }
    gone.push(rel);
  }
  return gone;
}

/**
 * The top-level entries the clone has to copy: the ones holding tracked content.
 * Everything else in the checkout is either ignored or somebody's scratch, and
 * whichever of it is wanted arrives by name through `.worktreeinclude`.
 *
 * A SUBMODULE STOPS THE CLONE ALTOGETHER. `ls-files` reports one as mode 160000,
 * a pointer rather than a directory of files, and copying whatever is on disk
 * there hands the folder another repository's administration rather than its own.
 * `git worktree move` also refuses a worktree holding one. The ordinary checkout
 * knows what a submodule is, so a repository with any is left to it.
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
