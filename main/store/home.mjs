// THE APP'S OWN HOME, so nothing Agentbox generates lands in the folder a worker
// is standing in.
//
// WHY THIS FILE EXISTS. A new user uploaded a file into her product folder,
// watched a worker create a directory and delete things next to it, and asked
// why it needed to.
//
// MEASURED on her Mac 2026-08-24 and again 2026-08-26: Claude Code writes
// nothing into a working directory. Per-project state goes to
// `~/.claude/projects/<encoded path>/`, pasted files to `~/.claude/paste-cache`,
// edit history to `~/.claude/file-history`. Codex does the same under `~/.codex`.
// Agentbox did the opposite: a product with no code repo registered makes the
// product docs directory the worker's own cwd (main/supervisor.mjs), which is
// every new user's first product, and our ledger, session traces, run records
// and repeat rules all sat in it.
//
// So this is the same convention, one name over: a dot-folder in her home
// named after this app. On Linux a fresh install does not get that dot-folder,
// and it does not get a visible folder of the app's name in $HOME. Application
// data belongs in $XDG_DATA_HOME (see defaultStoreRoot). An existing dot-folder
// is still read, so a store already on disk is not orphaned.
//
// WHAT MOVES AND WHAT DOES NOT, because the line is not "everything of ours".
// The app's own RECORDS move: the work item ledger, session traces, run
// records, repeat rules, parked writes. What DESCRIBES THE FOLDER ITSELF stays
// in it: `project.json` says this directory is a product at all, `index.json`
// catalogs the founder's own documents by their paths inside it, and `.lock`
// guards that catalog. A folder you could copy to another Mac and still open is
// worth more than four fewer files, and none of those three is what a worker
// scribbles.
//
// WHAT THIS DOES NOT DO, said out loud so nobody reads it as more than it is.
// It does not make the ledger unforgeable. A worker with Bash reaches that
// folder exactly as easily as it reaches its own cwd. Claude Code has the
// identical property and does not pretend otherwise. This moves our files out
// of her folder; the grant that used to ride on the ledger is dealt with
// separately, by not keeping it on the ledger at all (main/answer-modes.mjs).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Name, WAS, envNames, nameSlug, readEnv } from '../../shared/product-name.mjs';

const isDir = (dir) => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } };

/**
 * THE STORE ROOT AS ENVIRONMENT, FOR EVERY PROCESS WE START, UNDER EVERY NAME
 * THIS APP HAS HAD.
 *
 * `appHome` above reads the old names, so anything shipped in this repo finds
 * the root whichever spelling it is given. What is NOT in this repo does not:
 * the store MCP server of an older install, her own launchd jobs, a script she
 * wrote. Those read the one variable they were written against, and a worker
 * whose store root is missing writes its whole session to nowhere, which is the
 * 2026-08-05 failure exactly.
 *
 * So both are exported. It costs one string per spawn and it makes the rename
 * invisible to everything outside this checkout.
 */
export function storeRootEnv(storeRoot) {
  const env = {};
  for (const key of envNames('HOME')) env[key] = storeRoot;
  return env;
}

