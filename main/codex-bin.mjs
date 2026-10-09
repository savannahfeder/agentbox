// Where Codex actually is, and whether we are entitled to say it is not here.
//
// The sibling of main/claude-bin.mjs, and it keeps that file's rule rather than
// re-arguing it.
//
// So `found` decides which binary would be spawned and `certain` decides
// whether a screen may SAY there is nothing here, and they are never the same
// value.
//
// ONE DIFFERENCE FROM CLAUDE CODE, AND IT CHANGES THE SCREEN. Claude Code is
// required: the app will not open an inbox without it. Codex is optional, and
// an absence is the ordinary case rather than a fault. So nothing here ever
// produces a warning. All a missing Codex does is leave the second engine out
// of the map that shared/engines.mjs reads, which is silence rather than a
// sentence about software she never asked for.
//
// NOTHING HERE SPAWNS ANYTHING, AND main/config.mjs IS WHAT CALLS IT.
//
// It was inert when it was written -- "no config key, no snapshot field, no
// Settings row" -- and that stopped being true the moment the supervisor
// started spawning `config.codexBin`. Until this was wired in, that path
// arrived on `config` through the unknown-key spread in main/config.mjs and
// went to `spawn` with no finder and no existence check behind it, which is the
// one path in the second engine that becomes a process and was the only one
// with no guard on it. `resolveCodexBin` is now what answers "is there a Codex
// on this Mac", and its answer is the fact `engineFor` refuses on.
//
// There is still no Settings row, which is a real gap and not a claim of one:
// she can set `codexBin` in zero.config.json and nothing on screen says whether
// it was found.
//
// ------------------------------------------------------------------------
// MEASURED ON THIS MAC 2026-09-04, BECAUSE THE 2026-08-25 ORIGINAL WAS WRITTEN
// AGAINST codex-cli 0.144.0 AND SIX OF ITS ASSUMPTIONS HAVE MOVED SINCE.
//
// Installed here: codex-cli 0.148.0 at /opt/homebrew/bin/codex. That is a
// Homebrew CASK, not a formula as the original said, and the bin entry is a
// SYMLINK into /opt/homebrew/Caskroom/codex/0.148.0/bin/codex. `brew info
// --cask codex` the same minute reports 0.148.0 installed against 0.152.1
// available, so the moment mid-upgrade where that link points at nothing is a
// live state on this machine and not a hypothetical. It is the same shape the
// dangling-symlink rule was written for in the sibling file.
//
// THE INSTALL METHOD THE DOCS NOW LEAD WITH DID NOT EXIST IN THE ORIGINAL.
// `https://chatgpt.com/codex/install.sh`, read 2026-09-04:
//
//   BIN_DIR="${CODEX_INSTALL_DIR:-$HOME/.local/bin}"
//   CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
//   STANDALONE_ROOT="$CODEX_HOME_DIR/packages/standalone"
//
// It links ~/.local/bin/codex at a versioned file under that root and swaps the
// file on every update. Three things follow, and all three are changes from the
// original: that path goes FIRST (the tool's own answer settles a machine set
// up the documented way in one stat call, exactly as ~/.local/bin/claude does
// next door), the standalone store's own bin is worth listing for the case
// where CODEX_INSTALL_DIR put the link somewhere no list covers, and CODEX_HOME
// can move every trace below out from under us.
//
// AND THE STORE KEEPS THE BINARY IN TWO PLACES, WHICH THE FIRST VERSION OF THIS
// FILE MISSED. Same script, read the same day:
//
//   line  951:  ln -sf "bin/codex" "$stage_release/codex"
//   line 1021:  version_from_binary "$release_dir/bin/codex" \
//                 || version_from_binary "$release_dir/codex"
//
// Every staged release carries the binary at `<release>/bin/codex` AND at
// `<release>/codex`, and the installer accepts either when it goes looking for
// a version. `current` is a symlink at the live release, so BOTH
// `current/bin/codex` and `current/codex` resolve on a machine set up the
// documented way. Each is one stat call, so listing both costs nothing, and
// listing only one is how the app tells somebody their Codex is missing while
// they are looking at it.
//
// WHAT ~/.codex REALLY HOLDS NOW: 38 entries. auth.json, config.toml, sessions/
// and history.jsonl are all still there, so the original's evidence list is not
// wrong. It is INCOMPLETE, and it is aging in a specific way. The directory
// also holds state_5.sqlite, thread_history_1.sqlite, logs_2.sqlite,
// memories_1.sqlite, queue_1.sqlite, goals_1.sqlite, models_cache.json,
// installation_id and shell_snapshots/, and the split matters: sessions/ holds
// 1691 rollout files with the newest written 2026-09-03, while history.jsonl
// has not been touched since 2026-06-03. The live record moved into sqlite
// files whose names carry a schema number that increments, which is a name no
// list can hold. That is why the directory itself stays on the list, last and
// broad, and why nothing below tries to enumerate what is inside it.
//
// AND THE LINK MOVED. The original's install URL, developers.openai.com/codex/
// cli, answers 308 to learn.chatgpt.com/docs/codex/cli.
//
// The npm package is unchanged and still real (@openai/codex, 0.153.0 on
// 2026-09-04), so the package-manager paths and the per-Node directories below
// are carried over exactly as they were.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askShell } from './claude-bin.mjs';

