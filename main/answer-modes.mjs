// WHAT ONE REPLY MAY DO, KEPT WHERE A WORKER DOES NOT WRITE.
//
// When the founder answers a card she can also say what that one run is allowed
// to do on her Mac. That value becomes `--permission-mode` on a real process,
// so it is a GRANT and not an opinion about the work.
//
// IT USED TO RIDE ON THE LEDGER. `work-items.jsonl` is append-only, every line
// names its own author as a plain string, and nothing checks that string.
// Workers append to that file all day through the MCP; on a product with no
// code repo registered the file also sat in the worker's own cwd. The structured
// path was closed (an agent line carrying the field was stripped), and the file
// was not: one hand-written line saying `"source":"founder"` granted its own
// next run bypassPermissions. Proved on a scratch ledger, 2026-08-24.
//
// So the grant is not on the ledger any more. It lives in her own folder (the
// desktop's user data folder), written by main and by nothing else.
//
// NEVER UNDER THE STORE ROOT. The app makes its own home the store root, and
// every Claude worker is granted that folder, so a file edit there needs no
// card. Outside the granted folders a write meets the same card or auto-mode
// check as any other reach into her home. That is the whole claim and it is
// not a wall: anything that can run commands can write any file this user owns
// (tests/a-worker-cannot-set-its-own-permission-mode).
//
// GRANTING IS THE FOUNDER'S, SPENDING ONE IS THE MACHINERY'S, AGENTS GET
// NEITHER. That rule survives the move intact, and it is now structural rather
// than enforced: there is no writer here except the app's own main process, so
// there is no `source` to check and no line for anyone else to forge.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { nameSlug } from '../shared/product-name.mjs';
import { CLAUDE_PERMISSION_MODES } from '../shared/work-items.mjs';
import { CODEX_MODE_ORDER } from '../shared/codex-modes.mjs';

const FILE = 'answer-modes.json';

// Set once at start by `keepAnswerModesIn`. Until then nothing is read or kept:
// a process that never said where must not fall back to the store root.
let where = null;
let saidNowhere = false;

const inside = (file, dir) => {
  const f = path.resolve(file);
  const d = path.resolve(dir);
  return f === d || f.startsWith(d + path.sep);
};

function configHome(home, env) {
  const given = typeof env?.XDG_CONFIG_HOME === 'string' ? env.XDG_CONFIG_HOME.trim() : '';
  return given && path.isAbsolute(given) ? given : path.join(home, '.config');
}

/**
 * Where the app keeps these, said once at start (main/main.mjs, main/serve.mjs).
 *
 * In `userDir`, unless that is inside the store root, as the headless copy's
 * is: then in a per-store folder under the config home, the way the team
 * sign-in moves (main/team/session.mjs). If that is inside the store root too,
 * nowhere: every thread runs on its project's mode, which is the safe side.
 * Returns the file, or null.
 */
export function keepAnswerModesIn({ userDir, storeRoot, home = os.homedir(), env = process.env }) {
  let target = userDir ? path.join(userDir, FILE) : null;
  if (target && storeRoot && inside(target, storeRoot)) {
    const tag = crypto.createHash('sha256').update(path.resolve(storeRoot)).digest('hex').slice(0, 16);
    target = path.join(configHome(home, env), nameSlug, 'grants', tag, FILE);
  }
  if (!target || (storeRoot && inside(target, storeRoot))) {
    console.warn(`zero: nowhere outside the store root (${storeRoot}) to keep what a reply may do, so every thread runs on its project's mode`);
    target = null;
  }
  where = target;
  if (storeRoot) carryFromTheStore(path.join(storeRoot, FILE));
  return where;
}

export const answerModesFile = () => where;