// Where a config that names no store keeps the inbox.
//
// macOS, and anything that is not Linux: a folder of the app's name in the
// home directory. That is the folder this app has used since 2026-09-22.
// Linux: $XDG_DATA_HOME/<slug>, or ~/.local/share/<slug> when the variable is
// unset, blank, or not an absolute path. A visible directory in $HOME is not
// where an application writes. Measured 2026-10-07: a config that named no
// store created one.
//
// The home and the environment are arguments so a test can ask about another
// machine. A caller that passes a stand-in home must pass an environment that
// belongs to it. This function does not decide that; it uses the env it is given.
export function defaultStoreRoot({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  if (platform !== 'linux') return path.join(home, Name);
  const given = typeof env?.XDG_DATA_HOME === 'string' ? env.XDG_DATA_HOME.trim() : '';
  const base = given && path.isAbsolute(given) ? given : path.join(home, '.local', 'share');
  return path.join(base, nameSlug);
}

// One env var, for tests and for anyone who keeps their home somewhere else.
// Read at call time rather than captured, because a test sets it per case.
//
// THE NAME IS READ HERE AND THE OLD NAMES STILL ANSWER. This was a literal
// `ASTRAL_HOME` and a literal `.astral`, two renames after the app stopped
// being called that, so both go through the name module now. The fallbacks are
// not politeness: a launchd job, a login shell and any process started before a
// rename still export the old variable, and a dot-folder written under an old
// name holds a real store. The current name wins when both are there;
// otherwise the newest old name that is actually on disk does, so nobody's
// store goes missing on the release that renames the app.
// `homeDir` is injected so a test can ask what this answers on a machine with
// an old dot-folder on it, without one having to exist on the machine running
// the test. `platform` and `env` are the same kind of injection: this suite
// runs on a Mac and still has to answer a Linux home. Production passes neither.
export function appHome(homeDir = os.homedir(), { platform = process.platform, env } = {}) {
  const override = readEnv('HOME', env);
  if (override) return override;
  const here = path.join(homeDir, `.${nameSlug}`);
  if (isDir(here)) return here;
  for (const was of WAS) {
    const older = path.join(homeDir, `.${was.toLowerCase()}`);
    if (isDir(older)) return older;
  }
  // A fresh Linux directory has nothing of ours on disk yet. The answer has to
  // be the same path loadConfig opens, or the desktop and this lookup write two
  // stores. The machine's own XDG_DATA_HOME is an absolute path in the real
  // home; applying it to a stand-in home writes that stand-in's store there.
  // A caller that passes `env` is asking about that environment, not this one.
  if (platform === 'linux') {
    const real = env === undefined && path.resolve(homeDir) === path.resolve(os.homedir());
    return defaultStoreRoot({ home: homeDir, platform: 'linux', env: real ? process.env : (env ?? {}) });
  }
  return here;
}

// Claude Code's own encoding, checked against a real folder on her Mac:
// `/Users/you/Zero/accounts/00000.../agentbox` becomes
// `-Users-you-Zero-accounts-00000...-agentbox`. Every character that is not
// a letter or a digit becomes a dash, which is readable at a glance and safe on
// every filesystem.
export function encodeProjectPath(dir) {
  return String(dir).replace(/[^A-Za-z0-9]/g, '-');
}

// The one thing that encoding cannot do: `/a/b.c` and `/a/b/c` encode the same.
// Claude Code lives with that. We do not, because two products sharing one
// ledger would silently merge two founders' inboxes, so the folder carries the
// path it belongs to and a mismatch takes a short hash suffix instead.
const ORIGIN = '.origin';

function readOrigin(dir) {
  try { return fs.readFileSync(path.join(dir, ORIGIN), 'utf8').trim(); } catch { return null; }
}

/**
 * A MACHINERY DIRECTORY IS NOT A PROJECT DIRECTORY, and everything below has to
 * know the difference before it moves a byte.
 *
 * MEASURED on her Mac 2026-09-23 at 15:31:26, because this is not a hypothesis.
 * A session wrote a throwaway script to count stranded rows, listed
 * `<home>/projects`, and handed each of those directories to `readWorkItems` as
 * if it were a product folder. `readWorkItems` asks for the ledger, the ledger
 * asks for the machinery directory, and the machinery directory of a machinery
 * directory is a SECOND one nested inside the home. Then the sweep below did
 * what it is for and carried the ledger, the session traces, the run records,
 * the repeat rules and the parked writes one level down into it. Thirty eight
 * products in two seconds, and her inbox read empty until the folders were
 * carried back at 15:58.
 *
 * Nothing about that was exotic. Any agent with a shell can write that script,
 * and reading is supposed to be the safe thing to do. So the refusal lives
 * HERE, in the one place every caller passes through, rather than in a rule
 * about how to write scripts that nobody reading this will have been told.
 *
 * The test is the path itself: anything inside `<home>/projects` is ours
 * already. A product folder can never be one, because products live under the
 * account root and the home is a separate tree.
 */
export function isMachineryDir(dir, home = appHome()) {
  const root = path.resolve(path.join(home, 'projects'));
  return path.resolve(dir).startsWith(root + path.sep);
}

/** `<home>/projects/<encoded>` for this project directory. Creates nothing. */
export function machineryDir(projectDir, home = appHome()) {
  const real = path.resolve(projectDir);
  // Already ours: it is its own answer. Encoding it a second time is the
  // 2026-09-23 fold, and returning it unchanged makes the mistake harmless
  // rather than silent, because a caller that guessed this path still gets the
  // right ledger back.
  if (isMachineryDir(real, home)) return real;
  const base = path.join(home, 'projects', encodeProjectPath(real));
  const claimed = readOrigin(base);
  if (claimed === null || claimed === real) return base;
  const tag = crypto.createHash('sha256').update(real).digest('hex').slice(0, 8);
  return `${base}-${tag}`;
}

// EVERY NAME THAT IS OURS, so the move is ONE event rather than a slow leak.
//
// A path-by-path migration was the first shape and it is wrong for what this is
// FOR. It moves a file the first time something asks for it, so the ledger goes
// the moment the inbox opens and `sessions/` goes one item at a time, whenever a
// trace happens to be read, which for a row nobody opens again is never.
// Measured on her folder 2026-08-26: 1,785 of the 1,830 files that leave are
// session traces. Lazily she would still be looking at nearly all of it. The
// point is that her folder is clean, so all of it goes at once, the first time
// this process touches the product.
export const MACHINERY = ['work-items.jsonl', 'repeats.jsonl', 'sessions', 'runs', 'pending-writes'];

// THE TWO OF OUR NAMES THAT ARE APPEND-ONLY LOGS. A stray one of these holds
// lines the real file never got, so it is folded ONTO THE END of the real file
// rather than moved over it. Everything else here is a whole file that stands
// on its own.
const LOGS = new Set(['work-items.jsonl', 'repeats.jsonl']);

/**
 * The same directory, existing, with its origin marker written once, and every
 * record of ours carried in.
 *
 * THE SWEEP RUNS ON EVERY CALL, NOT ONCE PER PROCESS. It used to run once,
 * behind a `Set`, and `machineryPath` below only adopted a name when there was
 * NOTHING at the new place. Between them that meant the move happened exactly
 * once, and one of our files that appeared in her folder afterwards was never
 * picked up again: nothing read it, nothing moved it, and it sat there.
 *
 * MEASURED on her real folder the day the move landed, not reasoned about: two
 * release lines for two different cards written into a stray `work-items.jsonl`
 * at 14:10 and never folded in, and two run records stranded under `runs/`. So
 * this is not a theoretical window, it is where her folder actually was.
 *
 * The cost of running it every time is one stat per name against a path that is
 * normally absent. Five syscalls that find nothing is cheaper than being wrong,
 * and being wrong here is silent.
 */
export function ensureMachineryDir(projectDir, home = appHome()) {
  const dir = machineryDir(projectDir, home);
  fs.mkdirSync(dir, { recursive: true });
  // THE SWEEP IS WHAT DID THE DAMAGE, so it does not run on a directory that is
  // already ours. `machineryDir` hands back its own argument in that one case,
  // and there is nothing to carry across from a folder into itself. The origin
  // marker is left alone too: it names the product this machinery belongs to,
  // and overwriting it with the machinery's own path is how the folded copies
  // came to claim themselves.
  if (dir === path.resolve(projectDir)) return dir;
  if (readOrigin(dir) === null) {
    try { fs.writeFileSync(path.join(dir, ORIGIN), `${path.resolve(projectDir)}\n`); } catch { /* best effort */ }
  }
  for (const rel of MACHINERY) foldStray(path.join(projectDir, rel), path.join(dir, rel), rel);
  return dir;
}

/**
 * One of our names, wherever it has turned up in her folder, carried across to
 * where it belongs. NOTHING IS EVER DESTROYED HERE.
 *
 * The rules, in the order they apply:
 *
 *   - Nothing there: return. This is the ordinary case and it costs one stat.
 *   - Nothing at the target yet: rename it across whole, which is what the
 *     first move has always done.
 *   - Both directories: merge them entry by entry by these same rules, then
 *     drop the stray directory once the merge has emptied it.
 *   - Both append-only logs: append the stray's bytes onto the real file and
 *     delete the stray. Never the other way round; the real file is the one
 *     with the history in it.
 *   - Both ordinary files: the newer takes the name and the older is kept
 *     beside it as `<name>.superseded-<mtime>` rather than deleted. That is the
 *     run record case, and it is rare on purpose, because the writer of those
 *     now writes straight here (main/code-change.mjs). A conflict only happens
 *     while a process started before the move is still running.
 */
export function foldStray(from, to, rel = path.basename(to)) {
  let stray;
  try { stray = fs.statSync(from); } catch { return false; }

  let landed;
  try { landed = fs.statSync(to); } catch { return adoptLegacy(from, to); }

  if (stray.isDirectory() && landed.isDirectory()) {
    let entries = [];
    try { entries = fs.readdirSync(from); } catch { return false; }
    for (const name of entries) foldStray(path.join(from, name), path.join(to, name), name);
    // Only if the merge emptied it. A directory with anything left in it holds
    // something we did not understand, and it stays where it is.
    try { fs.rmdirSync(from); } catch { /* not empty, or gone already */ }
    return true;
  }

  // A directory on one side and a file on the other is not a case we have a
  // right answer for, so the stray is left alone and it is said out loud.
  if (stray.isDirectory() !== landed.isDirectory()) {
    console.warn(`${nameSlug}: ${from} and ${to} are not the same kind of thing; leaving the first alone`);
    return false;
  }

  if (LOGS.has(rel)) {
    try {
      const lines = fs.readFileSync(from);
      if (lines.length) fs.appendFileSync(to, lines);
      fs.rmSync(from, { force: true });
      return true;
    } catch (err) {
      console.warn(`${nameSlug}: could not fold ${from} into ${to}: ${err.message}`);
      return false;
    }
  }

  try {
    if (stray.mtimeMs > landed.mtimeMs) {
      fs.renameSync(to, `${to}.superseded-${Math.round(landed.mtimeMs)}`);
      fs.renameSync(from, to);
    } else {
      fs.renameSync(from, `${to}.superseded-${Math.round(stray.mtimeMs)}`);
    }
    return true;
  } catch (err) {
    console.warn(`${nameSlug}: could not carry ${from} across: ${err.message}`);
    return false;
  }
}

/**
 * Where one of our records lives for this project, and the migration that gets
 * it there.
 *
 * THE MOVE HAPPENS ONCE, and `ensureMachineryDir` above has already done it by
 * the time this returns: anything still sitting in the product folder under one
 * of our names is RENAMED into the home. A rename on the same volume is atomic
 * and costs nothing, whether it is a 6 MB ledger or a directory of 1,785 session
 * traces, and it is undone by moving the file back.
 *
 * It is a move rather than a read-both-write-new because the ledger is an
 * append-only log: two halves of one log in two places is not a store, it is
 * two stores that disagree. Everything that reads it must therefore agree about
 * where it is, which is why the MCP server ships the same file.
 *
 * Races are ordinary here: a dozen processes may call this at once. Every
 * failure mode of the rename is benign and is swallowed — ENOENT means there
 * was nothing to move, EEXIST/ENOTEMPTY means somebody else moved it first.
 */
export function machineryPath(projectDir, rel, home = appHome()) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
    throw new Error(`unsafe machinery path: ${rel}`);
  }
  const dir = ensureMachineryDir(projectDir, home);
  const target = path.join(dir, rel);
  if (!fs.existsSync(target)) adoptLegacy(path.join(projectDir, rel), target);
  return target;
}

