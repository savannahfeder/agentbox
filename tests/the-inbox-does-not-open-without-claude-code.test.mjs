// The inbox does not open on a Mac without Claude Code. The finish card of the
// walk used to celebrate with a "Claude Code not found" line tucked under its
// button, which is a contradiction: without Claude Code there is nothing to
// open.
//
// Three things to pin, and they are the three sections of this file.
//
//   1. WHEN THE GATE CLOSES. Only on a certain answer, which is the whole
//      safety of it. A search that failed must never lock somebody out of their
//      own app, and this is the same `certain` rule that keeps the line quiet
//      (tests/the-claude-code-line-almost-never-comes-up.test.mjs). Sixteen
//      real Macs go through it here and one of them is gated.
//
//   2. WHAT THE CARD IS. Not a celebration with a warning under it. On the
//      blocked card there is no confetti, no headline about being ready, no
//      agents to import, and no Open my inbox anywhere on it. These are
//      rendered rather than grepped, so the count is of what somebody reads.
//
//   3. THAT THERE IS NO WAY PAST IT. Not by pressing a key, not by ⌘↵, and not
//      by a press arriving at `finishRun` from anywhere else.
//
// And the way THROUGH it is a real search: `recheckClaude` throws the
// remembered shell answer away first, so somebody who installs Claude Code and
// presses the button inside thirty seconds is answered by a search rather than
// by a memory.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { findClaudeBin } from '../main/claude-bin.mjs';
import { claudeState, recheckClaude } from '../main/settings.mjs';
import { forgetClaudeBin } from '../main/claude-bin.mjs';
import { Onboarding } from '../renderer/src/components/Onboarding.tsx';
import { COPY, RUN_START, finishCard, mayOpenInbox } from '../renderer/src/onboarding.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HOME = '/Users/stranger';
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;
const shellSaidNo = () => ({ path: null, answered: true });
const shellSaidNothing = () => ({ path: null, answered: false });

/* ========================================================================== */
/* 1. WHEN THE GATE CLOSES                                                    */
/* ========================================================================== */

// The renderer's own sentence, from App.tsx: an answer is only acted on when it
// arrived and it was sure.
// THE USER'S MAC, READ, WITH AGENTS ON IT: the ordinary case, and the one where every
// other answer of `finishCard` is a card rather than a straight walk in.
const READ = { read: true, some: true };
const gateShuts = (r) => finishCard({ missing: r.certain && !r.found }, READ).blocked;

