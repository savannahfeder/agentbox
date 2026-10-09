// Where Claude Code actually is, on a machine that is not hers.
//
// Agentbox assumed one path, `~/.local/bin/claude`, which is where Claude Code's
// own installer puts it. That is one of several normal answers: install through
// npm or Homebrew and the binary is somewhere else entirely. For those people
// the app found nothing, said "missing" on a grey dot in Settings, and gave no
// sentence and no next step. It read as broken rather than as unfinished.
//
// THE RULE this file exists to keep: never tell someone Claude Code is
// missing unless we are certain it is.
//
// So there are two different questions here and they must never be answered by
// the same value. `found` is whether a runnable file is really there, and it
// decides which path gets spawned. `certain` is whether we are entitled to SAY
// it is missing, and everything below exists to make `certain` hard to earn.
//
// Four steps before an absence is ever claimed, cheapest first.
//
// KNOWN PATHS. A filesystem check is instant, spawns nothing, and is the right
// answer for most machines. The list is every normal home for this binary: the
// installer's own directory, Claude Code's local install (what
// `claude migrate-installer` leaves behind), Homebrew on Apple Silicon and on
// Intel, MacPorts, and the default bin of every package manager that is not npm.
//
// VERSION MANAGER DIRECTORIES. nvm, fnm, n and asdf each keep one bin directory
// PER INSTALLED NODE, under a name nobody can guess, so they are read rather
// than listed. A global npm install under any of them lands there and nowhere
// else, and this is the case the shell step used to be the only cover for.
//
// THE SHELL. The catch-all for installs no list can enumerate: volta, bun, a
// custom npm prefix. It must be a LOGIN, INTERACTIVE shell, because those
// managers put themselves on PATH from `.zprofile` and `.zshrc` and nowhere
// else. And it is needed at all because a double-clicked Electron app inherits
// launchd's PATH, which is /usr/bin:/bin:/usr/sbin:/sbin and has never heard of
// any of them. That is the whole reason an npm install is obvious in a terminal
// and invisible to the app. It is asked more than once now, because ONE probe
// that fails to start is not a fact about anybody's Mac.
//
// EVIDENCE THAT IT LIVES HERE ANYWAY. Last, and it decides nothing about which
// binary to run: it only takes away our right to announce an absence. Claude
// Code leaves a home folder, a settings file and a projects directory behind
// the moment it is used once. If those are on this Mac then Claude Code is on
// this Mac, whatever our search of PATH did or did not manage, and the honest
// thing on the screen is silence rather than a sentence telling somebody to
// install software they are already running. A dangling `claude` symlink counts
// the same way, and it is a real state: the installer points ~/.local/bin/claude
// at a versioned file and swaps that file on every update.
//
// Nothing here overrides the config file. An explicit `claudeBin` in
// zero.config.json wins untouched and is never searched around, because that
// file promises explicit paths with no discovery, and a search that
// second-guesses a written setting would break that promise.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// In order. The first that exists wins, so the installer's path stays first and
// a machine that has always worked keeps resolving exactly as it did.
export function candidatePaths(home = os.homedir()) {
  return [
    path.join(home, '.local/bin/claude'),    // the installer
    path.join(home, '.claude/local/claude'), // claude migrate-installer
    '/opt/homebrew/bin/claude',              // Homebrew, Apple Silicon
    '/usr/local/bin/claude',                 // Homebrew on Intel, and npm -g
    path.join(home, '.bun/bin/claude'),      // bun
    path.join(home, '.volta/bin/claude'),    // volta
    path.join(home, '.asdf/shims/claude'),   // asdf, through its shims
    path.join(home, '.npm-global/bin/claude'), // the two npm prefixes people
    path.join(home, '.npm-packages/bin/claude'), // actually write in a guide
    path.join(home, '.yarn/bin/claude'),     // yarn global
    path.join(home, 'Library/pnpm/claude'),  // pnpm's own bin on macOS
    path.join(home, '.local/share/pnpm/claude'), // pnpm's own bin on Linux
    path.join(home, '.deno/bin/claude'),     // deno
    path.join(home, 'bin/claude'),           // a hand-rolled ~/bin on PATH
    '/opt/local/bin/claude',                 // MacPorts
    '/usr/bin/claude',                       // packaged by something system-wide
  ];
}

// One bin directory per installed Node, under a name no list can hold. Read
// rather than guessed, and a directory that is not there just contributes
// nothing. This is where a global npm install under nvm, fnm, n or asdf ends
// up, and until now only the shell could reach it.
export function versionedPaths(home = os.homedir(), readdir = defaultReaddir) {
  const under = (dir, tail) => readdir(path.join(home, dir)).map((v) => path.join(home, dir, v, tail));
  return [
    ...under('.nvm/versions/node', 'bin/claude'),
    ...under('.local/share/fnm/node-versions', 'installation/bin/claude'),
    ...under('Library/Application Support/fnm/node-versions', 'installation/bin/claude'),
    ...under('n/versions/node', 'bin/claude'),
    ...under('.asdf/installs/nodejs', 'bin/claude'),
  ];
}

function defaultReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

// THE COPY THE CLAUDE APP KEEPS FOR ITSELF, one folder per version, newest
// first. Somebody who has only ever used Claude Code inside the Claude app has
// this and nothing else (w-9f6975906c, measured 2026-10-05: 2.1.209 there, and
// it shared the CLI's sign-in). It is searched LAST, after the shell, because it
// updates when the app does and a real install is fresher.
export function appCopyPaths(home = os.homedir(), readdir = defaultReaddir) {
  const dir = path.join(home, 'Library/Application Support/Claude/claude-code');
  return readdir(dir)
    .filter((v) => /^\d+(\.\d+)*$/.test(v))
    .sort(newestFirst)
    .map((v) => path.join(dir, v, 'claude.app/Contents/MacOS/claude'));
}

function newestFirst(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  }
  return 0;
}

// WHAT CLAUDE CODE LEAVES BEHIND. Any one of these means it has run on this
// Mac. None of them is a binary and none of them is ever spawned; they exist
// only to stop the app announcing an absence it cannot support.
export function evidencePaths(home = os.homedir()) {
  return [
    path.join(home, '.claude.json'),               // its own config file
    path.join(home, '.claude/settings.json'),
    path.join(home, '.claude/projects'),           // one folder per project it has opened
    path.join(home, '.claude/statsig'),
    path.join(home, '.claude/.credentials.json'),  // it has been logged in
    path.join(home, '.claude/history.jsonl'),
    path.join(home, '.local/share/claude'),        // the installer's version store
  ];
}

// A path that is a symlink to nothing. `existsSync` follows the link and says
// false, which is indistinguishable from nothing being there at all, and the
// two mean opposite things: an update that has swapped the versioned file out
// from under ~/.local/bin/claude leaves exactly this for a moment.
function defaultDangles(p) {
  try { return !!fs.lstatSync(p) && !fs.existsSync(p); } catch { return false; }
}

export function installEvidence({ home = os.homedir(), exists = fs.existsSync, dangles = defaultDangles } = {}) {
  for (const p of evidencePaths(home)) if (exists(p)) return p;
  for (const p of candidatePaths(home)) if (dangles(p)) return p;
  return null;
}

export const INSTALL_URL = 'https://code.claude.com/docs/en/setup';

// The shells worth asking, in order, and never the same one twice. Hers first
// because it is the one that has her PATH in it; the other two because a
// $SHELL that will not start is a fact about $SHELL and not about Claude Code.
export function shellProbes(env = process.env) {
  const preferred = env.SHELL || '/bin/zsh';
  const out = [[preferred, '-lic', 4000], [preferred, '-lc', 2500]];
  for (const other of ['/bin/zsh', '/bin/bash']) {
    if (other !== preferred) out.push([other, '-lic', 2500]);
  }
  return out;
}

// Ask the user's own login shell, and go on asking until one of them answers.
// Anything that is not an absolute path to a file that exists is treated as no
// path: `command -v` also prints shell functions and aliases, and a function
// name handed to spawn is a crash with a worse message than "not found".
//
// `answered` is the strict half. It is true only when every probe that ran came
// back with a real exit status, and at least one did. One shell that timed out
// alongside one that said no is not a machine we know anything about.
//
// `bin` is a parameter rather than the word `claude` baked into the command
// because Codex is a second engine (her ask, 2026-08-25) and it is found in the
// same way: same shells, same "two different silences" rule, same refusal to
// read a shell function name as a path. It is DEFAULTED, so every existing
// caller and every existing test asks about Claude Code as it always did, and
// that matters more here than it would anywhere else: this is the binary the
// app will not open an inbox without.
/**
 * WHAT MAY BE HANDED TO A LOGIN SHELL, AND WHY THIS IS CHECKED AT ALL.
 *
 * The probe below interpolates `bin` into a string a LOGIN, INTERACTIVE shell
 * executes, with her profile loaded, as her. Both callers today pass a literal
 * ('claude' here, 'codex' in main/codex-bin.mjs), so nothing is exploitable
 * now. But the entire direction of the second-engine work is a binary somebody
 * can configure, and a `codexBin` read out of zero.config.json reaching this
 * argument is one plausible slice away; at that point `command -v x; curl | sh`
 * is a string in a file that runs itself.
 *
 * This function looks up program NAMES, so a name is all it takes. An allowlist
 * rather than quoting, because quoting is a thing a later edit can undo without
 * noticing and a shape check is not.
 */
