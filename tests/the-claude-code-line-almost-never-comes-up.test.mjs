// The "could not find Claude Code" line almost never comes up. Setup once told
// a Mac that runs Claude Code all day that it could not find it, and a false
// claim like that is worse than saying nothing.
//
// Two halves, and this file is the pin on both.
//
// WHERE it may appear: one place, the finish card, which is the last thing in
// the walk. It used to be a footnote under the folder card, the second screen
// anybody sees. Those screens are rendered here rather than grepped, so the
// count is of what a person would actually read.
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
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findClaudeBin, candidatePaths, evidencePaths, askShell, shellProbes } from '../main/claude-bin.mjs';
import { Onboarding } from '../renderer/src/components/Onboarding.tsx';
import { COPY, RUN_START } from '../renderer/src/onboarding.ts';
import { NAME, Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

/* ========================================================================== */
/* WHERE: one screen in the whole walk, and it is the last one                 */
/* ========================================================================== */

const STEPS = ['welcome', 'folder', 'name', 'make', 'task', 'working', 'open', 'answer', 'clear', 'command', 'done'];

const drawWalk = (step, claude) => renderToStaticMarkup(createElement(Onboarding, {
  run: { ...RUN_START, step, folder: '/Users/stranger/code/cascade', product: 'cascade', name: 'Cascade' },
  claude,
  home: HOME,
  onEvent: () => {}, onStep: () => {}, onSkipToApp: () => null, onDone: () => {},
}));

describe('where the line can appear in the walk', () => {
  const saying = { missing: true, url: 'https://code.claude.com/docs/en/setup' };

  it('appears on exactly one of the eleven screens', () => {
    const on = STEPS.filter((s) => drawWalk(s, saying).includes(COPY.missing));
    expect(on).toEqual(['done']);
  });

  it('and that one is the last one, the finish card', () => {
    const html = drawWalk('done', saying);
    expect(html).toContain(COPY.missing);
  });

  // AND ON THAT CARD IT IS NO LONGER A FOOTNOTE UNDER A BUTTON.It is the
  // card's own line now, under a headline that names it, with the celebration
  // gone. The full rule and the gate it belongs to are pinned in
  // tests/the-inbox-does-not-open-without-claude-code.test.mjs.
  it('is the card, not a note at the bottom of one', () => {
    const html = drawWalk('done', saying);
    expect(html).toContain(COPY.gateHead);
    expect(html.indexOf(COPY.missing)).toBeGreaterThan(html.indexOf(COPY.gateHead));
    expect(html).not.toContain(COPY.finishHead);
    expect(html).not.toContain('fr-warn');
  });

  it('is on no screen at all, the finish card included, when nothing is certain', () => {
    const quiet = { missing: false, url: '' };
    for (const step of STEPS) expect(drawWalk(step, quiet)).not.toContain(COPY.missing);
  });

  it('leaves the folder screen with nothing on it but the folder question', () => {
    // This is the screen it lived under until 2026-08-23, and the screen where
    // the false claim was seen.
    const html = drawWalk('folder', saying);
    // w-ec62ab6b38 (2026-09-28): the folder screen was rebuilt; its question is now the heading and lede.
    expect(html).toContain(COPY.folderHead);
    expect(html).toContain(COPY.folderLede);
    expect(html).not.toContain(COPY.folderQ);
    expect(html).not.toMatch(/Claude Code/);
  });

  it('carries the install link with it, so the one time it appears it is useful', () => {
    const html = drawWalk('done', saying);
    expect(html).toContain(COPY.missingLink);
    expect(html).toContain('https://code.claude.com/docs/en/setup');
  });

  it('does not let a keystroke close the card out from under it', () => {
    // The finish card ends on any key when there is nothing on it to read, and
    // it took ⌘↵ while this line was a footnote on it. Now the card carrying
    // this line has NO key that ends the walk at all, because there is no way
    // into the inbox on it to reach. The listener is not
    // registered on a blocked card.
    //
    // AND IT IS NOT REGISTERED ON A CARD WITH THE USER'S AGENTS ON IT EITHER. That
    // card is <ImportAgents> now and it owns the keyboard: ⌘↵ is its first
    // door and Escape steps back off its second screen. Two listeners on one
    // card is the fault this walk already has a rule about.
    //
    // AND SINCE 2026-08-28 THE LISTENER IS GONE OUTRIGHT. Every Mac that is
    // not blocked gets <ImportAgents> now, empty or full, so there is no state
    // left in which this component wants a key of its own. What is asserted
    // has not changed: no keystroke registered here can end the walk while
    // this line is on the screen.
    const walk = strip(read('renderer/src/components/Onboarding.tsx'));
    const fin = walk.slice(walk.indexOf('function Finished('), walk.indexOf('export function Landed('));
    expect(fin).not.toContain("addEventListener('keydown'");
    expect(fin).not.toContain('const holds =');
  });
});

describe('when the walk even asks the question', () => {
  const app = strip(read('renderer/src/App.tsx'));

  it('does not ask until the walk has reached its last step', () => {
    // The read used to fire on the first render of the walk, which is also the
    // least time the search has ever had to run in.
    expect(app).toMatch(/const atEnd = !!run && run\.step === 'done';/);
    expect(app).toMatch(/if \(!atEnd\) return;/);
  });

  it('still only believes an answer that arrived and is sure', () => {
    expect(app).toMatch(/const sure = s\.ok !== false && s\.workspace\?\.claudeCertain === true;/);
    expect(app).toMatch(/missing: sure && !s\.workspace\?\.claudeFound/);
  });

  it('starts saying nothing, so a read that never lands never draws it', () => {
    expect(app).toMatch(/useState\(\{ missing: false, url:/);
  });
});

/* ========================================================================== */
/* THE OTHER SCREEN THAT SAYS IT: settings                                    */
/* ========================================================================== */

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
   tests/settings-says-whether-claude-code-is-connected.test.mjs holds the rest
   of the new screen; this pair stays here, beside the walk's copy of the same
   rule, because it is one rule on two surfaces.

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
    expect(set).toMatch(/const label = found \? copy\.connected : certain \? copy\.missing : copy\.unsure;/);
    expect(set.match(/const label = found \?/g)).toHaveLength(1);
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
    expect(set).toMatch(/<span className=\{`set-dot \$\{found \? 'live' : ''\}`\} \/>/);
  });
});
