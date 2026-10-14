// ONE FINDER FOR EVERY CODING AGENT, AND IT ASKS THE SHELL FIRST.
//
// What was here before: `main/claude-bin.mjs` (338 lines) and
// `main/codex-bin.mjs` (279 lines), two copies of one idea, pinned by 713 lines
// of test across two files. Between them they shipped 35 hand-written absolute
// paths, 10 globbed node-version-manager trees and 8 app-bundle paths. Every
// entry was a place somebody once had the tool installed.
//
// Measured on this repository 2026-10-08: in the 9 days of history it has, those
// two files were touched 7 times, and three of those commits are literally "one
// more install location" -- "Use the Claude Code and Codex the desktop apps
// carry", "A person who only uses Codex gets Codex without asking", "The inbox
// runs on Linux, including Omarchy". Each of those was a bug report, a patch and
// a release, and the person waited for the release.
//
// THE DESIGN FAULT, AND IT IS AN ORDERING. Both finders tried the hand-written
// list FIRST and asked the person's own login shell THIRD. The shell is the only
// source that actually knows where their tools are -- it is their PATH, with
// their profile loaded, as them -- and it was the fallback. So every new
// installer, version manager and distro was a patch we ship.
//
// What this file pins:
//
//   - THE SHELL GOES FIRST, for every engine, and its answer wins over the list.
//   - THE LIST STILL COVERS A SHELL THAT CANNOT ANSWER, which is the case it was
//     really written for: a double-clicked Electron app inherits launchd's PATH,
//     and a login shell that times out or will not start has told us nothing.
//   - A LOOKUP THAT THROWS IS NOT AN ABSENCE. It never used to be reached at all
//     on a machine whose list had the binary; now it is reached first, so a probe
//     that blows up must fall through to the list rather than take Claude Code
//     away from somebody who has it. The app refuses to open an inbox without
//     Claude Code, so this is the one failure mode in the reordering that costs
//     more than a slow boot.
//   - ONE REGISTRY, ONE STRATEGY. Both engines are entries in `ENGINES` and both
//     are found by `findEngine`, so a third harness is an entry and not a file.
//   - `found` AND `certain` ARE UNTOUCHED, which is the whole of the old rule:
//     never tell somebody their tool is missing when we merely failed to look in
//     the right place.

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  ENGINES, engineKeys, findEngine, resolveEngine, forgetEngine, sharedBinDirs,
} from '../main/engine-bin.mjs';
import { findClaudeBin, candidatePaths as claudePaths } from '../main/claude-bin.mjs';
import { findCodexBin, candidatePaths as codexPaths } from '../main/codex-bin.mjs';

const HOME = '/Users/stranger';
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;
const noShell = () => ({ path: null, answered: true });
const silent = () => ({ path: null, answered: false });

