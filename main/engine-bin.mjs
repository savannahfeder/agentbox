// WHERE A CODING AGENT ACTUALLY IS, on a machine that is not ours.
//
// ONE registry and ONE search, for every harness the app can run. There used to
// be two files, `main/claude-bin.mjs` (338 lines) and `main/codex-bin.mjs` (279
// lines), which were two copies of one idea; both of them now declare their
// engine here and run this. A third harness is an ENTRY, not a file.
//
// THE RULE THIS EXISTS TO KEEP, inherited from the pair it replaces and not
// re-argued: never tell somebody their coding agent is missing unless we are
// certain it is. So there are two different questions and they must never be
// answered by the same value. `found` is whether a runnable file is really
// there, and it decides which path gets spawned. `certain` is whether we are
// entitled to SAY it is missing, and most of this file exists to make `certain`
// hard to earn.
//
// ---------------------------------------------------------------------------
// WHY THE ORDER CHANGED, 2026-10-08 (w-ce8c1a9275), and it is the whole point
// of this rewrite.
//
// Both old finders tried the hand-written list FIRST and asked the person's own
// login shell THIRD. The shell is the only source that actually KNOWS where
// their tools are -- it is their PATH, with their profile loaded, as them -- and
// it was the fallback. So every new installer, version manager and distro was a
// patch we ship and a release they wait for. Measured on this repository
// 2026-10-08: of the 7 commits those two files ever had, three are literally
// "one more install location".
//
// THE SHELL GOES FIRST NOW. The list stays, demoted to what it was really
// written for: a GUI launch with a thin PATH. A double-clicked Electron app
// inherits launchd's PATH, which is /usr/bin:/bin:/usr/sbin:/sbin and has never
// heard of nvm, volta or Homebrew, so a login shell that times out or will not
// start leaves the list as the only thing that can answer.
//
// WHAT THAT COSTS, measured on this Mac the same day: `zsh -lic 'command -v
// claude'` takes 0.38-0.43 s, so a machine whose list would have hit on the
// first stat call now pays about 0.4 s per engine at boot instead of nothing.
// Two engines, once, behind a thirty second memory. That is the price of not
// shipping a release every time somebody installs their tools a new way.
//
// AND A LOOKUP THAT THROWS IS NOT AN ABSENCE. The shell step used never to run
// at all on a machine whose list had the binary, so nothing downstream of it was
// ever reached by a throw. It runs first now, and the app refuses to open an
// inbox without Claude Code, so a probe that blows up falls through to the list
// rather than taking Claude Code away from somebody who has it. It still does
// not count as an answer, so it cannot earn the sentence either.
// ---------------------------------------------------------------------------
//
// Nothing here overrides a path somebody set. An explicit `claudeBin` or
// `codexBin` wins untouched and is never searched around, because that promise
// is what makes "point at it yourself" a real way out of a search that missed
// (main/ipc.mjs, `zero:engine-bin`).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/* ------------------------------ the strategy ------------------------------ */

/**
 * EVERY PACKAGE MANAGER'S DEFAULT BIN DIRECTORY, in order, for any tool.
 *
 * This list was written TWICE, once per engine, fourteen entries each, and a
 * path added to one and not the other is how one engine quietly stops being
 * found where the other is. It is one list now and every engine's candidates
 * are generated from it, so a new entry reaches every harness at once.
 */
export function sharedBinDirs(home = os.homedir()) {
  return [
    '/opt/homebrew/bin',                           // Homebrew, Apple Silicon
    '/usr/local/bin',                              // Homebrew on Intel, and npm -g
    path.join(home, '.bun/bin'),                   // bun
    path.join(home, '.volta/bin'),                 // volta
    path.join(home, '.asdf/shims'),                // asdf, through its shims
    path.join(home, '.npm-global/bin'),            // the two npm prefixes people
    path.join(home, '.npm-packages/bin'),          // actually write in a guide
    path.join(home, '.yarn/bin'),                  // yarn global
    path.join(home, 'Library/pnpm'),               // pnpm's own bin on macOS
    path.join(home, '.local/share/pnpm'),          // pnpm's own bin on Linux
    path.join(home, '.deno/bin'),                  // deno
    path.join(home, 'bin'),                        // a hand-rolled ~/bin on PATH
    '/opt/local/bin',                              // MacPorts
    '/usr/bin',                                    // packaged by something system-wide
  ];
}

