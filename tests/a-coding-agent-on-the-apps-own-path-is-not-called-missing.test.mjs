// A CODING AGENT ON THE APP'S OWN PATH IS NOT CALLED MISSING.
//
// WHAT BROKE (QA batch 006, F-131). A brand-new Linux user started
// agentbox-app 0.1.18 from a terminal where `codex` ran, and the first screen
// said "No coding agent found" and offered to install a second copy. The
// binary was at /home/box/.local/bin/codex and that directory was on the
// PATH the app process itself inherited.
//
// WHY THE FINDER MISSED IT. `findEngine` asks the login shell first and walks
// a hand-written list of install directories second. It never reads the PATH
// it was handed. On Debian that is the whole bug: /etc/profile is
//
//     if [ "$(id -u)" -eq 0 ]; then
//       PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
//     else
//       PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games"
//     fi
//
// which overwrites the inherited PATH rather than adding to it. ~/.profile
// normally puts ~/.local/bin back, so most people never notice; anyone whose
// PATH comes from somewhere the profile files do not read -- a container's
// ENV, a desktop session, direnv, nix, a parent shell, or a HOME that has no
// profile yet -- gets a login shell that confidently reports "not on PATH"
// about a program the app could spawn that second.
//
// MEASURED on Debian 13, 2026-10-29, with a tool only on the inherited PATH:
//
//     $ env -i HOME=/tmp/fresh SHELL=/bin/bash PATH="/tmp/bin:/usr/bin:/bin" \
//         bash -lic 'echo "login PATH: $PATH"; command -v mytool || echo NOT FOUND'
//     login PATH: /usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games
//     NOT FOUND
//
// SO THE PATH THE APP WAS STARTED WITH IS NOW A SOURCE, between the shell and
// the list: it is a fact rather than a guess, it costs no subprocess, and it
// is the one place a terminal launch is certain to carry the truth.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findEngine } from '../main/engine-bin.mjs';

const HOME = '/Users/stranger';
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;
/** The shell is sure the tool is not on PATH, which is the case this is about. */
const shellSaidNo = () => ({ path: null, answered: true });

const made = [];
afterAll(() => { for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });
function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

describe('the PATH the app was handed', () => {
  // THE REPORTED CASE. Nothing in their home, nothing the list knows about,
  // and the login shell sure of itself -- but the binary is on PATH.
  it.each(['claude', 'codex'])('finds %s in a directory on PATH that no list holds', (key) => {
    const theirs = `/opt/box/tools/bin/${key}`;
    const found = findEngine(key, {
      home: HOME,
      env: { PATH: '/opt/box/tools/bin:/usr/bin:/bin' },
      exists: only(theirs),
      dangles: never,
      shellLookup: shellSaidNo,
    });
    expect(found).toMatchObject({ path: theirs, found: true, certain: true, from: 'path' });
  });

  // THE BOUNDARY ONE SIDE: the shell still wins when it answers, because it
  // ran as them with their profile loaded and PATH is only what we inherited.
  it('leaves the shell first', () => {
    const theirs = `${HOME}/.volta/bin/codex`;
    const onPath = '/usr/bin/codex';
    const found = findEngine('codex', {
      home: HOME,
      env: { PATH: '/usr/bin' },
      exists: only(theirs, onPath),
      shellLookup: () => ({ path: theirs, answered: true }),
    });
    expect(found).toMatchObject({ path: theirs, from: 'shell' });
  });

  // THE BOUNDARY THE OTHER SIDE: PATH beats the hand-written list, for the
  // reason the shell does. A stale copy somebody stopped using sits on the
  // list; what is on PATH is what their terminal actually runs.
  it('beats a stale copy on the hand-written list', () => {
    const stale = `${HOME}/.npm-global/bin/codex`;
    const live = '/opt/box/tools/bin/codex';
    const found = findEngine('codex', {
      home: HOME,
      env: { PATH: `/opt/box/tools/bin:${HOME}/.npm-global/bin` },
      exists: only(stale, live),
      shellLookup: shellSaidNo,
    });
    expect(found).toMatchObject({ path: live, from: 'path' });
  });

  // THE CASE THAT MUST NOT MATCH, and it decides what gets spawned: a "." or
  // a "node_modules/.bin" on PATH would hand the choice to whatever folder the
  // app happens to be sitting in.
  it('never takes a relative entry on PATH', () => {
    const found = findEngine('codex', {
      home: HOME,
      env: { PATH: '.:node_modules/.bin:../bin' },
      exists: () => true,   // every relative guess would hit, if one were made
      dangles: never,
      shellLookup: shellSaidNo,
    });
    expect(found.from).not.toBe('path');
  });

  // An empty entry (a leading, trailing or doubled colon) means the current
  // directory to a shell, and must not become /codex here either.
  it('never turns an empty entry into a path at the root', () => {
    const looked = [];
    findEngine('codex', {
      home: HOME,
      env: { PATH: ':/opt/box/tools::' },
      exists: (p) => { looked.push(p); return false; },
      dangles: never,
      shellLookup: shellSaidNo,
    });
    expect(looked).not.toContain('/codex');
    expect(looked).toContain('/opt/box/tools/codex');
  });

  // AND AN EMPTY-HANDED SEARCH IS STILL ENTITLED TO SAY SO. This must not turn
  // every absence into an unsure one: the screen that asks somebody to install
  // Claude Code depends on `certain`.
  it('is still certain when PATH holds nothing either', () => {
    const found = findEngine('codex', {
      home: HOME,
      env: { PATH: '/usr/bin:/bin' },
      exists: never,
      dangles: never,
      shellLookup: shellSaidNo,
    });
    expect(found).toMatchObject({ path: null, found: false, certain: true, from: null });
  });

  it('is unchanged when there is no PATH at all', () => {
    const found = findEngine('claude', {
      home: HOME, env: {}, exists: never, dangles: never, shellLookup: shellSaidNo,
    });
    expect(found).toMatchObject({ found: false, certain: true, from: null });
  });
});

// The fake `exists` above tests the strategy; this walks the real fs.
describe('against a real file on a real disk', () => {
  it('finds a codex that is only on PATH, with nothing else to go on', () => {
    const home = tmp('path-home-');
    const bin = tmp('path-bin-');
    const real = path.join(bin, 'codex');
    fs.writeFileSync(real, '#!/bin/sh\n');
    fs.chmodSync(real, 0o755);

    const found = findEngine('codex', {
      home,
      env: { PATH: `${bin}${path.delimiter}${home}/nowhere` },
      // Only the throwaway home and bin are on the disk, so the machine running
      // the suite, which has both agents on it, cannot answer for this.
      exists: (p) => (p.startsWith(home) || p.startsWith(bin)) && fs.existsSync(p),
      shellLookup: shellSaidNo,
    });
    expect(found).toMatchObject({ path: real, found: true, certain: true, from: 'path' });
  });
});
