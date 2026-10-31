// Where each coding agent is installed: one registry and one search for every
// engine the app can run. A new engine is an entry in ENGINES, not a file.
//
// Never tell somebody their coding agent is missing unless we are certain.
// `found` says a runnable file is really there and decides what gets spawned.
// `certain` says we may tell them it is missing, and is meant to be hard to earn.
//
// The user's login shell is asked first, because it has their real PATH and
// profile. Our own PATH is read second: a login shell does not always carry
// the PATH the app was started with, and on Debian /etc/profile replaces it
// outright. The fixed list is third, for when neither can answer: a
// double-clicked Electron app inherits launchd's PATH
// (/usr/bin:/bin:/usr/sbin:/sbin), which has no nvm, volta or Homebrew. A
// shell probe that throws falls through and does not count as an answer.
//
// A path somebody set (`claudeBin`, `codexBin`) wins and is never searched
// around; that is what makes "point at it yourself" work (main/ipc.mjs,
// `zero:engine-bin`).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';

/** Every package manager's default bin directory, in order, shared by all engines. */
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
 * The PATH this app was handed, which a terminal launch carries and a login
 * shell does not always: Debian's /etc/profile overwrites PATH outright, so
 * `command -v` there answers a confident "not installed" about a program the
 * app could spawn this second.
 *
 * Relative entries are dropped. A "." or a "node_modules/.bin" on PATH would
 * let whatever folder the app sits in decide what gets spawned.
 */
export function pathDirs(env = process.env, platform = process.platform) {
  const p = pathsOf(platform);
  const dirs = new Set();
  for (const dir of String(envValue(env, 'PATH', platform) ?? '').split(p.delimiter)) {
    if (dir && p.isAbsolute(dir)) dirs.add(dir);
  }
  return [...dirs];
}

const pathsOf = (platform) => (platform === 'win32' ? path.win32 : path.posix);

/**
 * Windows reads environment keys case-insensitively, and a copy keeps the
 * spelling it was started with. Explorer and PowerShell start it as `Path`.
 */