// AN OLDER VERSION KEPT THIS IN THE STORE ROOT. Its file is carried across the
// first time and removed every time. The new file is created even when there is
// nothing to carry, because that is what makes the carry happen once: without
// it, a file a worker wrote into the store later would be carried at the next
// start.
function carryFromTheStore(old) {
  let found = null;
  try { found = fs.lstatSync(old); } catch { /* nothing there */ }
  if (where && !fs.existsSync(where)) {
    writeAll(where, sweep(found?.isFile() ? readAll(old) : {}, Date.now()));
  }
  if (found) {
    try { fs.rmSync(old, { force: true }); } catch (err) { console.warn(`zero: could not remove ${old}: ${err.message}`); }
  }
}

// HOW LONG A MODE LIVES, NOW THAT IT BELONGS TO A THREAD AND NOT TO ONE SEND.
//
// This was 24 hours, and 24 hours was right while the supervisor spent the
// grant on the first spawn: anything still here the next day had been spent or
// belonged to a row nobody ever ran. Neither is true any more. A mode she sets
// on a thread governs every run on that thread until she moves it, so a sweep
// measured from the moment she picked it would quietly hand a thread back to
// the fleet's mode overnight, which is the bug this round exists to fix,
// arriving a day late instead of a run late.
//
// So the clock is not "when she picked it" but "when this thread last used
// it": `touchAnswerMode` below restamps `at` on every run that reads one, and
// the window is a month. A thread she is working in keeps its mode for as long
// as she works in it. A row that has been silent for a month loses its grant
// rather than keeping a bypassPermissions she granted in another quarter, and
// the file does not grow without limit. Swept on every write.
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const fileFor = (home) => (home === undefined ? where : path.join(home, FILE));

// Never through a link, and never anything but a regular file, so a link left
// in place of one cannot point the read at a file somebody else writes.
const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW ?? 0);

