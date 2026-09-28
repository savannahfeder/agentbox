// Every screenshot script starts a headless Chrome against a throwaway profile
// in /tmp. Until 2026-08-18 each one killed it with a bare `chrome.kill` as the
// last statement on the happy path, and deleted nothing. So a script that
// threw, or a session that died mid-run, orphaned a Chrome that nothing would
// ever clean up, plus its profile folder.
//
// That is not hypothetical. Measured on her machine 2026-08-18 12:14: 12 live
// orphans, the oldest 17 hours old, 93 Chrome processes holding 1.44 GB, and
// 1,021 leftover profile folders occupying 16 GB of disk. 841 of those folders
// were from a single day. Sessions here die mid-run often, so this was the
// common path, not the rare one.
//
// Two layers, because neither is sufficient alone:
//
// guard cleans up on every exit path Node can observe: normal exit, a throw, an
// unhandled rejection, SIGINT/SIGTERM/SIGHUP. That covers a script that crashes
// and a session that is asked to stop.
//
// sweep covers the one case Node cannot observe: SIGKILL, or the whole machine
// going to sleep and the parent never waking. Nothing runs in-process then, so
// instead every run reaps what earlier runs left behind. It only touches a
// Chrome whose parent is already dead (PPID 1), which can never be the one this
// run just started, and only deletes a profile folder no live process is using.
//
// The two together bound the damage to at most one orphan between runs, instead
// of 841 in a day.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const PREFIX = '/tmp/shot-profile-';
const CHROME = '/Applications/Google Chrome.app';

// Every process on the box, as {pid, ppid, command}. `ps` is the only thing that
// sees processes this one did not start, which is the whole point of the sweep.
export function processes() {
  let out;
  try {
    out = execFileSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 32 << 20 });
  } catch {
    return []; // ps is unavailable; a failed sweep must never fail the screenshot
  }
  return out.split('\n').flatMap((line) => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }] : [];
  });
}

// Deliberately narrow: a real Chrome binary AND one of our throwaway profiles.
// Her own browsing Chrome runs from ~/Library and never matches.
export const isOurChrome = (p) => p.command.startsWith(CHROME) && p.command.includes(`--user-data-dir=${PREFIX}`);

export const profileOf = (command) => command.match(/--user-data-dir=(\/tmp\/shot-profile-[A-Za-z0-9]+)/)?.[1];

function rm(dir) {
  if (!dir?.startsWith(PREFIX)) return; // never delete outside the prefix
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function kill(pid, signal) {
  try { process.kill(pid, signal); return true; } catch { return false; }
}

/**
 * Kill headless Chromes left behind by earlier runs, and delete profile folders
 * nothing is using. Safe to call at any time; it cannot touch a live run's own
 * Chrome, whose parent is by definition still alive.
 *
 * `list` is injectable only so the tests can drive it without a real Chrome.
 */
export function sweep({ list = processes } = {}) {
  // PPID 1 means launchd adopted it, which means whoever started it has exited.
  const orphans = list().filter(isOurChrome).filter((p) => p.ppid === 1);
  for (const p of orphans) kill(p.pid, 'SIGTERM');

  // Wait for them to actually go before deciding which folders are still in
  // use. Without this the folder of a Chrome we just signalled still looks live,
  // and the disk never gets reclaimed. Measured 2026-08-18: the orphan died and
  // its 16 GB of folders stayed.
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && orphans.some((p) => kill(p.pid, 0))) {
    try { execFileSync('/bin/sleep', ['0.05']); } catch { break; }
  }
  for (const p of orphans) if (kill(p.pid, 0)) kill(p.pid, 'SIGKILL');

  // A folder is in use if any surviving Chrome still points at it.
  const live = new Set(list().filter(isOurChrome).map((p) => profileOf(p.command)).filter(Boolean));
  let dirs = [];
  try { dirs = fs.readdirSync('/tmp').filter((n) => n.startsWith('shot-profile-')).map((n) => `/tmp/${n}`); } catch {}
  for (const dir of dirs) if (!live.has(dir)) rm(dir);
}

/**
 * Make one Chrome and its profile folder go away on every exit path this
 * process can observe. Returns a cleanup function; calling it early is fine and
 * calling it twice is a no-op.
 */
export function guard(chrome, profile) {
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    if (chrome?.pid && !chrome.killed) {
      kill(chrome.pid, 'SIGTERM');
      // Chrome ignores TERM while it is shutting a renderer down. Give it a
      // moment, then insist, so a wedged one cannot outlive us.
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && kill(chrome.pid, 0)) {
        try { execFileSync('/bin/sleep', ['0.05']); } catch { break; }
      }
      if (kill(chrome.pid, 0)) kill(chrome.pid, 'SIGKILL');
    }
    rm(profile);
  };

  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => { cleanup(); process.exit(sig === 'SIGINT' ? 130 : 143); });
  }
  process.on('uncaughtException', (err) => { cleanup(); console.error(err); process.exit(1); });
  process.on('unhandledRejection', (err) => { cleanup(); console.error(err); process.exit(1); });

  return cleanup;
}