/**
 * ONE BIN DIRECTORY PER INSTALLED NODE, under a name no list can hold. nvm,
 * fnm, n and asdf each keep one per version, so they are READ rather than
 * listed, and a directory that is not there contributes nothing. This is where
 * a global npm install under any of them lands and nowhere else.
 */
export function versionedBinPaths(bin, home = os.homedir(), readdir = defaultReaddir) {
  const under = (dir, tail) => readdir(path.join(home, dir)).map((v) => path.join(home, dir, v, tail));
  return [
    ...under('.nvm/versions/node', `bin/${bin}`),
    ...under('.local/share/fnm/node-versions', `installation/bin/${bin}`),
    ...under('Library/Application Support/fnm/node-versions', `installation/bin/${bin}`),
    ...under('n/versions/node', `bin/${bin}`),
    ...under('.asdf/installs/nodejs', `bin/${bin}`),
  ];
}

function defaultReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

/**
 * A path that is a symlink to nothing. `existsSync` follows the link and says
 * false, which is indistinguishable from nothing being there at all, and the two
 * mean opposite things: both engines' ordinary installs point a stable link at a
 * versioned file and swap that file on every update, so this is the shape of a
 * tool mid-upgrade rather than an odd one.
 */
function defaultDangles(p) {
  try { return !!fs.lstatSync(p) && !fs.existsSync(p); } catch { return false; }
}

/** Newest version folder first, by number and not by spelling. */
function newestFirst(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  }
  return 0;
}

/* ------------------------------- the registry ----------------------------- */

/**
 * WHAT AN ENGINE IS, and the whole of what a new harness has to say:
 *
 *   bin         the program name, which is also its key here
 *   name        what it is called on a screen
 *   installUrl  where to get it, when we are sure it is not here
 *   ownPaths    where the tool's OWN installer puts it, tried before the
 *               package managers because it is the answer the tool produces
 *   appCopies   a copy carried inside a desktop app, tried last of all
 *   evidence    what it leaves behind, which is never spawned and only ever
 *               takes away our right to announce an absence
 */
function engine({ bin, name, installUrl, ownPaths, appCopies = () => [], evidence }) {
  return {
    bin,
    name,
    installUrl,
    ownPaths,
    appCopies,
    evidence,
    // In order, and the first that exists wins. The tool's own paths, then every
    // package manager's bin directory, then one directory per installed Node.
    candidates(home = os.homedir(), readdir = defaultReaddir) {
      return [
        ...ownPaths(home),
        ...sharedBinDirs(home).map((dir) => path.join(dir, bin)),
        ...versionedBinPaths(bin, home, readdir),
      ];
    },
  };
}