export function envValue(env, name, platform = process.platform) {
  if (!env) return undefined;
  if (platform !== 'win32') return env[name];
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

/**
 * One bin directory per installed Node. nvm, fnm, n and asdf keep one per
 * version, and a global npm install under them lands only there.
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
 * A symlink to nothing, which `existsSync` cannot tell from no file. Both
 * engines' installers point a stable link at a versioned file and swap it on
 * update, so this is a tool mid-upgrade, not a missing one.
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

/**
 * What a new engine has to declare:
 *
 *   bin         the program name, which is also its key here
 *   name        what it is called on a screen
 *   installUrl  where to get it, when we are sure it is not here
 *   ownPaths    where the tool's own installer puts it, tried first
 *   appCopies   a copy carried inside a desktop app, tried last of all
 *   evidence    files it leaves behind; never spawned, and only ever stop us
 *               saying it is missing
 *   windows     `ownPaths` and the `packageExe` an npm install keeps beside
 *               its shim, both ending in a real .exe
 */
function engine({ bin, name, installUrl, ownPaths, appCopies = () => [], evidence, windows = {} }) {
  const spec = {
    bin,
    name,
    installUrl,
    ownPaths,
    appCopies,
    evidence,
    windows,
    // The first that exists wins.
    candidates(home = os.homedir(), readdir = defaultReaddir, platform = process.platform) {
      if (platform === 'win32') return windowsCandidates(spec, home);
      return [
        ...ownPaths(home),
        ...sharedBinDirs(home).map((dir) => path.join(dir, bin)),
        ...versionedBinPaths(bin, home, readdir),
      ];
    },
  };
  return spec;
}

/**
 * ON WINDOWS ONLY A REAL .exe IS RETURNED. npm's extensionless shim is a
 * `#!/bin/sh` script, and its `.cmd` needs cmd.exe, which strips the quotes
 * from a JSON argument. The npm package keeps the real exe beside the shim.
 */
export function windowsCandidates(spec, home = os.homedir()) {
  return spec.windows.ownPaths?.(home) ?? [];
}

// npm keeps its package beside the shim it writes, so a directory with no
// shim is not looked into.
function windowsExesIn(spec, dir, hasShim) {
  const { packageExe } = spec.windows;
  return [
    path.win32.join(dir, `${spec.bin}.exe`),
    ...(packageExe && hasShim ? [path.win32.join(dir, 'node_modules', ...packageExe)] : []),
  ];
}

export const ENGINES = {
  /**
   * Claude Code is required: the app will not open an inbox without it.
   *
   * The Claude desktop app keeps its own copy, one folder per version, and it
   * shares the CLI's sign-in, so someone who only uses Claude Code inside that
   * app has nothing else. It is tried last because it updates with the app and
   * lags a real install.
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
    // Any one of these means Claude Code has run on this machine.
    evidence: (home) => [
      path.join(home, '.claude.json'),               // its own config file
      path.join(home, '.claude/settings.json'),
      path.join(home, '.claude/projects'),           // one folder per project it has opened
      path.join(home, '.claude/statsig'),
      path.join(home, '.claude/.credentials.json'),  // it has been logged in
      path.join(home, '.claude/history.jsonl'),
      path.join(home, '.local/share/claude'),        // the installer's version store
    ],
    windows: {
      ownPaths: (home) => [path.win32.join(home, '.local', 'bin', 'claude.exe')],
      packageExe: ['@anthropic-ai', 'claude-code', 'bin', 'claude.exe'],
    },
  }),

  /**
   * Codex is optional, so its absence never produces a warning; it is just
   * left out of the map `shared/engines.mjs` reads.
   *
   * Homebrew installs Codex as a cask whose bin entry is a symlink into the
   * Caskroom, so it dangles mid-upgrade. The documented install.sh links
   * `~/.local/bin/codex` into `$CODEX_HOME/packages/standalone`, and each
   * release holds the binary at both `bin/codex` and `codex`, so both are
   * listed. ~/.codex keeps its live state in sqlite files whose names carry a
   * changing schema number, so the directory itself is evidence, last.
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
    // The ChatGPT app's own copy, which shares the CLI's sign-in, and the Codex
    // desktop app's (reported, not verified here).
    appCopies: (home) => [
      'ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
      'Codex.app/Contents/Resources/codex',
    ].flatMap((p) => [path.join('/Applications', p), path.join(home, 'Applications', p)]),
    // Both homes when CODEX_HOME is set: an inherited CODEX_HOME does not prove
    // ~/.codex is unused.
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

// Their $SHELL first, then zsh and bash, because a $SHELL that will not start
// says nothing about the tool.
export function shellProbes(env = process.env) {
  const preferred = env.SHELL || '/bin/zsh';
  const out = [[preferred, '-lic', 4000], [preferred, '-lc', 2500]];
  for (const other of ['/bin/zsh', '/bin/bash']) {
    if (other !== preferred) out.push([other, '-lic', 2500]);
  }
  return out;
}

/**
 * `bin` is interpolated into a command their login shell runs, so only a plain
 * program name is accepted. A config value reaching it would otherwise be shell
 * injection. An allowlist rather than quoting, because a later edit can undo
 * quoting without anyone noticing.
 */
const PROGRAM_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * Ask their login shell until one answers. Only an absolute path to a file that
 * exists counts, because `command -v` also prints functions and aliases.
 * `answered` is true only when at least one probe ran and every probe returned
 * a real exit status. Login and interactive (`-lic`) because version managers
 * add themselves to PATH only in `.zprofile` and `.zshrc`.
 */
export function askShell({ env = process.env, exists = fs.existsSync, run = defaultRun, bin = 'claude' } = {}) {
  const asking = shellQuestion({ env, exists, bin });
  for (let step = asking.next(); ; ) {
    if (step.done) return step.value;
    let reply;
    try { reply = { out: run(...step.value) }; } catch (err) { reply = { err }; }
    step = asking.next(reply);
  }
}

/** `askShell` without holding the window: each probe is awaited. */
export async function askShellLater({ env = process.env, exists = fs.existsSync, run = shellRunnerLater(process.env), bin = 'claude' } = {}) {
  const asking = shellQuestion({ env, exists, bin });
  for (let step = asking.next(); ; ) {
    if (step.done) return step.value;
    let reply;
    try { reply = { out: await run(...step.value) }; } catch (err) { reply = { err }; }
    step = asking.next(reply);
  }
}

// The probes and what their replies mean, written once for both askers: it
// yields each probe to run and is handed back `{ out }` or `{ err }`.
function* shellQuestion({ env, exists, bin }) {
  if (typeof bin !== 'string' || !PROGRAM_NAME.test(bin)) {
    throw new Error(`askShell looks up a program name, and ${JSON.stringify(bin)} is not one`);
  }
  let said = false;
  let inconclusive = false;
  for (const [shell, flags, timeout] of shellProbes(env)) {
    const { out, err } = yield [shell, [flags, `command -v ${bin}`], timeout];
    if (err) {
      // A non-zero exit means not on PATH. A shell that would not start or
      // timed out has told us nothing, and must not count as "not installed".
      if (exitedSayingNo(err)) said = true; else inconclusive = true;
      continue;
    }
    const line = String(out).split('\n').map((s) => s.trim()).filter(Boolean).pop();
    if (line && line.startsWith('/') && exists(line)) return { path: line, answered: true };
    said = true;
  }
  return { path: null, answered: said && !inconclusive };
}

// A timeout and a missing shell also throw here, and neither is a fact about
// the tool.
function exitedSayingNo(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.signal || e.code === 'ETIMEDOUT' || e.code === 'ENOENT') return false;
  return typeof e.status === 'number';
}

/**
 * A SHELL THAT NEVER REACHED THE QUESTION HAS NOT ANSWERED IT (2026-10-15).
 *
 * `[ -z "$TMUX" ] && exec tmux` in .zshrc replaces the shell before `command
 * -v` runs, and tmux with no terminal says "open terminal failed: not a
 * terminal" and exits 1, which is exactly how `command -v` spells "not on
 * PATH". Measured with the real /bin/zsh: a claude that .zshrc put on PATH came
 * back `{ answered: true }`, so the setup screen was entitled to call it
 * missing. `exec fish` was the same with exit 0 and nothing printed.
 *
 * So the runner says a word of its own first and only hands back what comes
 * after it. Without that word the shell never got to the question, and what is
 * thrown carries no exit status, which `exitedSayingNo` reads as no answer.
 * The question itself is unchanged, so a `run` handed in by a test sees the
 * same `command -v x` it always did.
 */
const REACHED = 'agentbox-shell-reached';
const notReached = () => Object.assign(new Error('the shell profile ended the shell before the question ran'), { code: 'ENOTREACHED' });
function afterReached(stdout) {
  const lines = String(stdout ?? '').split('\n');
  const at = lines.map((l) => l.trim()).lastIndexOf(REACHED);
  return at < 0 ? null : lines.slice(at + 1).join('\n');
}

export function shellRunner(env = process.env) {
  return (shell, [flags, command], timeout = 4000) => {
    let out;
    try {
      out = execFileSync(shell, [flags, `echo ${REACHED}; ${command}`], {
        encoding: 'utf8',
        // stdin ignored on purpose: an interactive shell handed a live terminal can
        // sit waiting for input, and this runs on the boot path.
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout,
        // Not SIGTERM: a shell's exit hook can wait forever on it, and this
        // spawn blocks the whole app until the shell has exited (2026-10-16).
        killSignal: 'SIGKILL',
        env,
      });
    } catch (e) {
      if (typeof e?.status === 'number' && !e.signal && afterReached(e.stdout) === null) throw notReached();
      throw e;
    }
    const answer = afterReached(out);
    if (answer === null) throw notReached();
    return answer;
  };
}

function defaultRun(shell, args, timeout = 4000) {
  return shellRunner(process.env)(shell, args, timeout);
}

/**
 * `shellRunner` as a promise, so the window keeps running while the shell
 * starts. Its errors are reshaped into what execFileSync throws, which is what
 * `exitedSayingNo` reads: a timeout carries ETIMEDOUT, a plain non-zero exit a
 * numeric `status`.
 */
export function shellRunnerLater(env = process.env) {
  return (shell, [flags, command], timeout = 4000) => new Promise((resolve, reject) => {
    const child = execFile(shell, [flags, `echo ${REACHED}; ${command}`], {
      encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, env,
    }, (err, stdout) => {
      if (!err) {
        const answer = afterReached(stdout);
        return answer === null ? reject(notReached()) : resolve(answer);
      }
      if (typeof err.code === 'number' && !err.signal) {
        if (afterReached(stdout) === null) return reject(notReached());
        return reject(Object.assign(err, { status: err.code, code: undefined }));
      }
      if (err.killed && err.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') err.code = 'ETIMEDOUT';
      reject(err);
    });
    // The 'ignore' the waiting runner gives stdin: nothing will ever be typed.
    child.stdin?.end();
  });
}

// A lookup that returns a bare path or null (the old shape) counts as answered.
function shellSaid(result) {
  if (typeof result === 'string') return { path: result, answered: true };
  if (!result || typeof result !== 'object') return { path: null, answered: true };
  return { path: result.path ?? null, answered: result.answered !== false };
}

/**
 * One login shell asked once for every engine. Starting the shell is the cost,
 * not the question, and `loadConfig` runs before the window opens, so asking
 * per engine delayed every launch. A path is taken only when it is absolute,
 * exists, and is named after an engine, since lines come back in any order.
 * This never records an absence; only the per-engine probe may settle one.
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
      if (!line.startsWith('/') || !exists(line)) continue;
      const bin = bins.find((b) => path.basename(line) === b);
      if (bin && !found[bin]) found[bin] = line;
    }
    return found;
  }
  return {};
}

/**
 * Seed every engine's cached shell answer from one probe. If the shell fails,
 * each engine falls back to its own probe.
 */
export function warmShellAnswers({ now = Date.now(), platform = process.platform, ...how } = {}) {
  if (platform === 'win32') return;
  let found = {};
  try { found = askShellForAll(engineKeys().map((k) => ENGINES[k].bin), how); } catch { return; }
  for (const key of engineKeys()) {
    const where = found[ENGINES[key].bin];
    if (where) held.set(key, { answer: { path: where, answered: true }, at: now });
  }
}

// A lookup that throws is read as no answer, so the list still gets its turn.
function askedShell(lookup) {
  try { return shellSaid(lookup()); } catch { return { path: null, answered: false }; }
}

/**
 * The first trace the tool left behind, or null. Never spawned; it only stops
 * the app saying the tool is missing. A dangling candidate counts too.
 */
export function installEvidence(key, {
  home = os.homedir(), env = process.env, exists = fs.existsSync, dangles = defaultDangles, platform = process.platform,
} = {}) {
  const spec = engineFor(key);
  for (const p of spec.evidence(home, env)) if (exists(p)) return p;
  for (const p of spec.candidates(home, () => [], platform)) if (dangles(p)) return p;
  return null;
}

/**
 * The whole search, with every machine fact injectable for tests. Returns
 * { path, found, certain, from, searched, evidence }. A configured path that
 * does not exist is still returned as the path, so a spawn fails naming the
 * path they chose, with found false and certain true.
 */
export function findEngine(key, {
  configured = null,
  home = os.homedir(),
  env = process.env,
  exists = fs.existsSync,
  shellLookup = null,
  readdir = defaultReaddir,
  dangles = defaultDangles,
  platform = process.platform,
} = {}) {
  const spec = engineFor(key);
  if (configured) {
    return {
      path: configured, found: exists(configured), certain: true, from: 'settings',
      searched: [], evidence: null,
    };
  }

  // Windows has no login shell holding a PATH of its own. The app inherits the
  // person's PATH, so that and the list are the whole answer.
  const windows = platform === 'win32';
  // The default probe uses the real environment and disk, not the injected
  // `exists`: a test faking only `exists` is asking about the list.
  const lookup = shellLookup ?? (() => askShell({ bin: spec.bin }));
  const fromShell = windows ? { path: null, answered: true } : askedShell(lookup);
  const searched = spec.candidates(home, readdir, platform);
  if (fromShell.path) {
    return { path: fromShell.path, found: true, certain: true, from: 'shell', searched, evidence: null };
  }

  // Our own PATH before the hand-written list, for the reason the shell comes
  // before both: it is where their terminal really resolves the tool, while
  // the list is a guess that can still hold a copy they stopped using.
  for (const dir of pathDirs(env, platform)) {
    const here = windows
      ? windowsExesIn(spec, dir, exists(path.win32.join(dir, `${spec.bin}.cmd`)))
      : [path.posix.join(dir, spec.bin)];
    for (const onPath of here) {
      if (exists(onPath)) return { path: onPath, found: true, certain: true, from: 'path', searched, evidence: null };
    }
  }

  for (const candidate of searched) {
    if (exists(candidate)) return { path: candidate, found: true, certain: true, from: 'disk', searched, evidence: null };
  }

  for (const candidate of windows ? [] : spec.appCopies(home, readdir)) {
    if (exists(candidate)) return { path: candidate, found: true, certain: true, from: 'app', searched, evidence: null };
  }

  // Any trace of the tool means we looked in the wrong places, so we may not
  // say it is missing.
  const evidence = installEvidence(key, { home, env, exists, dangles, platform });
  return {
    path: null,
    found: false,
    certain: fromShell.answered && !evidence,
    from: null,
    searched,
    evidence,
  };
}

// Only the shell answer is held, per engine. The path checks are cheap stat
// calls, and holding them would keep saying "not found" after someone
// installs. The shell is up to three subprocesses and blocks the window while
// it runs, so it is waited for only when nothing is held: at launch, and after
// Check again. An answer older than thirty seconds is still handed back at
// once, and the shell is asked again in the background for the next read.

const SHELL_TTL = 30_000;
const held = new Map();
const asking = new Map();

export function resolveEngine(key, configured = null, { now = Date.now(), shellLookup = null, shellLookupLater = null, ...where } = {}) {
  const spec = engineFor(key);
  const remembered = () => {
    const last = held.get(key);
    if (!last) {
      const answer = (shellLookup ?? (() => askShell({ bin: spec.bin })))();
      held.set(key, { answer, at: now });
      return answer;
    }
    // `age >= 0` too, because `warmShellAnswers` stamps real clock time and a
    // caller with a synthetic `now` would otherwise read it as fresh forever.
    const age = now - last.at;
    const later = shellLookupLater ?? (() => askShellLater({ bin: spec.bin }));
    if (!(age >= 0 && age < SHELL_TTL)) askAgain(key, later, now);
    // A path held from an earlier answer may have been uninstalled since.
    const gone = typeof last.answer?.path === 'string' && !(where.exists ?? fs.existsSync)(last.answer.path);
    if (gone) { askAgain(key, later, now); return { path: null, answered: false }; }
    return last.answer;
  };
  return findEngine(key, { ...where, configured, shellLookup: remembered });
}

/**
 * Ask the shell again off the window's thread and settle once the answer is
 * held, for a caller that promised a fresh look (Check again, setup, the
 * update check). Never rejects.
 */
export function lookAgain(key, { now = Date.now(), shellLookupLater = null, platform = process.platform } = {}) {
  const spec = engineFor(key);
  // The Windows search never reads a shell answer (findEngine).
  if (platform === 'win32') return Promise.resolve();
  return askAgain(key, shellLookupLater ?? (() => askShellLater({ bin: spec.bin })), now);
}

function askAgain(key, lookup, now) {
  if (asking.has(key)) return asking.get(key);
  const turn = new Promise((resolve) => resolve(lookup())).then(
    (answer) => {
      if (asking.get(key) !== turn) return;
      // A shell that timed out under load says nothing, and must not replace
      // an answer that did say something.
      const said = shellSaid(answer);
      const had = held.get(key);
      if (said.path || said.answered || !had) held.set(key, { answer, at: now });
      else held.set(key, { ...had, at: now });
    },
    () => { /* the held answer stands, and the next read asks again */ },
  ).finally(() => { if (asking.get(key) === turn) asking.delete(key); });
  asking.set(key, turn);
  return turn;
}

export function forgetEngine(key) {
  engineFor(key); // throws for an undeclared engine
  held.delete(key);
  // An answer already on its way was asked for before this, so it is dropped.
  asking.delete(key);
}
