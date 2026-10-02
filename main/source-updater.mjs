// A COPY RUN FROM SOURCE KEEPS ITSELF CURRENT TOO (w-7a39dace23, 2026-10-01).
//
// Teammates run the team build from a git checkout (docs/team/PLAN.md), and
// main/updater.mjs cannot help them: electron-updater reads published releases
// and does nothing at all unpackaged. Their updates are pushes to main, several
// a day, so this watches the branch instead of a release feed.
//
// WHAT IT DOES. A few seconds after launch, and then every half hour, it runs
// `git fetch` and asks whether the branch's upstream is ahead of the code this
// process booted from. If it is, the state goes to `ready` and the sidebar
// shows the "New version ready" card (renderer/src/components/SidebarUpdate.tsx),
// which names what changed when pointed at.
// Pressing Restart fast-forwards the folder, reinstalls packages only when
// package.json or the lockfile changed, rebuilds the screens, and relaunches.
// Nothing happens until that button is pressed.
//
// IT NEVER TOUCHES WORK SOMEBODY HAS NOT PUSHED. Four cases get no offer at
// all, each stated in `error` so Settings can say why: a folder that is not a
// checkout, a branch that follows nothing, tracked files with edits in them,
// and a branch with commits of its own. The founder's own app runs from a
// local branch with no upstream, so it is untouched by this. Untracked files
// (zero.config.json, cloud/team.config.json) do not count as edits: they are
// ignored or new, and a fast-forward cannot overwrite them without failing.
//
// "AHEAD OF WHAT IS RUNNING", NOT "AHEAD OF THE FOLDER". The code in memory is
// what booted, so the folder brought up to date by hand without a restart is
// still an update waiting, and the row says so.
//
// IF THE BUILD FAILS IT DOES NOT RESTART. The row comes back with what went
// wrong, and pressing Restart again retries from where it stopped. Restarting
// onto screens that did not build would be the one outcome worse than waiting.

import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { describe } from './updater.mjs';

const FIRST_CHECK_MS = 20_000;
const EVERY_MS = 30 * 60 * 1000;
const FETCH_MS = 60_000;
const INSTALL_MS = 10 * 60 * 1000;
const BUILD_MS = 5 * 60 * 1000;
// How many change titles the row lists. The rest are counted, not named.
const LISTED = 5;

const SAY = {
  notRepo: 'This folder is not a git checkout, so it does not update itself.',
  noUpstream: 'This copy\'s branch does not follow a branch on GitHub, so it does not update itself.',
  dirty: 'This folder has changes of your own in it, so it does not update itself.',
  diverged: 'This copy has commits of its own, so it does not update itself.',
  offline: 'Could not reach GitHub.',
};

function gitIn(appDir) {
  return (args, { timeout = 30_000 } = {}) => new Promise((resolve) => {
    execFile('git', args, {
      cwd: appDir,
      timeout,
      // Never a password prompt from a background check. The repository is
      // public; anything that asks for credentials is a failure to report.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 4 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout).trim(), err: String(stderr).trim() });
    });
  });
}

function collect(bin, args, { cwd, timeout }) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(bin, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: 1, out: String(e?.message ?? e) });
      return;
    }
    const keep = (b) => { out = (out + b).slice(-64 * 1024); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => { keep('\nerror: timed out'); child.kill('SIGTERM'); }, timeout);
    child.on('error', (e) => { keep(`\nerror: ${e.message}`); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out }); });
  });
}

// WHICH npm. Started with `npm start`, the process carries npm's own path in
// its environment, so that one is used and nvm or a version manager never
// matters. Started any other way, her login shell is asked, the way
// main/claude-bin.mjs finds Claude Code. The arguments are fixed strings from
// this file, never anything read from disk.
export function defaultNpm(appDir, env = process.env) {
  return (args) => {
    const timeout = args[0] === 'install' ? INSTALL_MS : BUILD_MS;
    const node = env.npm_node_execpath;
    const cli = env.npm_execpath;
    if (node && cli && fs.existsSync(node) && fs.existsSync(cli)) {
      return collect(node, [cli, ...args], { cwd: appDir, timeout });
    }
    const shell = env.SHELL || '/bin/zsh';
    return collect(shell, ['-lic', `npm ${args.join(' ')}`], { cwd: appDir, timeout });
  };
}