export const ENGINES = {
  /**
   * CLAUDE CODE. Required: the app will not open an inbox without it, which is
   * why its absence is the one a screen is ever allowed to shout about.
   *
   * `~/.local/bin/claude` is the installer's own path and `~/.claude/local/claude`
   * is what `claude migrate-installer` leaves behind. The installer points the
   * first at a versioned file and swaps that file on every update, so a dangling
   * link there is a real state and not a hypothetical.
   *
   * THE COPY THE CLAUDE DESKTOP APP KEEPS, one folder per version, newest first.
   * Somebody who has only ever used Claude Code inside the Claude app has this
   * and nothing else (w-9f6975906c, measured 2026-10-05: 2.1.209 there, sharing
   * the CLI's sign-in). Last of all, because it updates when the app does and a
   * real install is fresher -- that copy was three months old beside a 2.1.289
   * install on the same Mac.
   */
  claude: engine({
    bin: 'claude',
    name: 'Claude Code',
    installUrl: 'https://code.claude.com/docs/en/setup',
    ownPaths: (home) => [
      path.join(home, '.local/bin/claude'),    // the installer
      path.join(home, '.claude/local/claude'), // claude migrate-installer
    ],
    appCopies: (home, readdir = defaultReaddir) => {
      const dir = path.join(home, 'Library/Application Support/Claude/claude-code');
      return readdir(dir)
        .filter((v) => /^\d+(\.\d+)*$/.test(v))
        .sort(newestFirst)
        .map((v) => path.join(dir, v, 'claude.app/Contents/MacOS/claude'));
    },
    // WHAT CLAUDE CODE LEAVES BEHIND. Any one of these means it has run on this
    // machine. None is a binary and none is ever spawned.
    evidence: (home) => [
      path.join(home, '.claude.json'),               // its own config file
      path.join(home, '.claude/settings.json'),
      path.join(home, '.claude/projects'),           // one folder per project it has opened
      path.join(home, '.claude/statsig'),
      path.join(home, '.claude/.credentials.json'),  // it has been logged in
      path.join(home, '.claude/history.jsonl'),
      path.join(home, '.local/share/claude'),        // the installer's version store
    ],
  }),

  /**
   * CODEX, and it is OPTIONAL where Claude Code is not. An absence is the
   * ordinary case rather than a fault, so nothing about it ever produces a
   * warning: it just leaves the second engine out of the map
   * `shared/engines.mjs` reads.
   *
   * MEASURED ON A MAC 2026-09-04, because the 2026-08-25 original was written
   * against codex-cli 0.144.0 and six of its assumptions had moved. codex-cli
   * 0.148.0 at /opt/homebrew/bin/codex, a Homebrew CASK rather than a formula,
   * whose bin entry is a SYMLINK into /opt/homebrew/Caskroom/codex/0.148.0/bin.
   * `brew info --cask codex` the same minute: 0.148.0 installed against 0.152.1
   * available, so the moment mid-upgrade where that link points at nothing is a
   * live state and not a story.
   *
   * THE INSTALL METHOD THE DOCS NOW LEAD WITH, `chatgpt.com/codex/install.sh`,
   * read 2026-09-04: `BIN_DIR="${CODEX_INSTALL_DIR:-$HOME/.local/bin}"`,
   * `STANDALONE_ROOT="${CODEX_HOME:-$HOME/.codex}/packages/standalone"`. It links
   * `~/.local/bin/codex` at a versioned file under that root. AND THE STORE KEEPS
   * THE BINARY IN TWO PLACES -- the same script stages `<release>/bin/codex` and
   * links `<release>/codex` beside it (lines 951 and 1021), and `current` is a
   * symlink at the live release -- so both resolve on a machine set up the
   * documented way, each costs one stat call, and listing only one is how the app
   * tells somebody their Codex is missing while they are looking at it.
   *
   * WHAT ~/.codex REALLY HOLDS: 38 entries on that Mac. auth.json, config.toml,
   * sessions/ and history.jsonl are all still there, but the live record moved
   * into state_5.sqlite, thread_history_1.sqlite, logs_2.sqlite and friends,
   * whose names carry a schema number that increments -- sessions/ held 1691
   * rollout files written the day before while history.jsonl had not been
   * touched since 2026-06-03. That is why the directory itself is on the list,
   * last and broad, and why nothing tries to enumerate what is inside it.
   */
  codex: engine({
    bin: 'codex',
    name: 'Codex',
    installUrl: 'https://learn.chatgpt.com/docs/codex/cli',
    ownPaths: (home) => [
      path.join(home, '.local/bin/codex'),      // the shell installer's link
      path.join(home, '.codex/packages/standalone/current/bin/codex'),
      path.join(home, '.codex/packages/standalone/current/codex'),
    ],
    // THE COPY THE CHATGPT APP CARRIES INSIDE ITSELF (w-9f6975906c, measured
    // 2026-10-05: codex-cli 0.158.0-alpha.2, sharing the CLI's sign-in), and the
    // one the Codex desktop app carries (w-d5d632e503, its reported place rather
    // than one measured here). A path that is not there costs one `exists`.
    appCopies: (home) => [
      'Codex.app/Contents/Resources/codex',
      'ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
      'ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
    ].flatMap((p) => [path.join('/Applications', p), path.join(home, 'Applications', p)]),
    // BOTH HOMES ARE LOOKED IN WHEN CODEX_HOME IS SET, on purpose: a CODEX_HOME
    // inherited from somewhere else is not proof the ordinary directory is gone,
    // and the whole job of this list is to make an absence hard to claim.
    evidence: (home, env = process.env) => {
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
    },
  }),
};