/**
 * RECORDS A COPY WROTE UNDER THE WRONG HOME, CARRIED TO ITS OWN.
 *
 * The headless door (main/serve.mjs) used to open the store without pointing
 * the app's home at `storeRoot`, so it wrote its ledgers under whatever home it
 * inherited: `~/.agentbox` for `npx agentbox-app`, and on the test Mac
 * 2026-10-01 the founder's own store, because the copies were started from an
 * agent session. Its workers were handed `storeRoot`, found nothing there, and
 * answered "no work item" to every store call. Pointing the home at `storeRoot`
 * fixes the next write; this is what keeps the rows already written from
 * vanishing on the first boot after the fix.
 *
 * ONLY WHAT IS PROVABLY THIS STORE'S MOVES. A machinery directory names the
 * product it belongs to in `.origin`; one is carried only when that product is
 * inside `storeRoot`. Everything else under `fromHome` is somebody else's
 * store and is not touched. Each record goes through `foldStray`, so a ledger
 * is appended rather than overwritten and nothing is ever destroyed; the old
 * directory is removed only once nothing but its marker is left in it.
 *
 * Returns the product folders whose records were carried.
 */
export function carryMisplacedMachinery(fromHome, storeRoot, toHome = storeRoot) {
  if (!fromHome || !storeRoot) return [];
  const from = path.resolve(fromHome);
  if (from === path.resolve(toHome)) return [];
  const inside = path.resolve(storeRoot) + path.sep;
  let names = [];
  try { names = fs.readdirSync(path.join(from, 'projects')); } catch { return []; }
  const carried = [];
  for (const name of names) {
    const dir = path.join(from, 'projects', name);
    const origin = readOrigin(dir);
    if (!origin || !path.resolve(origin).startsWith(inside)) continue;
    const target = ensureMachineryDir(origin, toHome);
    for (const rel of MACHINERY) foldStray(path.join(dir, rel), path.join(target, rel), rel);
    let left = [];
    try { left = fs.readdirSync(dir); } catch { /* gone already */ }
    if (left.length === 1 && left[0] === ORIGIN) {
      try { fs.rmSync(path.join(dir, ORIGIN)); fs.rmdirSync(dir); } catch { /* best effort */ }
    }
    carried.push(origin);
  }
  return carried;
}