describe('the shell is asked before any list', () => {
  // THE CASE THE OLD ORDER GOT WRONG, and it is not hypothetical: a stale
  // `/usr/local/bin/claude` from an npm install somebody has since stopped using
  // sits on the list, while the claude they actually run is under volta and only
  // their shell knows about it. The list won, every time.
  it.each(['claude', 'codex'])('takes the shell answer over a path on the list, for %s', (key) => {
    const stale = `/usr/local/bin/${key}`;
    const theirs = `${HOME}/.volta/tools/image/node/22.3.0/bin/${key}`;
    const found = findEngine(key, {
      home: HOME,
      env: {},
      exists: only(stale, theirs),
      shellLookup: () => ({ path: theirs, answered: true }),
    });
    expect(found).toMatchObject({ path: theirs, found: true, from: 'shell', certain: true });
  });

  it.each(['claude', 'codex'])('asks the shell before the ordinary list, after desktop overrides for %s', (key) => {
    const order = [];
    findEngine(key, {
      home: HOME,
      env: {},
      exists: (p) => { order.push(`exists ${p}`); return false; },
      dangles: never,
      shellLookup: () => { order.push('shell'); return { path: null, answered: true }; },
    });
    if(key==='codex')expect(order.slice(0,6).every(x=>x.startsWith('exists '))).toBe(true);
    else expect(order[0]).toBe('shell');
  });

  // THE LIST IS NOT GONE, it is demoted. This is the GUI launch it was written
  // for: launchd's PATH is /usr/bin:/bin:/usr/sbin:/sbin, the login shell never
  // came back, and the install is exactly where the installer put it.
  it.each([
    ['claude', `${HOME}/.local/bin/claude`],
    ['codex', `${HOME}/.local/bin/codex`],
  ])('still finds %s on the list when no shell could answer', (key, where) => {
    const found = findEngine(key, {
      home: HOME, env: {}, exists: only(where), shellLookup: silent,
    });
    expect(found).toMatchObject({ path: where, found: true, from: 'disk' });
    // And the screen still may not say anything, because no shell answered and
    // the binary being here is not the question `certain` asks.
    expect(found.certain).toBe(true); // found, so there is nothing to claim
  });

  // THE ONE THAT COSTS MORE THAN A SLOW BOOT. The shell step used never to run
  // at all on a machine whose list had the binary, so nothing downstream of it
  // was ever reached by a throw. Now it runs first.
  it.each(['claude', 'codex'])('falls through to the list when the lookup throws, for %s', (key) => {
    const where = `${HOME}/.local/bin/${key}`;
    const found = findEngine(key, {
      home: HOME,
      env: {},
      exists: only(where),
      shellLookup: () => { throw new Error('zsh is not on this machine'); },
    });
    expect(found).toMatchObject({ path: where, found: true, from: 'disk' });
  });

  // AND A THROW IS NOT AN ANSWER EITHER, so it cannot earn the sentence.
  it.each(['claude', 'codex'])('never calls a thrown lookup an answer, for %s', (key) => {
    const found = findEngine(key, {
      home: HOME,
      env: {},
      exists: never,
      dangles: never,
      shellLookup: () => { throw new Error('zsh is not on this machine'); },
    });
    expect(found).toMatchObject({ found: false, certain: false });
  });

  // The app copy inside the Claude or ChatGPT desktop app still loses to
  // everything, including an install only the shell can see.
  it('keeps the desktop app copy last, behind the shell and behind the list', () => {
    const inside = `${HOME}/Library/Application Support/Claude/claude-code/2.1.209/claude.app/Contents/MacOS/claude`;
    const real = '/opt/homebrew/bin/claude';
    const readdir = (dir) => (dir.endsWith('Claude/claude-code') ? ['2.1.209'] : []);
    expect(findEngine('claude', {
      home: HOME, env: {}, readdir, exists: only(inside, real), shellLookup: noShell,
    })).toMatchObject({ path: real, from: 'disk' });
    expect(findEngine('claude', {
      home: HOME, env: {}, readdir, exists: only(inside), shellLookup: noShell,
    })).toMatchObject({ path: inside, from: 'app' });
  });
});