export function engineKeys() {
  return Object.keys(ENGINES);
}

function engineFor(key) {
  const found = ENGINES[key];
  if (!found) throw new Error(`no coding agent is declared as ${JSON.stringify(key)}`);
  return found;
}

/* -------------------------------- the shell ------------------------------- */

// The shells worth asking, in order, and never the same one twice. Theirs first
// because it is the one that has their PATH in it; the other two because a
// $SHELL that will not start is a fact about $SHELL and not about the tool.
export function shellProbes(env = process.env) {
  const preferred = env.SHELL || '/bin/zsh';
  const out = [[preferred, '-lic', 4000], [preferred, '-lc', 2500]];
  for (const other of ['/bin/zsh', '/bin/bash']) {
    if (other !== preferred) out.push([other, '-lic', 2500]);
  }
  return out;
}

/**
 * WHAT MAY BE HANDED TO A LOGIN SHELL, AND WHY THIS IS CHECKED AT ALL.
 *
 * The probe below interpolates `bin` into a string a LOGIN, INTERACTIVE shell
 * executes, with their profile loaded, as them. Every caller passes a registry
 * entry's `bin`, which is a literal in this file, so nothing is exploitable --
 * but a `codexBin` read out of zero.config.json reaching this argument is one
 * plausible slice away, and at that point `command -v x; curl | sh` is a string
 * in a file that runs itself.
 *
 * This function looks up program NAMES, so a name is all it takes. An allowlist
 * rather than quoting, because quoting is a thing a later edit can undo without
 * noticing and a shape check is not.
 */
const PROGRAM_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * Ask the person's own login shell, and go on asking until one of them answers.
 * Anything that is not an absolute path to a file that exists is treated as no
 * path: `command -v` also prints shell functions and aliases, and a function
 * name handed to spawn is a crash with a worse message than "not found".
 *
 * `answered` is the strict half. It is true only when every probe that ran came
 * back with a real exit status, and at least one did. One shell that timed out
 * alongside one that said no is not a machine we know anything about.
 *
 * It must be a LOGIN, INTERACTIVE shell, because the version managers put
 * themselves on PATH from `.zprofile` and `.zshrc` and nowhere else. That is the
 * whole reason an npm install is obvious in a terminal and invisible to the app.
 * It is asked more than once because ONE probe that fails to start is not a fact
 * about anybody's machine.
 */
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
      // TWO DIFFERENT SILENCES, AND ONLY ONE OF THEM IS AN ANSWER. A shell that
      // ran and exited non-zero has told us the tool is not on PATH, and that is
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
// of them is a fact about the tool.
function exitedSayingNo(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.signal || e.code === 'ETIMEDOUT' || e.code === 'ENOENT') return false;
  return typeof e.status === 'number';
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

// askShell used to answer with a path or null, and both a real answer and a
// failed probe were null. Anything still handing back the old shape is read as
// an answer, because that is what it always meant.
function shellSaid(result) {
  if (typeof result === 'string') return { path: result, answered: true };
  if (!result || typeof result !== 'object') return { path: null, answered: true };
  return { path: result.path ?? null, answered: result.answered !== false };
}

/**
 * ONE LOGIN SHELL, ASKED ONCE, ANSWERING FOR EVERY ENGINE.
 *
 * MEASURED ON THIS MAC 2026-10-11, against the finished shell-first finder:
 * `findClaudeBin()` and `findCodexBin()` together took 1640, 1432 and 1435 ms
 * cold, and 0 ms with the shell stubbed out. main/main.mjs calls `loadConfig`
 * inside `createWindow` and BEFORE `new BrowserWindow`, so that was not time in
 * the background: it was a second and a half of nothing on screen, added to
 * every launch, and it was the price of asking the shell first.
 *
 * THE COST IS THE SHELL STARTING, NOT THE QUESTION. A login, interactive shell
 * reads the whole profile -- which is the entire reason it can answer at all --
 * and that costs about the same whether it is asked about one program or six.
 * Asking it once per engine paid it once per engine.
 *
 * So this asks about all of them in one command and `warmShellAnswers` seeds
 * every engine's cache from it.
 *
 * IT ONLY EVER ANSWERS POSITIVELY, which is what makes it safe to put in front
 * of the probe that was already here rather than in place of it. A path is
 * taken only when it is absolute, really on the disk, and really named after
 * the engine that asked -- the lines come back in whatever order the shell
 * prints them, and a path handed to the wrong engine would spawn the wrong
 * agent. Nothing here ever records an ABSENCE: `answered` is the subtle half of
 * this file's rules, and the per-engine probe stays the only thing allowed to
 * settle one. So the worst a bad combined answer can do is nothing at all.
 */