/**
 * EVERY RECORD OF OURS FOR ONE PROJECT, GONE.
 *
 * This exists for exactly one caller: the practice project, which the founder
 * has now ruled must not survive its own tutorial. Deleting the folder in her
 * store and leaving the ledger, the session traces and the run records behind
 * would be a half removal, and it is the half nobody can see: MEASURED on her
 * real Mac 2026-08-28, the practice folder in her account held two files and
 * the machinery for it held 168 ledger lines and 29 session traces from six
 * walks.
 *
 * IT WILL ONLY EVER DELETE A DIRECTORY THAT SAYS IT BELONGS TO THIS PROJECT.
 * `.origin` is written by `ensureMachineryDir` on first use and holds the
 * resolved path of the project the directory is the machinery for; this refuses
 * unless it is there and it matches. A directory with no `.origin` is one we did
 * not make, or one made by a version that did not write the marker, and either
 * way it is somebody else's to delete. Same instinct as `foldStray` above: when
 * two things are not the same kind of thing, leave the first alone and say so.
 *
 * Never throws. A machinery directory that will not delete is a few kilobytes
 * under the app's own home; failing a launch over it would be the worse bug.
 *
 * Returns { removed, why } so a caller can report what really happened rather
 * than assume.
 */
export function removeMachinery(projectDir, home = appHome()) {
  const real = path.resolve(projectDir);
  const dir = machineryDir(real, home);
  let there = false;
  try { there = fs.statSync(dir).isDirectory(); } catch { return { removed: false, why: 'no machinery' }; }
  if (!there) return { removed: false, why: 'not a directory' };
  const claimed = readOrigin(dir);
  if (claimed !== real) {
    console.warn(`${nameSlug}: ${dir} does not claim ${real}; leaving it alone`);
    return { removed: false, why: 'origin does not match' };
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return { removed: true };
  } catch (err) {
    console.warn(`${nameSlug}: could not remove ${dir}: ${err.message}`);
    return { removed: false, why: err.message };
  }
}

// Move one legacy path in, if it is there. Never throws: a store that cannot be
// migrated must still open on the new path rather than fail to open at all.
export function adoptLegacy(from, to) {
  let there = false;
  try { there = fs.existsSync(from); } catch { return false; }
  if (!there) return false;
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return true;
  } catch (err) {
    if (err.code === 'EXDEV') return copyAcross(from, to);
    // EEXIST / ENOTEMPTY: another process won the race, which is the good case.
    if (err.code !== 'EEXIST' && err.code !== 'ENOTEMPTY' && err.code !== 'ENOENT') {
      console.warn(`${nameSlug}: could not move ${from} into the app's home: ${err.message}`);
    }
    return false;
  }
}

// The store on one volume and the home on another. Rare, and a rename cannot
// cross it, so copy and then remove — in that order, so a failure halfway
// leaves the original where it was rather than nothing anywhere.
function copyAcross(from, to) {
  try {
    fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
    fs.rmSync(from, { recursive: true, force: true });
    return true;
  } catch (err) {
    console.warn(`${nameSlug}: could not copy ${from} into the app's home: ${err.message}`);
    return false;
  }
}
