// A screenshot run must not leave Chrome behind.
//
// Each shot-*.mjs starts a headless Chrome against a throwaway profile in /tmp.
// Until 2026-08-18 cleanup was a bare `chrome.kill` as the last statement on
// the happy path, with the profile folder never deleted at all. Anything that
// stopped a script before that line orphaned a Chrome forever, and sessions
// here die mid-run constantly.
//
// What that cost, measured on her machine 2026-08-18 12:14: 12 live orphans,
// the oldest 17 hours old, 93 Chrome processes, and 1,021 abandoned profile
// folders holding 16 GB. It ran the Mac out of application memory and put up a
// dialog she could not dismiss. She force quit Chrome and it "came back", which
// it never did: what she was seeing was the pile, invisible because headless
// Chrome has no window and force quit only closes what you can see.
//
// The two properties that stop it recurring, and the two that stop the cure
// being worse than the disease, are all pinned here.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { guard, isOurChrome, profileOf, sweep } from '../scripts/lib/chrome-guard.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ours = (profile) => `${CHROME} --headless=new --user-data-dir=${profile} about:blank`;

const made = [];
function tmpProfile() {
  const dir = fs.mkdtempSync('/tmp/shot-profile-');
  made.push(dir);
  return dir;
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// A process this test does NOT parent. A child of ours would linger as a zombie
// after being killed, still answering kill(pid, 0), which is not how the real
// orphans behave: their parent is launchd, which reaps them the instant they
// exit. Getting this wrong hides the very ordering bug the sweep had.
const orphan = () =>
  Number(execFileSync('/bin/sh', ['-c', '/bin/sleep 30 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }).trim());
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('which processes count as ours', () => {
  it('claims a headless Chrome on a shot profile', () => {
    expect(isOurChrome({ pid: 2, ppid: 1, command: ours('/tmp/shot-profile-abc') })).toBe(true);
  });

  // The whole reason she suspected malware: her real browser must be untouchable.
  it('never claims the Chrome she browses in', () => {
    const hers = `${CHROME} --user-data-dir=/Users/you/Library/Application Support/Google/Chrome`;
    expect(isOurChrome({ pid: 3, ppid: 1, command: hers })).toBe(false);
  });

  it('never claims another browser, or a process merely mentioning a shot profile', () => {
    const arc = '/Applications/Arc.app/Contents/MacOS/Arc --user-data-dir=/tmp/shot-profile-abc';
    const shell = '/bin/zsh -c rm -rf /tmp/shot-profile-abc';
    expect(isOurChrome({ pid: 4, ppid: 1, command: arc })).toBe(false);
    expect(isOurChrome({ pid: 5, ppid: 1, command: shell })).toBe(false);
  });

  it('reads the profile back out of the command line', () => {
    expect(profileOf(ours('/tmp/shot-profile-Zq2tyA'))).toBe('/tmp/shot-profile-Zq2tyA');
    expect(profileOf('/bin/sleep 30')).toBeUndefined();
  });
});

describe('guard, for every ending Node can see', () => {
  // guard does not care what it was handed, so a sleep stands in for Chrome and
  // the test needs no browser installed.
  it('kills the child and deletes the profile', async () => {
    const profile = tmpProfile();
    const child = spawn('/bin/sleep', ['30']);
    const cleanup = guard(child, profile);
    expect(alive(child.pid)).toBe(true);

    cleanup();
    await settle();

    expect(alive(child.pid)).toBe(false);
    expect(fs.existsSync(profile)).toBe(false);
  });

  it('is safe to run twice', () => {
    const profile = tmpProfile();
    const child = spawn('/bin/sleep', ['30']);
    const cleanup = guard(child, profile);
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });
});

describe('sweep, for the ending Node cannot see', () => {
  // SIGKILL and sleep-death run no handler at all, so the next run reaps.
  it('kills a Chrome whose parent is gone', () => {
    const profile = tmpProfile();
    const stray = orphan();
    sweep({ list: () => [{ pid: stray, ppid: 1, command: ours(profile) }] });
    expect(alive(stray)).toBe(false);
  });

  it('leaves a Chrome whose parent is still alive', async () => {
    const profile = tmpProfile();
    const running = spawn('/bin/sleep', ['30']);
    sweep({ list: () => [{ pid: running.pid, ppid: process.pid, command: ours(profile) }] });
    await settle();
    expect(alive(running.pid)).toBe(true);
    running.kill('SIGKILL');
  });

  it('reclaims a profile folder nothing is using', () => {
    const abandoned = tmpProfile();
    sweep({ list: () => [] });
    expect(fs.existsSync(abandoned)).toBe(false);
  });

  // The bug the first version of this fix shipped with: it signalled the orphan,
  // then read the process list back before the orphan had actually exited, so
  // the folder still looked in use and the 16 GB was never reclaimed.
  it('reclaims the folder of an orphan it just killed', () => {
    const profile = tmpProfile();
    const stray = orphan();
    // Stands in for `ps`: a process that has exited is simply not in the list.
    const list = () => (alive(stray) ? [{ pid: stray, ppid: 1, command: ours(profile) }] : []);

    sweep({ list });

    expect(alive(stray)).toBe(false);
    expect(fs.existsSync(profile)).toBe(false);
  });

  it('keeps the folder of a run that is still going', () => {
    const inUse = tmpProfile();
    sweep({ list: () => [{ pid: process.pid, ppid: process.ppid, command: ours(inUse) }] });
    expect(fs.existsSync(inUse)).toBe(true);
  });

  it('never deletes outside the shot-profile prefix', () => {
    const unrelated = fs.mkdtempSync('/tmp/not-a-shot-profile-');
    try {
      sweep({ list: () => [] });
      expect(fs.existsSync(unrelated)).toBe(true);
    } finally {
      fs.rmSync(unrelated, { recursive: true, force: true });
    }
  });
});

// The fix above is only worth what it covers, and coverage is where it failed
// the first time: the 08-18 pass wired the guard into 35 scripts and left 10
// untouched, because they had been written with their own profile prefixes
// (/tmp/shot-header-profile-, /tmp/probe-profile- and so on) which the guard's
// deliberately narrow matcher could not see. They kept leaking. Nothing caught
// it, because nothing was checking.
//
// So this reads the scripts folder itself rather than a list. Any script anyone
// adds later that starts a Chrome has to be guarded, or this goes red.
describe('every script that starts a Chrome is guarded', () => {
  const dir = new URL('../scripts/', import.meta.url);
  const launchers = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.mjs'))
    .map((n) => ({ name: n, src: fs.readFileSync(new URL(n, dir), 'utf8') }))
    .filter((f) => f.src.includes("spawn('/Applications/Google Chrome.app"));

  // A floor, not a count: it only has to prove the walk above found files at
  // all, so that the per-file checks below are not silently checking nothing.
  // It was 40 while every one-off harness was committed. Those are gitignored
  // now (scripts/scratch/) and the 133 already in the tree were deleted on
  // 2026-09-23, which left seven.
  it('finds the launchers', () => {
    expect(launchers.length).toBeGreaterThan(3);
  });

  it.each(launchers.map((f) => f.name))('%s cleans up after itself', (name) => {
    const { src } = launchers.find((f) => f.name === name);
    expect(src).toContain("from './lib/chrome-guard.mjs'");
    expect(src).toMatch(/\bsweep\(\)/); // reaps what an earlier run abandoned
    expect(src).toMatch(/\bguard\(chrome, profile\)/); // covers this run's own exits
    // The guard only recognises this one prefix, so a private one is a silent leak.
    expect(src).toContain("fs.mkdtempSync('/tmp/shot-profile-')");
  });
});