export function askShellForAll(bins, { env = process.env, exists = fs.existsSync, run = defaultRun } = {}) {
  for (const bin of bins) {
    if (typeof bin !== 'string' || !PROGRAM_NAME.test(bin)) {
      throw new Error(`askShellForAll looks up program names, and ${JSON.stringify(bin)} is not one`);
    }
  }
  const command = bins.map((b) => `command -v ${b}`).join('; ');
  for (const [shell, flags, timeout] of shellProbes(env)) {
    let out = '';
    try { out = run(shell, [flags, command], timeout); } catch { continue; }
    const found = {};
    for (const line of String(out).split('\n').map((s) => s.trim()).filter(Boolean)) {
      // A function body, an alias line or a bare name is not a path, and a path
      // belongs to the engine whose name it ends with or to nobody.
      if (!line.startsWith('/') || !exists(line)) continue;
      const bin = bins.find((b) => path.basename(line) === b);
      if (bin && !found[bin]) found[bin] = line;
    }
    // A shell that ran has had its turn, whatever it did or did not print.
    return found;
  }
  return {};
}

/**
 * Seed every engine's held shell answer off one probe. Silent either way: a
 * shell that will not start leaves each engine to its own probe, which is
 * exactly what used to happen for all of them.
 */
export function warmShellAnswers({ now = Date.now(), ...how } = {}) {
  let found = {};
  try { found = askShellForAll(engineKeys().map((k) => ENGINES[k].bin), how); } catch { return; }
  for (const key of engineKeys()) {
    const where = found[ENGINES[key].bin];
    if (where) held.set(key, { answer: { path: where, answered: true }, at: now });
  }
}

/**
 * THE SHELL STEP, AND IT MAY NOT TAKE THE SEARCH DOWN WITH IT.
 *
 * It runs FIRST now, so it is the one step whose failure would reach everything
 * after it. A lookup that throws is read as the shell having said nothing: the
 * list still gets its turn, and the throw still does not count as an answer, so
 * it cannot earn the sentence about missing software either.
 */
function askedShell(lookup) {
  try { return shellSaid(lookup()); } catch { return { path: null, answered: false }; }
}

/* -------------------------------- the search ------------------------------ */

/**
 * WHATEVER THE TOOL LEFT BEHIND, or null. None of these is a binary and none is
 * ever spawned; they exist only to stop the app announcing an absence it cannot
 * support. A dangling candidate counts the same way, because an update that has
 * swapped the versioned file out from under a stable link leaves exactly that.
 */
export function installEvidence(key, {
  home = os.homedir(), env = process.env, exists = fs.existsSync, dangles = defaultDangles,
} = {}) {
  const spec = engineFor(key);
  for (const p of spec.evidence(home, env)) if (exists(p)) return p;
  for (const p of spec.candidates(home, () => [])) if (dangles(p)) return p;
  return null;
}

/**
 * THE WHOLE SEARCH, as a pure function of its inputs so a test can put a coding
 * agent anywhere without touching the machine it runs on.
 *
 * Returns { path, found, certain, from, searched, evidence }. `found` is the only
 * claim about the world: it means a file is really there. `certain` says whether
 * we are allowed to tell somebody it is NOT there, so a screen can stay quiet
 * rather than announce an absence it has not established. They come apart in
 * exactly one case that is not a failure, and it is the case worth keeping
 * honest: somebody has set a path that does not exist, so the path stays THEIRS
 * (anything that spawns it should fail naming the path they chose, not one we
 * picked) while the screen says it was not found and offers the install link,
 * the same as any other machine.
 */