describe('the one Mac the walk will not let into the inbox', () => {
  it('is the one with no Claude Code and no trace of it anywhere', () => {
    const r = findClaudeBin({
      home: HOME, exists: never, dangles: never, shellLookup: shellSaidNo,
    });
    expect(r).toMatchObject({ found: false, certain: true });
    expect(gateShuts(r)).toBe(true);
  });

  const open = [
    ['Claude Code is installed', { exists: only(`${HOME}/.local/bin/claude`) }],
    ['Homebrew has it', { exists: only('/opt/homebrew/bin/claude') }],
    ['only the login shell knows where it is', {
      exists: only('/opt/weird/claude'),
      shellLookup: () => ({ path: '/opt/weird/claude', answered: true }),
    }],
    // AND EVERY UNSURE STATE. This is the half that matters most: an answer we
    // could not establish opens the gate, because shutting somebody out of
    // their own app on a search that merely failed is worse than the false
    // line this started with.
    ['no shell would start, so nothing was established', { shellLookup: shellSaidNothing }],
    ['one shell said no and one never started', { shellLookup: shellSaidNothing }],
    ['this Mac has run Claude Code before', { exists: only(`${HOME}/.claude.json`) }],
    ['this Mac has Claude Code projects on it', { exists: only(`${HOME}/.claude/projects`) }],
    ['there are credentials for it', { exists: only(`${HOME}/.claude/.credentials.json`) }],
  ];

  for (const [what, how] of open) {
    it(`opens for a Mac where ${what}`, () => {
      const r = findClaudeBin({
        home: HOME, exists: never, dangles: never, shellLookup: shellSaidNo, ...how,
      });
      expect(gateShuts(r)).toBe(false);
    });
  }

  it('opens when the page could not read its own settings at all', () => {
    // `missing` starts false in App.tsx and a read that never lands leaves it
    // false. A copy of Agentbox that cannot reach its own main process knows
    // nothing about this Mac and may not act on that.
    const app = strip(read('renderer/src/App.tsx'));
    expect(app).toMatch(/useState\(\{ missing: false, url:/);
    expect(app).toMatch(/const sure = s\.ok !== false && s\.workspace\?\.claudeCertain === true;/);
    expect(finishCard({ missing: false }, READ).go).toBe(true);
  });

  it('says the same thing in one place, so the card and the guard cannot disagree', () => {
    expect(mayOpenInbox({ missing: true })).toBe(false);
    expect(mayOpenInbox({ missing: false })).toBe(true);
    expect(finishCard({ missing: true }, READ)).toMatchObject({ show: true, blocked: true, go: false });
    expect(finishCard({ missing: false }, READ)).toMatchObject({ show: true, blocked: false, go: true });
    // AND THE GATE OUTRANKS THE EMPTY CARD. A Mac with no agent files gets the
    // import card with its empty answer on it since 2026-08-28, but not this
    // one: a Mac with no Claude Code is stopped whatever else is true of it.
    expect(finishCard({ missing: true }, { read: true, some: false }))
      .toMatchObject({ show: true, blocked: true, go: false });
    expect(finishCard({ missing: false }, { read: true, some: false }))
      .toMatchObject({ show: true, blocked: false });
    // And a Mac still being read is not drawn on at all.
    expect(finishCard({ missing: false }, { read: false, some: false }))
      .toMatchObject({ show: false, blocked: false });
  });
});

/* ========================================================================== */
/* 2. WHAT THE BLOCKED CARD IS                                                */
/* ========================================================================== */

const AGENTS = {
  user: [{ name: 'reviewer', title: 'Reviewer', path: `${HOME}/.claude/agents/reviewer.md`, line: 'Reads a diff' }],
  project: [],
};

const draw = (claude, props = {}) => renderToStaticMarkup(createElement(Onboarding, {
  run: {
    ...RUN_START, step: 'done',
    folder: `${HOME}/code/cascade`, product: 'cascade', name: 'Cascade',
  },
  claude,
  home: HOME,
  onEvent: () => {}, onStep: () => {}, onSkipToApp: () => null, onDone: () => {},
  ...props,
}));

const BLOCKED = { missing: true, url: 'https://code.claude.com/docs/en/setup' };
const FINE = { missing: false, url: '' };

describe('the card on a Mac with no Claude Code on it', () => {
  const html = draw(BLOCKED);

  it('has no way into the inbox drawn on it at all', () => {
    // NOT DISABLED AND NOT GREYED.
    expect(html).not.toContain(COPY.finishGo);
    expect(html).not.toContain('fr-finish-go" onclick');
    expect(html).not.toContain('disabled=""');
  });

  it('does not congratulate anybody', () => {
    expect(html).not.toContain(COPY.finishHead);
    expect(html).not.toContain(COPY.finishLine);
    // And nothing falls out of the sky over it. Since 2026-08-24 nothing falls
    // over the ordinary card either: the burst is on the LANDING, in her own
    // project. What this still pins is that a blocked Mac never sees it.
    expect(html).not.toContain('fr-burst');
    expect(html).not.toContain('fr-bit');
  });

  it('says what is wrong in the headline and what was looked for under it', () => {
    expect(html).toContain(COPY.gateHead);
    expect(html).toContain(COPY.missing);
    expect(html.indexOf(COPY.gateHead)).toBeLessThan(html.indexOf(COPY.missing));
  });

  it('gives the two real moves and nothing else to press', () => {
    expect(html).toContain(COPY.missingLink);
    expect(html).toContain('https://code.claude.com/docs/en/setup');
    expect(html).toContain(COPY.gateCheck);
    expect(html).toContain(COPY.gateDo);
  });

  it('does not ask to import her agents while the inbox is shut', () => {
    // The offer is part of the ending. This card is not the
    // ending, and there is nothing to import agents into yet.
    const withAgents = draw(BLOCKED, { });
    expect(withAgents).not.toContain(COPY.agentsOffer);
    expect(withAgents).not.toContain(COPY.agentsRead);
  });

  it('is the ONLY screen in the walk it appears on, exactly as before', () => {
    const steps = ['welcome', 'folder', 'name', 'make', 'task', 'working', 'open', 'answer', 'clear', 'command'];
    for (const step of steps) {
      const other = renderToStaticMarkup(createElement(Onboarding, {
        run: { ...RUN_START, step, folder: `${HOME}/code/cascade`, product: 'cascade', name: 'Cascade' },
        claude: BLOCKED, home: HOME,
        onEvent: () => {}, onStep: () => {}, onSkipToApp: () => null, onDone: () => {},
      }));
      // What may not appear is the sentence and the gate.
      expect(other, step).not.toContain(COPY.missing);
      expect(other, step).not.toContain(COPY.gateHead);
      expect(other, step).not.toContain(COPY.gateCheck);
    }
  });

  it('leaves the unblocked card alone: it is the agents question and it opens', () => {
    // THE ENDING MOVED ON 2026-08-24 AND THE GATE DID NOT.The celebration is on
    // the landing now, so what a fine Mac gets here is the question and the way
    // in, and neither one of them may appear on a blocked Mac.
    //
    // WITH NOTHING READ OFF THIS MAC YET, THE FINE CARD DRAWS NOTHING, which is
    // the third answer `finishCard` has and the reason it has one: an empty
    // panel over her inbox for a frame is a flicker on the way in. What matters
    // here is that the gate is not what fills it.
    const fine = draw(FINE);
    expect(fine).not.toMatch(/Claude Code/);
    expect(fine).not.toContain(COPY.gateHead);
    expect(fine).not.toContain(COPY.gateCheck);
    // And it is no longer a success page: her ready line is not on it.
    expect(fine).not.toContain(COPY.finishHead);
    expect(finishCard(FINE, READ).head).toBe(COPY.bringHead);
    expect(finishCard(FINE, READ).go).toBe(true);
  });

  it('says nothing about a check nobody has run yet', () => {
    expect(html).not.toContain(COPY.gateStill);
  });
});

/* ========================================================================== */
/* 3. THERE IS NO WAY PAST IT                                                 */
/* ========================================================================== */

describe('no way round the requirement', () => {
  const walk = strip(read('renderer/src/components/Onboarding.tsx'));
  const app = strip(read('renderer/src/App.tsx'));

  it('registers no keystroke of its own on the last card at all', () => {
    // THE ANY-KEY LISTENER IS GONE WITH THE CARD IT BELONGED TO. It ended the
    // walk on any key when the last card had nothing on it; every Mac gets
    // <ImportAgents> now, which owns the keyboard and answers ⌘↵ with its own
    // door or with the way on. A blocked card still answers to no key, and now
    // it is the only shape this component draws.
    const fin = walk.slice(walk.indexOf('function Finished('), walk.indexOf('export function Landed('));
    expect(fin).not.toContain("addEventListener('keydown'");
    expect(fin).toContain('if (!card.blocked) {');
  });

  it('refuses the press where the walk is actually written off, too', () => {
    // Belt and braces, and it is the one that catches a press arriving from a
    // route the card does not know about. The window is sized to the function,
    // so it moves when the function really grows. It grew by one option on
    // 2026-08-25, `celebrate`, which is how the quiet way out lands somebody
    // in their project without throwing them a party for leaving, and by a
    // second on 2026-08-27, `filed`, which is how the walk's last card says it
    // has already put the agents in their inboxes itself. What is being
    // asserted did not change.
    const fin = app.slice(app.indexOf('const finishRun'), app.indexOf('const finishRun') + 900);
    expect(fin).toMatch(/if \(!mayOpenInbox\(claudeRef\.current\)\) return;/);
    // And the refusal comes BEFORE anything is written down.
    expect(fin.indexOf('mayOpenInbox')).toBeLessThan(fin.indexOf('finishFirstRun'));
  });

  it('never writes the walk off as done on a blocked card', () => {
    const fin = app.slice(app.indexOf('const finishRun'), app.indexOf('const finishRun') + 900);
    expect(fin).toMatch(/finishFirstRun\(localStorage\)/);
    expect(fin).toMatch(/setRun\(null\)/);
    expect(fin.indexOf('mayOpenInbox')).toBeLessThan(fin.indexOf('setRun(null)'));
  });
});

/* ========================================================================== */
/* AND THE WAY THROUGH IT IS A REAL SEARCH                                    */
/* ========================================================================== */

describe('check again really looks again', () => {
  it('throws the remembered shell answer away before it searches', () => {
    // The path checks were never cached; the shell answer is held for thirty
    // seconds. Somebody who installs Claude Code and presses this inside those
    // thirty seconds must be answered by a search, not by a memory. This is the
    // same promise the settings screen makes and the reason `forgetClaudeBin`
    // exists at all.
    const settings = strip(read('main/settings.mjs'));
    const fn = settings.slice(settings.indexOf('export function recheckClaude'));
    expect(fn).toMatch(/forgetClaudeBin\(\)/);
    expect(fn.indexOf('forgetClaudeBin')).toBeLessThan(fn.indexOf('claudeState(config)'));
  });

  it('answers with the same shape the card reads', () => {
    forgetClaudeBin();
    const state = recheckClaude({ claudeBinConfigured: null });
    expect(state).toHaveProperty('claudeFound');
    expect(state).toHaveProperty('claudeCertain');
    expect(state).toHaveProperty('claudeInstallUrl');
    // Whatever this machine is, the answer is the same shape `claudeState`
    // gives the settings screen, so the two cannot drift apart.
    expect(Object.keys(state).sort()).toEqual(Object.keys(claudeState({ claudeBinConfigured: null })).sort());
  });

  it('tells the rest of the app where Claude Code turned out to be', () => {
    // A search that has just found it updates the path everything else spawns
    // from, rather than leaving the app pointing at where it used to not be.
    const config = { claudeBinConfigured: null, claudeBin: '/nowhere/claude' };
    const state = recheckClaude(config);
    if (state.claudeFound) expect(config.claudeBin).toBe(state.claudeBin);
  });

  it('is reachable from the page, and answers safely when it is not', () => {
    const api = strip(read('renderer/src/api.ts'));
    const fn = api.slice(api.indexOf('async recheckClaude'), api.indexOf('async recheckClaude') + 1200);
    // A page attached to an older main process gets `certain: false`, which
    // OPENS the gate rather than shutting it.
    expect(fn).toMatch(/if \(!zero\?\.claudeRecheck\) return \{ found: false, certain: false/);
    expect(read('preload.cjs')).toMatch(/claudeRecheck: \(\) => ipcRenderer\.invoke\('zero:claude-recheck'\)/);
    expect(read('main/ipc.mjs')).toMatch(/ipcMain\.handle\('zero:claude-recheck'/);
  });

  it('and the card asks it, then says something different when it is still nothing', () => {
    expect(walkSource()).toMatch(/setTried\(await onRecheck\(\)\)/);
    expect(walkSource()).toMatch(/\{tried && !checking && <p className="fr-gate-still">/);
  });
});

function walkSource() {
  return strip(read('renderer/src/components/Onboarding.tsx'));
}