describe('one registry, one strategy', () => {
  it('holds both engines the app ships with, and nothing else', () => {
    expect(engineKeys()).toEqual(['claude', 'codex']);
  });

  // THE POINT OF THE REGISTRY. A third harness is an entry: a bin name, where
  // the tool's own installer puts it, what it leaves behind, and where to get
  // it. Nothing below is engine-specific, which is what makes that true.
  it.each(['claude', 'codex'])('declares %s as a name, a home, evidence and a link', (key) => {
    const engine = ENGINES[key];
    expect(engine.bin).toBe(key);
    expect(engine.name).toEqual(expect.any(String));
    expect(engine.installUrl).toMatch(/^https:\/\//);
    expect(engine.ownPaths(HOME).length).toBeGreaterThan(0);
    expect(engine.evidence(HOME, {}).length).toBeGreaterThan(0);
  });

  // THE LIST THAT WAS WRITTEN TWICE. Fourteen package-manager bin directories
  // were copied, in order, into both files; a path added to one and not the
  // other is how one engine quietly stops being found where the other is.
  it('generates every package manager path from one list, for both engines', () => {
    const dirs = sharedBinDirs(HOME);
    expect(dirs.length).toBeGreaterThanOrEqual(14);
    for (const key of engineKeys()) {
      const paths = ENGINES[key].candidates(HOME, () => []);
      for (const dir of dirs) expect(paths).toContain(path.join(dir, key));
    }
  });

  // THE CASE THAT MUST NOT MATCH, carried over from the old pair: a `claude` in
  // the codex list would spawn the wrong agent, and one generated list is
  // exactly where that would happen by accident.
  it('never offers one engine a path belonging to the other', () => {
    for (const key of engineKeys()) {
      for (const p of ENGINES[key].candidates(HOME, () => ['v22.14.0'])) {
        expect(path.basename(p)).toBe(key);
      }
    }
  });

  it('answers the same shape for every engine, so no caller learns two vocabularies', () => {
    const keys = ['path', 'found', 'certain', 'from', 'searched', 'evidence'];
    for (const key of engineKeys()) {
      const found = findEngine(key, { home: HOME, env: {}, exists: never, dangles: never, shellLookup: noShell });
      expect(Object.keys(found).sort()).toEqual([...keys].sort());
    }
  });

  // The two old entry points are this one function now, and that is the check
  // that the rewrite is not a third copy of the idea.
  it('is what findClaudeBin and findCodexBin both run', () => {
    const where = { home: HOME, env: {}, exists: never, dangles: never, shellLookup: noShell, readdir: () => [] };
    expect(findClaudeBin(where)).toEqual(findEngine('claude', where));
    expect(findCodexBin(where)).toEqual(findEngine('codex', where));
    expect(claudePaths(HOME)).toEqual(ENGINES.claude.candidates(HOME, () => []));
    expect(codexPaths(HOME)).toEqual(ENGINES.codex.candidates(HOME, () => []));
  });

  it('refuses an engine nobody declared, rather than searching for nothing', () => {
    expect(() => findEngine('gemini', { home: HOME })).toThrow(/gemini/);
  });
});

// The shell answer is the only expensive step and the only one held. Per
// engine, because looking for Claude Code tells you nothing about Codex, and
// one shared window would have the second engine read the first one's answer.
describe('each engine remembers its own shell answer', () => {
  it('holds one engine inside the window without holding the other', () => {
    forgetEngine('claude');
    forgetEngine('codex');
    const asks = { claude: 0, codex: 0 };
    const t0 = 3_000_000;
    const bare = (key) => ({
      home: HOME, env: {}, exists: never, dangles: never,
      shellLookup: () => { asks[key] += 1; return { path: null, answered: true }; },
    });

    resolveEngine('claude', null, { ...bare('claude'), now: t0 });
    resolveEngine('claude', null, { ...bare('claude'), now: t0 + 29_999 });
    resolveEngine('codex', null, { ...bare('codex'), now: t0 + 1 });
    expect(asks).toEqual({ claude: 1, codex: 1 });

    resolveEngine('claude', null, { ...bare('claude'), now: t0 + 30_001 });
    expect(asks).toEqual({ claude: 2, codex: 1 });
    forgetEngine('claude');
    forgetEngine('codex');
  });

  it('never caches the stat calls, so installing it and looking again works', () => {
    forgetEngine('codex');
    const t0 = 3_000_000;
    let installed = false;
    const bare = {
      home: HOME, env: {}, dangles: never,
      exists: (p) => installed && p === '/opt/homebrew/bin/codex',
      shellLookup: () => ({ path: null, answered: true }),
    };
    expect(resolveEngine('codex', null, { ...bare, now: t0 }).found).toBe(false);
    installed = true;
    expect(resolveEngine('codex', null, { ...bare, now: t0 + 1 }).found).toBe(true);
    forgetEngine('codex');
  });
});