export function findEngine(key, {
  configured = null,
  home = os.homedir(),
  env = process.env,
  exists = fs.existsSync,
  shellLookup = null,
  readdir = defaultReaddir,
  dangles = defaultDangles,
} = {}) {
  const spec = engineFor(key);
  if (configured) {
    return {
      path: configured, found: exists(configured), certain: true, from: 'settings',
      searched: [], evidence: null,
    };
  }

  // Desktop Codex can expose newer models than a standalone CLI; explicit pins still win.
  const appPaths = key === 'codex' ? spec.appCopies(home, readdir) : [];
  for (const candidate of appPaths) {
    if (exists(candidate)) return { path:candidate, found:true, certain:true, from:'app', searched:appPaths, evidence:null };
  }
  // THE SHELL FIRST. It is the only source that knows where their tools are.
  // The default probe reads the real environment and the real disk, exactly as
  // both old finders' defaults did: a test that wants to put a tool somewhere
  // hands in `shellLookup`, and one that hands in only a fake `exists` is
  // asking about the LIST, so feeding its fake into the shell step would
  // silently answer a different question.
  const lookup = shellLookup ?? (() => askShell({ bin: spec.bin }));
  const fromShell = askedShell(lookup);
  // Computed either way, because a caller that wants to say where we looked
  // wants it most on the answer it is going to draw.
  const searched = [...appPaths, ...spec.candidates(home, readdir)];
  if (fromShell.path) {
    return { path: fromShell.path, found: true, certain: true, from: 'shell', searched, evidence: null };
  }

  // THEN THE LIST, which is the GUI launch with launchd's thin PATH.
  for (const candidate of searched) {
    if (exists(candidate)) return { path: candidate, found: true, certain: true, from: 'disk', searched, evidence: null };
  }

  // THEN A DESKTOP APP'S OWN COPY, last because it moves with that app's
  // releases and a real install anywhere is fresher.
  for (const candidate of spec.appCopies(home, readdir)) {
    if (exists(candidate)) return { path: candidate, found: true, certain: true, from: 'app', searched, evidence: null };
  }

  // NOT FOUND, AND WHETHER THAT IS KNOWN. Every shell we could reach missed and
  // every cheap path missed, so the last question is whether this machine shows
  // any sign of the tool anyway. If it does, we looked in the wrong places
  // rather than at an empty machine, and nothing may be said out loud.
  const evidence = installEvidence(key, { home, env, exists, dangles });
  return {
    path: null,
    found: false,
    certain: fromShell.answered && !evidence,
    from: null,
    searched,
    evidence,
  };
}

/* -------------------------------- the cache ------------------------------- */
// Only the SHELL step is remembered, and only briefly. Nothing else is: the path
// checks are stat calls, and caching them is how a settings screen ends up
// telling someone to install their coding agent and then still saying "not
// found" after they have. The sentence on that screen makes a promise and a
// cached answer breaks it.
//
// The shell is the one part worth holding, because it is up to three
// subprocesses and a screen somebody toggles a switch on reads settings again on
// every write. Thirty seconds is long enough that a burst of writes pays for it
// once, and short enough that it is never the reason someone is still stuck.
//
// PER ENGINE, because looking for Claude Code tells you nothing about Codex, and
// one shared window would have the second engine read the first one's answer.

const SHELL_TTL = 30_000;
const held = new Map();

export function resolveEngine(key, configured = null, { now = Date.now(), shellLookup = null, ...where } = {}) {
  const spec = engineFor(key);
  const lookup = shellLookup ?? (() => askShell({ bin: spec.bin }));
  const remembered = () => {
    const last = held.get(key);
    // THE WINDOW HAS A FLOOR AS WELL AS A CEILING. `now - at < TTL` alone is
    // true for any answer stamped in the FUTURE, and since `warmShellAnswers`
    // stamps real clock time into this same map, anything asking with a
    // synthetic `now` would read a warm answer as fresh forever. An answer from
    // ahead of the question is not an answer; it is asked again.
    const age = now - (last?.at ?? 0);
    if (last && age >= 0 && age < SHELL_TTL) return last.answer;
    const answer = lookup();
    held.set(key, { answer, at: now });
    return answer;
  };
  return findEngine(key, { ...where, configured, shellLookup: remembered });
}

export function forgetEngine(key) {
  engineFor(key); // an engine nobody declared is a mistake here too, not a no-op
  held.delete(key);
}