// In order, and the first that exists wins. The shell installer's own path is
// first for the same reason its sibling's is: it is the answer the tool itself
// produces. Everything after it is a package manager's default bin directory,
// because Codex ships as a Homebrew cask and as an npm package rather than with
// an installer that owns a folder.
export function candidatePaths(home = os.homedir()) {
  return [
    path.join(home, '.local/bin/codex'),      // the shell installer's link
    path.join(home, '.codex/packages/standalone/current/bin/codex'),
    path.join(home, '.codex/packages/standalone/current/codex'),
    '/opt/homebrew/bin/codex',                // the Homebrew cask, Apple Silicon
    '/usr/local/bin/codex',                   // Homebrew on Intel, and npm -g
    path.join(home, '.bun/bin/codex'),
    path.join(home, '.volta/bin/codex'),
    path.join(home, '.asdf/shims/codex'),
    path.join(home, '.npm-global/bin/codex'),   // the two npm prefixes people
    path.join(home, '.npm-packages/bin/codex'), // actually write in a guide
    path.join(home, '.yarn/bin/codex'),
    path.join(home, 'Library/pnpm/codex'),    // pnpm's own bin on macOS
    path.join(home, '.local/share/pnpm/codex'), // pnpm's own bin on Linux
    path.join(home, '.deno/bin/codex'),
    path.join(home, 'bin/codex'),             // a hand-rolled ~/bin on PATH
    '/opt/local/bin/codex',                   // MacPorts
    '/usr/bin/codex',
  ];
}

// One bin directory per installed Node, under a name no list can hold. A global
// npm install under nvm, fnm, n or asdf lands there and nowhere else, and a
// double-clicked Electron app inherits launchd's PATH, which has never heard of
// any of them.
export function versionedPaths(home = os.homedir(), readdir = defaultReaddir) {
  const under = (dir, tail) => readdir(path.join(home, dir)).map((v) => path.join(home, dir, v, tail));
  return [
    ...under('.nvm/versions/node', 'bin/codex'),
    ...under('.local/share/fnm/node-versions', 'installation/bin/codex'),
    ...under('Library/Application Support/fnm/node-versions', 'installation/bin/codex'),
    ...under('n/versions/node', 'bin/codex'),
    ...under('.asdf/installs/nodejs', 'bin/codex'),
  ];
}

function defaultReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

// THE COPY THE CHATGPT APP CARRIES INSIDE ITSELF. Somebody who has only ever
// used Codex in the ChatGPT app has this and nothing else (w-9f6975906c,
// measured 2026-10-05: codex-cli 0.158.0-alpha.2, sharing the CLI's sign-in).
// Searched LAST, after the shell, because it moves with the app's releases.
//
// AND THE ONE THE CODEX DESKTOP APP CARRIES (w-d5d632e503). Its reported place,
// not measured on a Mac here: none of the Macs this was written on had the app.
// A path that is not there costs one missed `exists`.
export function appCopyPaths(home = os.homedir()) {
  const inside = ['ChatGPT.app/Contents/Resources/codex-cli/bin/codex', 'Codex.app/Contents/Resources/codex'];
  return inside.flatMap((p) => [path.join('/Applications', p), path.join(home, 'Applications', p)]);
}

