// The app's own home, so nothing Agentbox generates lands in the folder a
// worker runs in. Claude Code keeps per-project state under
// `~/.claude/projects/<encoded path>/` and Codex under `~/.codex`; this is the
// same convention. A product with no code repo makes its docs folder the
// worker's cwd (main/supervisor.mjs), so without this our records sat there.
//
// Our records move: the ledger, session traces, run records, repeat rules and
// parked writes. What describes the folder stays in it (`project.json`,
// `index.json` and `.lock`), so the folder still opens when copied to another
// Mac.
//
// This does not protect the ledger: a worker with Bash reaches this folder as
// easily as its own cwd. The grant that used to sit on the ledger is handled in
// main/answer-modes.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Name, WAS, envNames, nameSlug, readEnv } from '../../shared/product-name.mjs';

const isDir = (dir) => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } };

/**
 * The store root under every env name this app has had, for every process we
 * start. Code outside this repo (an older install's MCP server, a launchd job,
 * a user's own script) reads only the name it was written against, and a
 * worker with no store root writes its session nowhere.
 */
export function storeRootEnv(storeRoot) {
  const env = {};
  for (const key of envNames('HOME')) env[key] = storeRoot;
  return env;
}

// Where a config that names no store keeps the inbox. Anything but Linux: a
// folder of the app's name in the home directory. Linux: $XDG_DATA_HOME/<slug>,
// or ~/.local/share/<slug> when that is unset, blank or not absolute. A caller
// that passes a stand-in home must pass an env that belongs to it.
export function defaultStoreRoot({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  if (platform !== 'linux') return path.join(home, Name);
  const given = typeof env?.XDG_DATA_HOME === 'string' ? env.XDG_DATA_HOME.trim() : '';
  const base = given && path.isAbsolute(given) ? given : path.join(home, '.local', 'share');
  return path.join(base, nameSlug);
}

// The env override is read at call time because a test sets it per case. Old
// env names and old dot-folders still answer: a launchd job or a process
// started before a rename exports the old variable, and an old dot-folder holds
// a real store. The current name wins, then the newest old name on disk.
// `homeDir`, `platform` and `env` are for tests; production passes none.
export function appHome(homeDir = os.homedir(), { platform = process.platform, env } = {}) {
  const override = readEnv('HOME', env);
  if (override) return override;
  const here = path.join(homeDir, `.${nameSlug}`);
  if (isDir(here)) return here;
  for (const was of WAS) {
    const older = path.join(homeDir, `.${was.toLowerCase()}`);
    if (isDir(older)) return older;
  }
  // A fresh Linux home has nothing of ours yet, so answer the path loadConfig
  // opens, or the two write separate stores. This machine's XDG_DATA_HOME
  // belongs to the real home only; a stand-in home or an explicit `env` does
  // not get it.
  if (platform === 'linux') {
    const real = env === undefined && path.resolve(homeDir) === path.resolve(os.homedir());
    return defaultStoreRoot({ home: homeDir, platform: 'linux', env: real ? process.env : (env ?? {}) });
  }
  return here;
}

// Claude Code's own encoding: every character that is not a letter or a digit
// becomes a dash, so `/Users/you/a.b` becomes `-Users-you-a-b`.
export function encodeProjectPath(dir) {
  return String(dir).replace(/[^A-Za-z0-9]/g, '-');
}

// That encoding is lossy: `/a/b.c` and `/a/b/c` encode the same. Two products
// sharing one ledger would merge their inboxes, so each folder records the
// path it belongs to in `.origin` and a mismatch gets a short hash suffix.
const ORIGIN = '.origin';

function readOrigin(dir) {
  try { return fs.readFileSync(path.join(dir, ORIGIN), 'utf8').trim(); } catch { return null; }
}

/**
 * True for a path inside `<home>/projects`, which is ours and never a product
 * folder, since products live under the account root. Treating one as a
 * product folder nests a second machinery directory inside it, and the sweep
 * then moves every record one level down. Every caller passes through here, so
 * this is where that is refused.
 */
export function isMachineryDir(dir, home = appHome()) {
  const root = path.resolve(path.join(home, 'projects'));
  return path.resolve(dir).startsWith(root + path.sep);
}

/** `<home>/projects/<encoded>` for this project directory. Creates nothing. */
export function machineryDir(projectDir, home = appHome()) {
  const real = path.resolve(projectDir);
  // Already a machinery directory: return it as is, so a caller that passed
  // one still gets the right ledger rather than a nested one.
  if (isMachineryDir(real, home)) return real;
  const base = path.join(home, 'projects', encodeProjectPath(real));
  const claimed = readOrigin(base);
  if (claimed === null || claimed === real) return base;
  const tag = crypto.createHash('sha256').update(real).digest('hex').slice(0, 8);
  return `${base}-${tag}`;
}

// Every name that is ours. All of them move together when a product is first
// touched, not one at a time when read, because most of the files are session
// traces that nothing reads again.
export const MACHINERY = ['work-items.jsonl', 'repeats.jsonl', 'sessions', 'runs', 'pending-writes'];

// The append-only logs. A stray copy holds lines the real file never got, so
// it is appended onto the real file rather than moved over it.
const LOGS = new Set(['work-items.jsonl', 'repeats.jsonl']);

/**
 * The machinery directory for a project, created, with its `.origin` written
 * once and every stray record of ours carried in. The sweep runs on every
 * call, not once per process, because a file of ours can turn up in the
 * product folder after the first move. It costs one stat per name.
 */
export function ensureMachineryDir(projectDir, home = appHome()) {
  const dir = machineryDir(projectDir, home);
  fs.mkdirSync(dir, { recursive: true });
  // A directory that is already ours is not swept, and its `.origin` is left
  // alone: overwritten with its own path, it would claim itself.
  if (dir === path.resolve(projectDir)) return dir;
  if (readOrigin(dir) === null) {
    try { fs.writeFileSync(path.join(dir, ORIGIN), `${path.resolve(projectDir)}\n`); } catch { /* best effort */ }
  }
  for (const rel of MACHINERY) foldStray(path.join(projectDir, rel), path.join(dir, rel), rel);
  return dir;
}

/**
 * Carries one of our names from the product folder to the machinery directory.
 * Nothing is ever destroyed here. In order:
 *
 *   - Nothing there: return.
 *   - Nothing at the target: rename it across whole.
 *   - Both directories: merge entry by entry by these rules, then remove the
 *     stray directory if the merge emptied it.
 *   - Both append-only logs: append the stray's bytes onto the real file and
 *     delete the stray.
 *   - Both ordinary files: the newer takes the name and the older is kept as
 *     `<name>.superseded-<mtime>`. This is rare, because run records are now
 *     written straight here (main/code-change.mjs).
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
    try { fs.rmdirSync(from); } catch { /* not empty, or gone already */ }
    return true;
  }

  // A directory on one side and a file on the other has no right answer.
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
 * Where one of our records lives for this project, after any stray copy in the
 * product folder has been renamed across. It is a move, not read-both-write-new,
 * because two halves of an append-only ledger are two stores that disagree.
 * The MCP server ships this same file so every reader agrees where it is.
 *
 * Many processes may call this at once. A failed rename is benign: ENOENT means
 * nothing to move, EEXIST or ENOTEMPTY means another process moved it first.
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
 * Carries records a copy wrote under the wrong home over to `toHome`. The
 * headless door (main/serve.mjs) once wrote its ledgers under whatever home it
 * inherited, and this keeps the rows it wrote then.
 *
 * Only a machinery directory whose `.origin` is inside `storeRoot` moves;
 * anything else under `fromHome` belongs to another store. Records go through
 * `foldStray`, and the old directory is removed only when just its marker is
 * left. Returns the product folders whose records were carried.
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
 * Deletes every record of ours for one project. Its caller is the practice
 * project, which must not outlive its tutorial; deleting only its folder would
 * leave the ledger and traces behind.
 *
 * Deletes only a directory whose `.origin` matches this project. One with no
 * marker was made by someone else or by an older version, and is left alone.
 * Never throws, because a leftover directory is a few kilobytes and failing a
 * launch over it would be worse. Returns { removed, why }.
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

// Moves one legacy path in, if it is there. Never throws, so a store that
// cannot be migrated still opens on the new path.
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

// A rename cannot cross volumes, so copy and then remove. In that order, a
// failure halfway leaves the original where it was.
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
