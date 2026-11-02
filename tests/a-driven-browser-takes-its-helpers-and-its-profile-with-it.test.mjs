// A DRIVEN BROWSER TAKES ITS HELPERS AND ITS PROFILE WITH IT.
//
// main went red on macOS four runs in a row on
// a-driven-tab-stays-in-front-when-the-app-opens-another, a test whose every
// assertion had already passed: its cleanup killed the Chrome it started and
// deleted the profile folder in the next statement. Killing the one process
// Node started leaves the helpers, and they keep writing into that folder, so
// the delete hits `ENOTEMPTY: directory not empty`. Measured here on Linux
// before the fix: 13 processes still on the profile after that kill, and the
// plain delete threw. Six other tests in this suite already retry the same
// delete.
//
// Stopping a browser now stops everything on its profile first and then deletes
// with retries. The second of those is a race either way, so the case below
// that catches the old cleanup every time is the one about the helpers.
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { stopChrome, freeProfile, holdersOf } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const started = [];
afterEach(() => {
  for (const { bin, profile, dir } of started.splice(0)) {
    freeProfile(profile, bin);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

// A copy of the shell under the browser's own name, so `ps` shows a command
// line that reads like Chrome's: this binary, this profile, and helper
// processes of its own that outlive their parent, as Chrome's dozen do.
//
// Each fills its own corner of the profile in bursts rather than in a spin:
// four of these flat out starve the two-core machine this runs on, and a test
// that takes the box down with it measures nothing.
const HELPER = 'mkdir -p "$1/Default/Cache/$4"; while :; do i=0; while [ $i -lt 20 ]; do i=$((i+1)); echo x > "$1/Default/Cache/$4/page-$i"; done; sleep 0.1; done';
const PARENT = `for t in gpu renderer utility network; do "$0" -c '${HELPER}' "$0" "$1" --type=$t "$2" "$t" & done\nwait`;
const HELPERS = 4;

function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-chrome-'));
  const bin = path.join(dir, 'chrome');
  const profile = path.join(dir, 'profile');
  fs.mkdirSync(profile);
  fs.copyFileSync('/bin/sh', bin);
  fs.chmodSync(bin, 0o755);
  const chrome = spawn(bin, ['-c', PARENT, bin, profile, `--user-data-dir=${profile}`], { stdio: 'ignore' });
  started.push({ bin, profile, dir });
  return { bin, profile, chrome, dir };
}

/** Up and writing: waited for rather than slept through, so a loaded box is no trouble. */
async function settled({ profile, bin }) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const up = holdersOf(profile, undefined, bin).length > HELPERS;
    if (up && fs.readdirSync(path.join(profile, 'Default', 'Cache')).length === HELPERS) return;
    if (Date.now() > deadline) throw new Error(`the stand-in browser never got all ${HELPERS} helpers writing`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A stand-in browser, back once every helper is up and writing. */
async function standInBrowser() {
  const browser = start();
  await settled(browser);
  return browser;
}

const ended = (chrome) => new Promise((r) => (chrome.exitCode === null && chrome.signalCode === null ? chrome.once('exit', r) : r()));

it('stops the helpers too, so none is left holding the profile', async () => {
  const browser = await standInBrowser();

  stopChrome(browser.chrome, browser.profile, { bin: browser.bin });

  expect(holdersOf(browser.profile, undefined, browser.bin)).toEqual([]);
}, 20_000);

it('a helper still writing into the profile cannot fail the delete', async () => {
  const browser = await standInBrowser();
  expect(fs.readdirSync(browser.profile).length).toBeGreaterThan(0);

  stopChrome(browser.chrome, browser.profile, { bin: browser.bin });

  expect(fs.existsSync(browser.profile)).toBe(false);
  await ended(browser.chrome);
  expect(browser.chrome.signalCode).toBe('SIGKILL');
}, 20_000);

it('a browser already gone, and a profile already deleted, are no trouble', async () => {
  const browser = await standInBrowser();
  stopChrome(browser.chrome, browser.profile, { bin: browser.bin });
  expect(() => stopChrome(browser.chrome, browser.profile, { bin: browser.bin })).not.toThrow();
  expect(() => stopChrome(null, path.join(os.tmpdir(), 'never-there-at-all'), { bin: browser.bin })).not.toThrow();
}, 20_000);

it('leaves a browser on another profile alone', async () => {
  const mine = await standInBrowser();
  const theirs = await standInBrowser();

  stopChrome(mine.chrome, mine.profile, { bin: mine.bin });

  expect(holdersOf(theirs.profile, undefined, theirs.bin).length).toBeGreaterThan(HELPERS);
  expect(fs.existsSync(theirs.profile)).toBe(true);
}, 20_000);