// WHAT CODEX LEAVES BEHIND. None of these is a binary and none is ever spawned.
// They exist only to stop the app claiming an absence it has not established.
//
// Both homes are looked in when CODEX_HOME is set, and that is on purpose: a
// CODEX_HOME inherited from somewhere else is not proof the ordinary directory
// is gone, and the whole job of this list is to make an absence hard to claim
// rather than easy.
export function evidencePaths(home = os.homedir(), env = process.env) {
  const homes = [env?.CODEX_HOME, path.join(home, '.codex')].filter(Boolean);
  const out = [];
  for (const dir of new Set(homes)) {
    out.push(
      path.join(dir, 'auth.json'),                    // it has been logged in
      path.join(dir, 'config.toml'),
      path.join(dir, 'sessions'),                     // one folder tree of past runs
      path.join(dir, 'history.jsonl'),
      path.join(dir, 'packages/standalone/releases'), // the installer's version store
      dir,                                            // and the directory itself, last
    );
  }
  return out;
}

// A path that is a symlink to nothing. `existsSync` follows the link and says
// false, which is indistinguishable from nothing being there at all, and the
// two mean opposite things. Both of Codex's normal installs are a symlink into
// a versioned directory that gets swapped on every update, so this is the
// ordinary shape of a Codex that is being upgraded rather than an odd one.
function defaultDangles(p) {
  try { return !!fs.lstatSync(p) && !fs.existsSync(p); } catch { return false; }
}

export function installEvidence({
  home = os.homedir(), env = process.env, exists = fs.existsSync, dangles = defaultDangles,
} = {}) {
  for (const p of evidencePaths(home, env)) if (exists(p)) return p;
  for (const p of candidatePaths(home)) if (dangles(p)) return p;
  return null;
}

export const INSTALL_URL = 'https://learn.chatgpt.com/docs/codex/cli';

/**
 * The whole search, a pure function of its inputs so a test can put Codex
 * anywhere without touching the machine it runs on.
 *
 * Returns the same shape its sibling does: { path, found, certain, from,
 * searched, evidence }, so a caller can hold the two side by side without
 * learning two vocabularies.
 */
export function findCodexBin({
  configured = null,
  home = os.homedir(),
  env = process.env,
  exists = fs.existsSync,
  shellLookup = () => askShell({ bin: 'codex' }),
  readdir = defaultReaddir,
  dangles = defaultDangles,
} = {}) {
  if (configured) {
    return {
      path: configured, found: exists(configured), certain: true, from: 'settings',
      searched: [], evidence: null,
    };
  }

  const searched = [...candidatePaths(home), ...versionedPaths(home, readdir)];
  for (const candidate of searched) {
    if (exists(candidate)) return { path: candidate, found: true, certain: true, from: 'disk', searched, evidence: null };
  }

  const fromShell = shellSaid(shellLookup());
  if (fromShell.path) return { path: fromShell.path, found: true, certain: true, from: 'shell', searched, evidence: null };

  for (const candidate of appCopyPaths(home)) {
    if (exists(candidate)) return { path: candidate, found: true, certain: true, from: 'app', searched, evidence: null };
  }

  // NOT FOUND, AND WHETHER THAT IS KNOWN. Every cheap path missed and every
  // shell we could reach missed, so the last question is whether this Mac shows
  // any sign of Codex anyway.
  const evidence = installEvidence({ home, env, exists, dangles });
  return {
    path: null,
    found: false,
    certain: fromShell.answered && !evidence,
    from: null,
    searched,
    evidence,
  };
}

// askShell used to answer with a path or null. Anything handing back the old
// shape is read as an answer, because that is what it always meant.
function shellSaid(result) {
  if (typeof result === 'string') return { path: result, answered: true };
  if (!result || typeof result !== 'object') return { path: null, answered: true };
  return { path: result.path ?? null, answered: result.answered !== false };
}

/* ------------------------------- the cache -------------------------------- */
// Only the SHELL step is remembered, for the same thirty seconds and the same
// reason: the path checks are stat calls, and caching those is how a settings
// screen ends up still saying "not found" after somebody has installed it.

const SHELL_TTL = 30_000;
let shellAnswer = null;
let shellAskedAt = 0;

export function resolveCodexBin(configured = null, { now = Date.now(), shellLookup = () => askShell({ bin: 'codex' }), ...where } = {}) {
  const remembered = () => {
    if (shellAskedAt && now - shellAskedAt < SHELL_TTL) return shellAnswer;
    shellAnswer = shellLookup();
    shellAskedAt = now;
    return shellAnswer;
  };
  return findCodexBin({ ...where, configured, shellLookup: remembered });
}

export function forgetCodexBin() {
  shellAnswer = null;
  shellAskedAt = 0;
}
