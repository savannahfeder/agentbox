// EVERY FOLDER CLAUDE CODE AND CODEX KEEP SESSIONS IN, so the import reads all
// of them rather than the one each tool uses by default (w-e46f2e9cea).
//
// Claude Code writes a session to `$CLAUDE_CONFIG_DIR/projects`, and to
// `~/.claude/projects` only when that variable is unset (read out of the 2.1.293
// binary, 2026-10-11). Codex does the same with `CODEX_HOME` and `~/.codex`.
// The import read only the two defaults, and on the Mac this was measured on
// every Claude Code session its owner had run lived in `~/.claude-2`. The walk's
// last card is drawn only when the finder hands something back, so a finder
// looking in the wrong folder does not draw an empty card. It draws no card,
// and the person is never told importing exists.
//
// READING THE VARIABLE IS NOT ENOUGH. An app opened from the Dock never sees
// what a shell profile exports, so somebody with `export CLAUDE_CONFIG_DIR=...`
// in their .zshrc gets an app whose environment has no such variable. The
// folders are looked for instead, by the same rule main/account-discovery.mjs
// uses to find a second login: `.claude` or `.claude-<anything>` directly under
// home. That module asks whether a folder holds a LOGIN; this one asks whether
// it holds SESSIONS, which is a different question with a different answer. A
// backup folder holds no login and may hold the only copy of a conversation,
// and two folders signed in as one account are one account but two sets of
// sessions.
//
// A FOLDER COUNTS ONLY IF IT HAS SESSIONS IN IT: `projects/` for Claude Code,
// `sessions/` for Codex. `~/.claude-worktrees` is named like a data folder and
// is not one. A folder named `claude-src`, with no dot, is somebody's checkout
// and is never looked at.
//
// Duplicates are the reader's to settle, by session id: a backup folder with a
// copy of a conversation is ordinary, and the newest copy is the one to offer.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shellDataDirsNow } from './shell-path.mjs';

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** `.claude`, `.claude-work`, `.codex-2`: every directory under home named `.<tool>` or `.<tool>-<anything>`. */
function shapedUnderHome(home, tool) {
  let names = [];
  try { names = fs.readdirSync(home); } catch { return []; }
  return names
    .filter((n) => n === `.${tool}` || n.startsWith(`.${tool}-`))
    .sort()
    .map((n) => path.join(home, n));
}

/**
 * The candidates, in the order given, kept when they hold `inner/` and named
 *  once each. Two spellings of one folder (a trailing slash, a symlink) are
 *  one folder. */
function keepWithSessions(candidates, inner) {
  const out = [];
  const seen = new Set();
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const dir = path.resolve(c.trim());
    let real = dir;
    try { real = fs.realpathSync(dir); } catch { continue; }
    if (seen.has(real)) continue;
    if (!isDir(path.join(dir, inner))) continue;
    seen.add(real);
    out.push(dir);
  }
  return out;
}

/** A configured profile is 'default' (the tool's own default folder) or a folder. */
const profileDirs = (configured, dflt) => (Array.isArray(configured) ? configured : [configured])
  .filter((p) => typeof p === 'string' && p.trim())
  .map((p) => (p === 'default' ? dflt : p));

/**
 * EVERY CLAUDE CODE DATA FOLDER ON THIS MACHINE THAT HOLDS SESSIONS.
 *
 *  `env` is the app's own environment and is passed in rather than read here,
 *  so a test with a made-up home is not handed the real folder the test runner
 *  happens to have in CLAUDE_CONFIG_DIR. `configured` is `authProfiles`. The
 *  last candidate is `~/.config/claude`, where some Claude Code versions kept
 *  their data; 2.1.293 no longer does, but a machine that still has sessions
 *  there gets them read. */
export function claudeDataDirs({ home = os.homedir(), env = {}, configured = [] } = {}) {
  const dflt = path.join(home, '.claude');
  const xdg = env?.XDG_CONFIG_HOME ? path.join(env.XDG_CONFIG_HOME, 'claude') : path.join(home, '.config', 'claude');
  return keepWithSessions([
    env?.CLAUDE_CONFIG_DIR,
    ...profileDirs(configured, dflt),
    dflt,
    ...shapedUnderHome(home, 'claude'),
    xdg,
  ], 'projects');
}

/**
 * BOTH LISTS, AS THE RUNNING APP SEES THEM: its own environment, the Claude
 *  profiles it was configured with, and the Codex homes its supervisor runs on.
 *  The one call the import card, the Codex watch and the import answer share,
 *  so the three cannot disagree about where somebody's sessions are. */
export function sessionFolders({ claudeProfiles = [], codexHomes = [], env = process.env, home = os.homedir() } = {}) {
  return {
    dirs: claudeDataDirs({ home, env, configured: claudeProfiles }),
    codexDirs: codexDataDirs({ home, env, configured: codexHomes }),
  };
}

/**
 * THE CODEX HOMES THE SUPERVISOR RUNS ON, or as many of them as can be named.
 *  Each profile is resolved on its own, so one that throws costs that one home
 *  and not the list (found by Codex's review of this change, 2026-10-11). */
export function codexHomesOf(supervisor) {
  let profiles = [];
  try { profiles = supervisor?._codexProfiles?.() ?? []; } catch { profiles = []; }
  if (!Array.isArray(profiles)) return [];
  const out = [];
  for (const p of profiles) {
    try {
      const h = supervisor._codexProfileHome(p);
      if (typeof h === 'string' && h.trim()) out.push(h);
    } catch { /* that one home is unknown; the rest still count */ }
  }
  return out;
}

/**
 * WHAT THE RUNNING APP HANDS EVERY READER: its own config and supervisor, made
 *  safe. A missing config, a supervisor without the Codex methods, or a home
 *  that will not resolve each lose only their own part. The first draft built
 *  both lists inside one try, so any one of those left the import reading
 *  nothing beyond the defaults, and without the app's own CLAUDE_CONFIG_DIR or
 *  CODEX_HOME either. */
export function appSessionFolders({ config = null, supervisor = null, env = process.env, shellEnv = shellDataDirsNow(), home = os.homedir() } = {}) {
  let claudeProfiles = [];
  try { claudeProfiles = config?.authProfiles ?? []; } catch { claudeProfiles = []; }
  if (!Array.isArray(claudeProfiles)) claudeProfiles = [claudeProfiles];
  // AND WHAT THE LOGIN SHELL EXPORTS (main/shell-path.mjs), which an app opened
  // from the Dock never sees in its own environment.
  return sessionFolders({
    claudeProfiles: [...claudeProfiles, shellEnv?.CLAUDE_CONFIG_DIR],
    codexHomes: [...codexHomesOf(supervisor), shellEnv?.CODEX_HOME],
    env,
    home,
  });
}

/**
 * EVERY CODEX DATA FOLDER ON THIS MACHINE THAT HOLDS SESSIONS. Same rule:
 *  `CODEX_HOME`, whatever the app was configured with, `~/.codex` and every
 *  `~/.codex-<name>`. */
export function codexDataDirs({ home = os.homedir(), env = {}, configured = [] } = {}) {
  const dflt = path.join(home, '.codex');
  return keepWithSessions([
    env?.CODEX_HOME,
    ...profileDirs(configured, dflt),
    dflt,
    ...shapedUnderHome(home, 'codex'),
  ], 'sessions');
}
