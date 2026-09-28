// THE STATE PAGE IS GONE, AND THIS IS THE FILE THAT KEEPS IT GONE.
//
// WHAT THE FEATURE WAS. Every product carried a `STATE.md` in its docs dir. The
// worker brief held a `<!-- state-page -->` section of rules for keeping it, the
// supervisor injected the file's first 8000 characters into every brief, and a
// workspace switch decided whether any of that happened.
//
// WHY IT WENT, measured on her own store that afternoon. The switch had been off
// for some time, so `stateBlock` was the empty string and NO SESSION WAS HANDED A
// STATE.md AT ALL. Her Agentbox `STATE.md` was 731,396 characters and still
// growing: 726,366 at one reading and 731,396 twenty minutes later, written by
// agents who then never received it. The budget made that worse rather than
// better, because a page over 8000 characters arrived cut off and the sessions
// reading it could not tell. So the layer's whole value, "every agent sees the
// same state at the same time", was not happening and had not been for a while,
// while every session paid to maintain it.
//
// WHAT REPLACED IT: nothing, deliberately. A row carries its own history, and
// what belongs to no single row goes in the product's `decisions.md` or, for
// facts about the code, in `CLAUDE.md`.
//
// WHY A WHOLE-TREE TEST. The same shape as `the-feedback-feature-is-gone`, and
// for the same reason: a switch that merely defaults to off is a feature waiting
// to be switched on again, and a removal proved only on the branch that did it
// protects nothing once main moves. This fails if any PART comes back: the
// config key, the brief section, the injection, the settings row, or the
// instruction to keep such a page.
//
// IT KEYS ON THE FEATURE'S OWN NAMES. `state` on its own is ordinary English all
// over this codebase (React state, `_saveState`, the supervisor's state file),
// so nothing here matches on that word alone.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Its own names. None of these means anything else here.
 *
 * `STATE.md` ITSELF IS NOT ON THIS LIST, and that is deliberate. Comments all
 * over this tree cite it as the place a decision was written down at the time,
 * and those are provenance, not the feature. Banning the string would force a
 * session to rewrite history it cannot check, which is the opposite of what
 * this removal is for. What is banned instead is the machinery, plus any
 * mention in `briefs/`, which is the only place the string could still INSTRUCT
 * somebody. */
const NAMES = [
  'statePage',                 // the config key, the settings field and the switch
  'statePageOn',               // the supervisor's gate
  'state-page:start',          // the marker pair in the worker brief
  'state-page:end',
];

/** Everything that ships, plus the briefs, which ARE what a session is told. */
const TREES = ['renderer/src', 'main', 'shared', 'briefs'];
const LOOSE = ['preload.cjs'];

function sourceFiles() {
  const out = [...LOOSE.map((f) => path.join(root, f))];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|cjs|js|css|md)$/.test(e.name)) out.push(p);
    }
  };
  for (const t of TREES) walk(path.join(root, t));
  return out;
}

describe('the state page is not anywhere in the application', () => {
  it('has none of its names, in anything that ships or is briefed', () => {
    const files = sourceFiles();
    // If this ever reads zero files every assertion below passes for the wrong
    // reason, which is the failure mode a whole-tree test actually has.
    expect(files.length).toBeGreaterThan(50);
    const hits = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const name of NAMES) {
        if (text.includes(name)) hits.push(`${path.relative(root, file)}: ${name}`);
      }
    }
    expect(hits, `the state page came back in:\n${hits.join('\n')}`).toEqual([]);
  });

  it('never tells a session to keep a shared state page', () => {
    // Nothing in the briefs may so much as name the file: this is the one place
    // the string would be read as an instruction rather than as a citation.
    for (const f of fs.readdirSync(path.join(root, 'briefs'))) {
      const text = fs.readFileSync(path.join(root, 'briefs', f), 'utf8');
      expect(text, `briefs/${f} still names it`).not.toContain('STATE.md');
    }
    const worker = fs.readFileSync(path.join(root, 'briefs', 'worker.md'), 'utf8');
    expect(worker).not.toMatch(/shared state/i);
    expect(worker).not.toMatch(/state doc/i);
    // The budget notice was the tell that the page had outgrown its job. It
    // goes with the page rather than surviving as a rule about nothing.
    expect(worker).not.toContain('8000');
  });

  // THE STANDING INSTRUCTIONS USED TO BE CHECKED HERE AND CANNOT BE ANY MORE.
  // `briefs/founder.md` is whatever the operator types into the Standing
  // instructions box. It was tracked, so a test could read it; it is untracked
  // as of 2026-09-23 because it is one person's notes and this repository is
  // going public, and a fresh clone does not have the file at all.
  //
  // Nothing is lost that this suite should have been holding. The loop above
  // already reads every brief that IS present and fails if any of them names
  // the page, which is the rule. What went was an assertion about the contents
  // of somebody's own file, which was never the suite's business.
});