function readAll(target) {
  if (!target) return {};
  let fd = null;
  try {
    fd = fs.openSync(target, READ_FLAGS);
    if (!fs.fstatSync(fd).isFile()) return {};
    const raw = JSON.parse(fs.readFileSync(fd, 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }
}

// tmp + rename, so a reader never sees half a file and a crash mid-write leaves
// the previous one intact.
function writeAll(target, all) {
  if (!target) {
    if (!saidNowhere) console.warn('zero: a mode was picked with nowhere to keep it, so the thread runs on its project\'s mode');
    saidNowhere = true;
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(all, null, 2)}\n`);
  fs.renameSync(tmp, target);
}

const keyOf = (slug, id) => `${slug}/${id}`;

function sweep(all, now) {
  for (const [key, entry] of Object.entries(all)) {
    if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.at) || now - entry.at > KEEP_MS) {
      delete all[key];
    }
  }
  return all;
}

/**
 * The mode set on one row's reply.
 *
 * `undefined` means she never touched the chip. `null` means she cleared it, or
 * the run that spent it cleared it, and the project's own setting applies. The
 * two are kept apart because the ledger kept them apart and every reader of the
 * old field already knows the difference.
 *
 * A value that is not one of Claude Code's six is dropped rather than returned,
 * so nothing that is not a mode can reach a command line even if this file were
 * edited by hand.
 */
/**
 * EVERY WORD THIS FILE WILL STORE: Claude Code's six and Codex's three.
 *
 *  ONE FIELD FOR BOTH ENGINES, because a row has one engine and the reply box
 *  can only ever offer that engine's list. Each consumer then filters by its
 *  own vocabulary and ignores the other's: `spawnPlan` keeps only a Claude mode
 *  (`CLAUDE_MODES.includes`), `codexThreadParamsFor` keeps only a Codex one
 *  (`isCodexMode`). A word meant for the other engine is therefore invisible
 *  rather than wrong.
 *
 *  `auto` IS ON BOTH LISTS AND THAT IS THE ONE OVERLAP. It means the sensible
 *  default on each engine, so the only way to be bitten is to set it on a Codex
 *  row and then have the task picked up by Claude Code, which would run Claude
 *  Code's auto. Both are the default that engine already wanted; the failure is
 *  benign and is written here so nobody spends an afternoon proving it.
 */
const ALLOWED_MODES = [...CLAUDE_PERMISSION_MODES, ...CODEX_MODE_ORDER];

export function answerMode(slug, id, { home, now = Date.now() } = {}) {
  const entry = readAll(fileFor(home))[keyOf(slug, id)];
  if (!entry || typeof entry !== 'object') return undefined;
  if (Number.isFinite(entry.at) && now - entry.at > KEEP_MS) return undefined;
  if (entry.mode === null) return null;
  return ALLOWED_MODES.includes(entry.mode) ? entry.mode : undefined;
}

/** Every row that currently carries one, as `{ "<slug>/<id>": mode }`. */
export function answerModes({ home, now = Date.now() } = {}) {
  const out = {};
  for (const [key, entry] of Object.entries(readAll(fileFor(home)))) {
    if (!entry || typeof entry !== 'object') continue;
    if (Number.isFinite(entry.at) && now - entry.at > KEEP_MS) continue;
    if (entry.mode === null) { out[key] = null; continue; }
    if (ALLOWED_MODES.includes(entry.mode)) out[key] = entry.mode;
  }
  return out;
}

/**
 * Set one, or clear it with null. Called only from the founder's own reply
 * (main/store.mjs, answerItem), which is only reachable from the reply box.
 *
 * A mode that is not one of the six is refused outright rather than stored,
 * which is what the ledger's own check used to do.
 */
export function setAnswerMode(slug, id, mode, { home, now = Date.now() } = {}) {
  if (mode !== null && !ALLOWED_MODES.includes(mode)) return answerMode(slug, id, { home, now });
  const all = sweep(readAll(fileFor(home)), now);
  all[keyOf(slug, id)] = { mode, at: now };
  writeAll(fileFor(home), all);
  return fileFor(home) ? mode : undefined;
}

/**
 * Say that this thread just used its mode, so the sweep above measures from
 * the last run rather than from the moment she picked it.
 *
 * IT RESTAMPS THE MODE THAT IS THERE, NEVER THE ONE THE RUN WAS BUILT WITH.
 * The supervisor reads the mode when it builds the launch and touches on the
 * child's own 'spawn' event, so there is a window in between, and a second
 * answer landing inside it must survive untouched: `used` is compared and a
 * mismatch is left exactly as it stands. Nothing here ever changes a mode, so
 * the worst this call can do is keep a grant she already made alive one more
 * month.
 */
export function touchAnswerMode(slug, id, used, { home, now = Date.now() } = {}) {
  const all = sweep(readAll(fileFor(home)), now);
  const key = keyOf(slug, id);
  const entry = all[key];
  if (!entry || typeof entry !== 'object') return undefined;
  if (used !== undefined && entry.mode !== used) return entry.mode;
  all[key] = { mode: entry.mode, at: now };
  writeAll(fileFor(home), all);
  return entry.mode;
}

/**
 * Put a row back on the project's setting.
 *
 * THIS IS NO LONGER CALLED ON SPAWN. Until 2026-09-24 the supervisor called it
 * the moment a run came up, which is what made a picked mode last exactly one
 * send; `touchAnswerMode` stands in that place now. The only thing that clears
 * a mode today is she does, through the reply box's own clear row.
 *
 * IT CLEARS THE MODE IT WAS TOLD ABOUT, NEVER WHATEVER HAPPENS TO BE THERE
 * NOW, for the same reason as above. Clearing is not "less": it means back to
 * the project's setting, which can be the wider one.
 */
export function clearAnswerMode(slug, id, spent, { home, now = Date.now() } = {}) {
  const all = sweep(readAll(fileFor(home)), now);
  const key = keyOf(slug, id);
  const current = all[key]?.mode;
  if (spent !== undefined && current !== spent) return current === undefined ? undefined : current;
  all[key] = { mode: null, at: now };
  writeAll(fileFor(home), all);
  return null;
}

export const _internals = { file: fileFor, KEEP_MS, useFile: (f) => { where = f ?? null; } };