// The line of a failed build worth showing a person: the first that says
// error, else the last thing it printed.
export function failureLine(out) {
  const lines = String(out ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const named = lines.find((l) => /error/i.test(l));
  const line = named ?? lines[lines.length - 1] ?? 'it stopped without saying why';
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

export function createSourceUpdater({
  appDir,
  app = null,
  log = console,
  onChanged = () => {},
  npm = defaultNpm(appDir),
  relaunch = () => { app?.relaunch(); app?.quit(); },
} = {}) {
  const git = gitIn(appDir);
  // The commit this process booted from. Read once, now, because it is the
  // code in memory and nothing on disk can change that.
  let bootHead = null;
  try {
    bootHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch { /* not a checkout; check() says so */ }

  let state = {
    phase: 'idle',
    source: true,
    currentVersion: bootHead ? bootHead.slice(0, 7) : null,
    newVersion: null,
    percent: null,
    error: null,
    checkedAt: null,
    readyAt: null,
    changes: [],
    behind: null,
  };
  let timer = null;
  let stopped = false;
  let pending = Promise.resolve();

  const set = (next) => {
    state = { ...state, ...next };
    try { onChanged(describe(state)); } catch {}
  };

  // Everything that has to be true before an update is offered or applied.
  // Returns the upstream commit, or the sentence saying why not.
  async function preconditions() {
    if (!bootHead) return { why: SAY.notRepo };
    const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (upstream.code !== 0) return { why: SAY.noUpstream };
    const dirty = await git(['status', '--porcelain', '--untracked-files=no']);
    if (dirty.code !== 0 || dirty.out) return { why: SAY.dirty };
    const ahead = await git(['merge-base', '--is-ancestor', 'HEAD', '@{u}']);
    if (ahead.code !== 0) return { why: SAY.diverged };
    const up = await git(['rev-parse', '@{u}']);
    if (up.code !== 0 || !up.out) return { why: SAY.noUpstream };
    return { up: up.out };
  }

  async function check() {
    if (stopped) return describe(state);
    if (state.phase === 'checking' || state.phase === 'installing') return describe(state);
    if (!bootHead) {
      set({ phase: 'unsupported', error: SAY.notRepo, checkedAt: Date.now() });
      return describe(state);
    }
    const was = state;
    set({ phase: 'checking' });
    // A failed fetch is not the end of the check: what was fetched before is
    // still on disk, and an update already found stays offered on a plane.
    const fetched = await git(['fetch', '--quiet'], { timeout: FETCH_MS });
    if (fetched.code !== 0) log.warn?.('[source-updater] fetch failed:', fetched.err.split('\n')[0]);
    const ok = await preconditions();
    if (ok.why) {
      set({ phase: 'unsupported', error: ok.why, newVersion: null, changes: [], behind: null, readyAt: null, checkedAt: Date.now() });
      return describe(state);
    }
    if (ok.up === bootHead) {
      set(fetched.code === 0
        ? { phase: 'current', error: null, newVersion: null, changes: [], behind: null, readyAt: null, checkedAt: Date.now() }
        : { phase: 'error', error: SAY.offline, checkedAt: Date.now() });
      return describe(state);
    }
    const range = `${bootHead}..${ok.up}`;
    const titles = await git(['log', '--no-merges', '--format=%s', `-n${LISTED}`, range]);
    const count = await git(['rev-list', '--no-merges', '--count', range]);
    const newVersion = ok.up.slice(0, 7);
    set({
      phase: 'ready',
      newVersion,
      changes: titles.code === 0 && titles.out ? titles.out.split('\n') : [],
      behind: count.code === 0 ? Number(count.out) || 0 : null,
      // Stamped when THIS version was first seen, so a recheck does not make
      // old news young again, and a newer push does.
      readyAt: was.phase === 'ready' && was.newVersion === newVersion && was.readyAt ? was.readyAt : Date.now(),
      // A failed earlier restart keeps saying so until the next press.
      error: was.phase === 'ready' && was.newVersion === newVersion ? was.error : null,
      checkedAt: Date.now(),
    });
    return describe(state);
  }

  async function apply() {
    const ok = await preconditions();
    if (ok.why) {
      set({ phase: 'unsupported', error: ok.why, newVersion: null, changes: [], behind: null, readyAt: null });
      return;
    }
    const head = await git(['rev-parse', 'HEAD']);
    if (head.out !== ok.up) {
      const merged = await git(['merge', '--ff-only', '--quiet', '@{u}']);
      if (merged.code !== 0) {
        set({ phase: 'ready', error: `Could not bring the new code in: ${failureLine(merged.err || merged.out)}` });
        return;
      }
    }
    // Packages changed when either file's object id moved. Compared by id
    // rather than by asking git for a diff, which this process does in exactly
    // one file (tests/the-old-git-diff-screen-stays-gone.test.mjs).
    let depsMoved = false;
    for (const file of ['package.json', 'package-lock.json']) {
      const was = await git(['rev-parse', '--verify', '--quiet', `${bootHead}:${file}`]);
      const now = await git(['rev-parse', '--verify', '--quiet', `HEAD:${file}`]);
      if (was.out !== now.out) depsMoved = true;
    }
    if (depsMoved) {
      const installed = await npm(['install', '--no-audit', '--no-fund']);
      if (installed.code !== 0) {
        set({ phase: 'ready', error: `The new packages would not install: ${failureLine(installed.out)}` });
        return;
      }
    }
    const built = await npm(['run', 'build']);
    if (built.code !== 0) {
      set({ phase: 'ready', error: `The new code would not build: ${failureLine(built.out)}` });
      return;
    }
    log.info?.('[source-updater] built', state.newVersion, '- relaunching');
    relaunch();
  }

  // THE BUTTON. Returns at once; the work takes about a minute and the row
  // says "Updating" while it runs.
  function install() {
    if (stopped || state.phase !== 'ready') return false;
    set({ phase: 'installing', error: null });
    pending = apply().catch((e) => {
      set({ phase: 'ready', error: `The update stopped: ${failureLine(e?.message ?? e)}` });
    });
    return true;
  }

  function start() {
    if (stopped || timer) return;
    const tick = () => { void check(); };
    setTimeout(tick, FIRST_CHECK_MS).unref?.();
    timer = setInterval(tick, EVERY_MS);
    timer.unref?.();
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    check: () => check(),
    install,
    state: () => describe(state),
    // For tests: resolves when a started install has finished, either way.
    settled: () => pending,
  };
}