const PROGRAM_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export function askShell({ env = process.env, exists = fs.existsSync, run = defaultRun, bin = 'claude' } = {}) {
  if (typeof bin !== 'string' || !PROGRAM_NAME.test(bin)) {
    throw new Error(`askShell looks up a program name, and ${JSON.stringify(bin)} is not one`);
  }
  let said = false;
  let inconclusive = false;
  for (const [shell, flags, timeout] of shellProbes(env)) {
    let out = '';
    try {
      out = run(shell, [flags, `command -v ${bin}`], timeout);
    } catch (e) {
      // TWO DIFFERENT SILENCES, AND ONLY ONE OF THEM IS AN ANSWER.A shell that
      // ran and exited non-zero has told us claude is not on PATH, and that is
      // an answer. A shell that could not be started, or that ran past the
      // timeout, has told us nothing at all, and reporting nothing as "not
      // installed" is what put a line about missing software on the screen of
      // people who have it.
      if (exitedSayingNo(e)) said = true; else inconclusive = true;
      continue;
    }
    const line = String(out).split('\n').map((s) => s.trim()).filter(Boolean).pop();
    if (line && line.startsWith('/') && exists(line)) return { path: line, answered: true };
    said = true;
  }
  return { path: null, answered: said && !inconclusive };
}

// The shell ran to completion and returned a non-zero exit code, which for
// `command -v` is how "not on PATH" is spelt. A timeout (SIGTERM, ETIMEDOUT)
// and a shell that does not exist (ENOENT) both arrive here too, and neither
// of them is a fact about Claude Code.
function exitedSayingNo(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.signal || e.code === 'ETIMEDOUT' || e.code === 'ENOENT') return false;
  return typeof e.status === 'number';
}

// askShell used to answer with a path or null, and both a real answer and a
// failed probe were null. Anything still handing back the old shape is read as
// an answer, because that is what it always meant.
function shellSaid(result) {
  if (typeof result === 'string') return { path: result, answered: true };
  if (!result || typeof result !== 'object') return { path: null, answered: true };
  return { path: result.path ?? null, answered: result.answered !== false };
}

function defaultRun(shell, args, timeout = 4000) {
  return execFileSync(shell, args, {
    encoding: 'utf8',
    // stdin ignored on purpose: an interactive shell handed a live terminal can
    // sit waiting for input, and this runs on the boot path.
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout,
  });
}

// The whole search, as a pure function of its inputs so a test can put Claude
// Code anywhere without touching the machine it runs on.
//
// Returns { path, found, certain, from, searched, evidence }. `found` is the
// only claim about the world: it means a file is really there. `certain` says
// whether we are allowed to tell somebody it is NOT there, so a screen can stay
// quiet rather than announce an absence it has not established. They come apart
// in exactly one case that is not a failure, and it is the case worth keeping
// honest: she has set `claudeBin` to a path that does not exist, so the path
// stays HERS (anything that spawns it should fail naming the path she chose,
// not one we picked) while the screen says it was not found and offers the
// install link, the same as any other machine.
export function findClaudeBin({
  configured = null,
  home = os.homedir(),
  exists = fs.existsSync,
  shellLookup = askShell,
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

  for (const candidate of appCopyPaths(home, readdir)) {
    if (exists(candidate)) return { path: candidate, found: true, certain: true, from: 'app', searched, evidence: null };
  }

  // NOT FOUND, AND WHETHER THAT IS KNOWN. Every cheap path missed and every
  // shell we could reach missed, so the last question is whether this Mac shows
  // any sign of Claude Code anyway. If it does, we looked in the wrong places
  // rather than at an empty machine, and nothing may be said out loud.
  const evidence = installEvidence({ home, exists, dangles });
  return {
    path: null,
    found: false,
    certain: fromShell.answered && !evidence,
    from: null,
    searched,
    evidence,
  };
}

/* ------------------------------- the cache -------------------------------- */
// Only the SHELL step is remembered, and only briefly. Nothing else is: the
// path checks are stat calls, and caching them is how the settings screen ends
// up telling someone to install Claude Code and then still saying "not found"
// after they have. The sentence on that screen makes a promise and a cached
// answer breaks it.
//
// The shell is the one part worth holding, because it is up to three
// subprocesses and a screen she toggles a switch on reads settings again on
// every write. Thirty seconds is long enough that a burst of writes pays for it
// once, and short enough that it is never the reason someone is still stuck.

const SHELL_TTL = 30_000;
let shellAnswer = null;
let shellAskedAt = 0;

function rememberedShellLookup(now, lookup) {
  if (shellAskedAt && now - shellAskedAt < SHELL_TTL) return shellAnswer;
  shellAnswer = lookup();
  shellAskedAt = now;
  return shellAnswer;
}

export function resolveClaudeBin(configured = null, { now = Date.now(), shellLookup = askShell, ...where } = {}) {
  return findClaudeBin({ ...where, configured, shellLookup: () => rememberedShellLookup(now, shellLookup) });
}

export function forgetClaudeBin() {
  shellAnswer = null;
  shellAskedAt = 0;
}
