// The "could not find Claude Code" line almost never comes up. Setup once told
// a Mac that runs Claude Code all day that it could not find it, and a false
// claim like that is worse than saying nothing.
//
// The old walk's finish card, the one screen of setup that drew it, went with
// that walk (2026-11-21). What is left is the Settings row and the search itself.
//
// WHEN it may appear: only after the search has done everything it can and come
// back sure. Every row in the table below is a real Mac. Fifteen of them are
// silent and two of them speak, and the two that speak are a machine with no
// trace of Claude Code anywhere and a path the user set that is not there.
//
// The rule underneath all of it: `found` is what we spawn, `certain` is what we
// are entitled to say out loud, and they are not the same value.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findClaudeBin, candidatePaths, evidencePaths, askShell, shellProbes } from '../main/claude-bin.mts';
import { NAME, Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const HOME = '/Users/stranger';
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;
const shellSaidNo = () => ({ path: null, answered: true });
const shellSaidNothing = () => ({ path: null, answered: false });

/* ========================================================================== */
/* WHEN: every state a Mac can be in, and whether Agentbox may speak             */
/* ========================================================================== */

// `maySay` is the only thing on the screen's side of this: it is true when
// Agentbox has established an absence, which is `certain && !found`.
const maySay = (r) => r.certain && !r.found;

describe(`the states where ${NAME} stays quiet about Claude Code`, () => {
  const quiet = [
    ['the installer put it in ~/.local/bin', { exists: only(`${HOME}/.local/bin/claude`) }],
    ['claude migrate-installer moved it', { exists: only(`${HOME}/.claude/local/claude`) }],
    ['Homebrew on Apple Silicon', { exists: only('/opt/homebrew/bin/claude') }],
    ['Homebrew on Intel, or npm -g', { exists: only('/usr/local/bin/claude') }],
    ['bun', { exists: only(`${HOME}/.bun/bin/claude`) }],
    ['volta', { exists: only(`${HOME}/.volta/bin/claude`) }],
    ['asdf, through its shims', { exists: only(`${HOME}/.asdf/shims/claude`) }],
    ['a custom npm prefix', { exists: only(`${HOME}/.npm-global/bin/claude`) }],
    ['pnpm', { exists: only(`${HOME}/Library/pnpm/claude`) }],
    ['MacPorts', { exists: only('/opt/local/bin/claude') }],
    // The version managers, which keep one bin dir per installed Node under a
    // name no fixed list can hold. These are read off disk, not guessed.
    ['nvm, under whichever Node is installed', {
      exists: only(`${HOME}/.nvm/versions/node/v22.3.0/bin/claude`),
      readdir: (d) => (d.endsWith('.nvm/versions/node') ? ['v20.11.0', 'v22.3.0'] : []),
    }],
    ['fnm', {
      exists: only(`${HOME}/.local/share/fnm/node-versions/v22.3.0/installation/bin/claude`),
      readdir: (d) => (d.includes('fnm/node-versions') ? ['v22.3.0'] : []),
    }],
    // Nowhere we know, but the shell knows.
    ['somewhere only the login shell knows about', {
      exists: only('/opt/weird/claude'),
      shellLookup: () => ({ path: '/opt/weird/claude', answered: true }),
    }],
    // NOT FOUND, AND NOT SURE. These are the ones that put the sentence on her
    // screen, and every one of them is a failure of ours read as a fact about
    // her Mac.
    ['nothing found and the login shell timed out', { exists: never, shellLookup: shellSaidNothing }],
    ['nothing found but ~/.claude.json is here', {
      exists: only(`${HOME}/.claude.json`), shellLookup: shellSaidNo,
    }],
    ['nothing found but ~/.claude/projects is here', {
      exists: only(`${HOME}/.claude/projects`), shellLookup: shellSaidNo,
    }],
    ['nothing found but it has been logged in', {
      exists: only(`${HOME}/.claude/.credentials.json`), shellLookup: shellSaidNo,
    }],
    ['the installer symlink is mid-update and points at nothing', {
      exists: never, shellLookup: shellSaidNo,
      dangles: (p) => p === `${HOME}/.local/bin/claude`,
    }],
  ];

  it.each(quiet)('says nothing when %s', (_what, where) => {
    const r = findClaudeBin({ home: HOME, shellLookup: shellSaidNo, dangles: never, ...where });
    expect(maySay(r)).toBe(false);
  });

  // The first thirteen rows are machines that really do have Claude Code, in
  // thirteen different places. Silence there is not enough: the app also has to
  // come away with the path, because that is what every agent is spawned on.
  const INSTALLED = 13;

  it('and on those it has a real path to spawn, not just a quiet screen', () => {
    for (const [what, where] of quiet.slice(0, INSTALLED)) {
      const r = findClaudeBin({ home: HOME, shellLookup: shellSaidNo, dangles: never, ...where });
      expect(r.found, what).toBe(true);
      expect(r.path, what).toBeTruthy();
    }
  });
});

describe('the two states where it may speak', () => {
  it('speaks on a Mac with no sign of Claude Code anywhere, once the shell has said so', () => {
    const r = findClaudeBin({ home: HOME, exists: never, dangles: never, shellLookup: shellSaidNo });
    expect(r).toMatchObject({ found: false, certain: true, evidence: null });
    expect(maySay(r)).toBe(true);
  });

  it('speaks about a path she set herself that is not on this Mac', () => {
    // Her setting is never searched around, so it is the one absence we know
    // without looking anywhere.
    const r = findClaudeBin({ configured: '/gone/claude', home: HOME, exists: never });
    expect(maySay(r)).toBe(true);
    // And the path stays the user's, so anything that spawns it fails naming
    // what the user chose rather than something we picked.
    expect(r.path).toBe('/gone/claude');
  });
});

describe('what "thoroughly validated" is made of', () => {
  it('looks in fifteen known places before it asks anything', () => {
    expect(candidatePaths(HOME).length).toBeGreaterThanOrEqual(15);
    // Every one of them is a real home for this binary and none is a guess at
    // a directory that would not be on PATH anyway.
    for (const p of candidatePaths(HOME)) expect(p.endsWith('/claude')).toBe(true);
  });

  it('reads the version manager directories rather than guessing their names', () => {
    const seen = [];
    findClaudeBin({
      home: HOME, exists: never, dangles: never, shellLookup: shellSaidNo,
      readdir: (d) => { seen.push(d); return []; },
    });
    expect(seen.some((d) => d.includes('.nvm/versions/node'))).toBe(true);
    expect(seen.some((d) => d.includes('fnm/node-versions'))).toBe(true);
    expect(seen.some((d) => d.includes('.asdf/installs/nodejs'))).toBe(true);
  });

  it('asks more than one shell, hers first', () => {
    const probes = shellProbes({ SHELL: '/opt/homebrew/bin/fish' });
    expect(probes.length).toBeGreaterThanOrEqual(3);
    expect(probes[0][0]).toBe('/opt/homebrew/bin/fish');
    // A login, interactive shell, because that is where nvm and friends put
    // themselves on PATH.
    expect(probes[0][1]).toBe('-lic');
    expect(probes.map((p) => p[0])).toContain('/bin/zsh');
    // And never the same shell with the same flags twice.
    const names = probes.map((p) => `${p[0]} ${p[1]}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('does not count a shell that never started, even when another one said no', () => {
    // The mixed case, and it is the honest one: one shell exited saying claude
    // is not on PATH and one could not be started at all. That is not a machine
    // we know anything about.
    let n = 0;
    const answer = askShell({
      env: { SHELL: '/bin/zsh' },
      exists: () => true,
      run: () => {
        n += 1;
        throw n === 1
          ? Object.assign(new Error('exit 1'), { status: 1 })
          : Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
      },
    });
    expect(answer).toMatchObject({ path: null, answered: false });
  });

  it('keeps asking after one shell fails, so a broken $SHELL is not the answer', () => {
    let asked = 0;
    askShell({
      env: { SHELL: '/bin/nope' },
      exists: () => true,
      run: () => { asked += 1; throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); },
    });
    expect(asked).toBeGreaterThan(1);
  });

  it('takes the first shell that names a real file and stops', () => {
    let asked = 0;
    const answer = askShell({
      env: { SHELL: '/bin/zsh' }, exists: () => true,
      run: () => { asked += 1; return '/usr/local/bin/claude\n'; },
    });
    expect(answer).toMatchObject({ path: '/usr/local/bin/claude', answered: true });
    expect(asked).toBe(1);
  });

  it('treats every trace Claude Code leaves behind as a reason to stay quiet', () => {
    for (const trace of evidencePaths(HOME)) {
      const r = findClaudeBin({
        home: HOME, exists: only(trace), dangles: never, shellLookup: shellSaidNo,
      });
      expect(maySay(r), trace).toBe(false);
      expect(r.evidence, trace).toBe(trace);
    }
  });

  it('never lets a trace turn into a path it would try to run', () => {
    const r = findClaudeBin({
      home: HOME, exists: only(`${HOME}/.claude/projects`), dangles: never, shellLookup: shellSaidNo,
    });
    expect(r.found).toBe(false);
    expect(r.path).toBe(null);
  });
});

/*
 * THE ROW MOVED AND GREW A BUTTON, so the two
   claims below are asked of its new shape. What it used to be: a row labelled
   "Claude Code" inside the group headed "Where Agentbox keeps things on this
   Mac", whose sentence was a filesystem path and whose verdict was the word
   "found". A tester went looking for exactly this fact, on this screen, and
   could not see it at all, so it is now the first group on the pane Settings
   opens on, it says "Claude Code is connected" in plain words, and it carries
   a Check again button.

   NEITHER PROPERTY THIS FILE EXISTS FOR HAS CHANGED, which is why these are
   rewritten rather than deleted. An unsure search still may not say "could not
   find", and the download link still appears only where that sentence is true.
   tests/settings-says-whether-claude-code-is-connected.test.mts holds the rest
   of the new screen; this pair stays here, beside the search the rule is about.

   THE CARD IS SHARED WITH CODEX SINCE 2026-09-05 and the three states are drawn
   from a copy table handed in rather than from `CLAUDE` by name
   (`Connection`, Settings.tsx). Both claims below say exactly what they said;
   what moved is the identifier, and the rule they hold is now held for two
   engines at once, which is the whole reason there is one card and not two. */
describe('the settings row', () => {
  const set = read('renderer/src/components/Settings.tsx');

  it('will not say "could not find" off an unsure search either', () => {
    // Three states, decided in one expression, with `found` the only route to
    // the confident sentence and `certain` the only route to the flat no. ONE
    // expression, for every engine drawn through this card.
    expect(set).toContain("if (found) return trouble ? 'trouble' : 'connected';\n  return certain ? 'missing' : 'unsure';");
    expect(set.match(/connectionState\(\{ found, certain, trouble \}\)/g)).toHaveLength(1);
    expect(set).toContain('unsure: `${Name} could not check`');
    expect(set).toContain('unsureSay: `${Name} has not been able to look for Claude Code on this computer.');
  });

  it('offers the download only where the sentence is true', () => {
    const link = set.indexOf('copy.missingLink');
    expect(link).toBeGreaterThan(-1);
    // The gate immediately above it: not found, AND sure about that.
    const gate = set.lastIndexOf('{!found && certain && (', link);
    expect(gate).toBeGreaterThan(-1);
  });

  // And the dot, which is the half a person reads before any sentence. An
  // unsure answer drawn in the live colour is the confident yes this whole
  // file exists to prevent, one surface further on.
  it('never draws an unsure answer as a confident yes', () => {
    expect(set).toContain("<span className={`set-dot ${state === 'connected' ? 'live' : ''}`} />");
  });
});
