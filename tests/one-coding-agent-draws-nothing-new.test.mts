// THE CASE THAT MUST NOT MATCH, AND IT IS EVERY MAC SHE HAS.
//
// The second engine is coming back through a picker, and the whole of the
// design constraint on it is negative: on a Mac without Codex, and on every Mac
// before she writes the moment into zero.config.json, the screen must be exactly
// the screen it is today. Not "nearly", and not "one quiet extra word".
//
// THIS IS THE FLOW LAW AND IT IS ALSO HOW THE 08-25 BUILD BEHAVED.
//
// FOUR SURFACES COULD HAVE BROKEN THAT and each is asked here separately,
// because they fail independently: the composer's clause, the Settings row, the
// byline's slot, and the stylesheet. The supervisor's half -- that a one-engine
// Mac is REPORTED as a one-engine Mac, including one with Codex installed and
// the gate shut -- is tests/the-engine-choice-reaches-her-screen.test.mjs.
//
// THE PICKER REFUSES ITSELF, which is the load-bearing part. The outer guards in
// Compose.tsx and Settings.tsx are asserted below as well, but the reason this
// cannot regress by accident is that `EnginePicker` returns null below two rows
// on its own: a guard someone drops in a refactor is a guard, and a component
// that will not draw is a fact.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnginePicker } from '../renderer/src/components/EnginePicker.tsx';
import { ENGINES } from '../shared/engines.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const compose = read('renderer/src/components/Compose.tsx');
const settings = read('renderer/src/components/Settings.tsx');
const css = read('renderer/src/styles.css');

const draw = (props) => renderToStaticMarkup(createElement(EnginePicker, {
  value: null, onChange() {}, ...props,
}));

describe('the picker will not draw itself where there is no choice', () => {
  it('draws nothing at all with one engine', () => {
    expect(draw({ choices: [ENGINES[0]] })).toBe('');
  });

  it('draws nothing at all with none', () => {
    expect(draw({ choices: [] })).toBe('');
  });

  // Even handed a value. A Mac that once had Codex and does not any more must
  // not grow a control back because a card remembered a word.
  it('draws nothing with one engine even when a value is set', () => {
    expect(draw({ choices: [ENGINES[0]], value: 'codex' })).toBe('');
  });

  // The boundary the other side, so "draws nothing" is a rule about the count
  // and not a component that never draws.
  it('draws the word once there really are two', () => {
    const html = draw({ choices: ENGINES });
    expect(html).not.toBe('');
    expect(html).toContain('Claude Code');
  });

  // And it names the one she picked, not the default, when she has picked.
  it('says the engine she chose', () => {
    expect(draw({ choices: ENGINES, value: 'codex' })).toContain('Codex');
  });
});

describe('the two clauses that could have appeared anyway', () => {
  // The composer's sentence. Both halves: the clause is behind a count, and
  // the count is the list main handed over rather than anything worked out here.
  it('keeps the composer\'s engine clause behind more than one engine', () => {
    expect(compose).toMatch(/engineRows\.length > 1/);
    expect(compose).toMatch(/engineChoices\s*\?\?\s*\[ENGINES\[0\]\]/);
  });

  // THE SETTINGS ROW IS GONE ENTIRELY SINCE 2026-09-23 (w-12081d32cc). It was a
  // plain div behind a guard, drawn only on a Mac with two coding agents, and
  // the new task card asks the same question where the task is written.
  //
  // So the guard this used to pin by distance has nothing left to guard, and
  // the strongest version of the same law is that the row does not exist on any
  // Mac, one engine or two. A control that cannot be drawn cannot be drawn
  // wrongly.
  it('asks neither question in Settings on any Mac', () => {
    expect(settings).not.toContain('<div className="set-row-label">Coding agent</div>');
    expect(settings).not.toContain('<div className="set-row-label">Model</div>');
    expect(settings).not.toMatch(/setWorkspace\('engine'/);
    expect(settings).not.toMatch(/setWorkspace\('model'/);
  });

  // And the count itself is still MAIN'S ANSWER rather than a guess from a
  // binary on disk, because the sentence about how many run at once still
  // names Claude Code only where there is a second engine.
  it('works the count out once, from what main handed over', () => {
    expect(settings).toContain('const engineRows = w?.engineChoices ?? [];');
    expect(settings).toContain('const twoEngines = engineRows.length > 1;');
    expect(settings.match(/const twoEngines = /g)).toHaveLength(1);
    expect(settings.match(/const engineRows = /g)).toHaveLength(1);
    // No second spelling left anywhere to be taught separately from the first.
    expect(settings).not.toContain('w.engineChoices && w.engineChoices.length > 1');
    expect(settings).not.toContain('(w.engineChoices?.length ?? 1) > 1');
  });
});

describe('nothing about an engine is marked anywhere in the ink', () => {
  it('has no per-engine class in the stylesheet', () => {
    expect(css).not.toMatch(/\.[a-z-]*codex\b/i);
    expect(css).not.toMatch(/\bclause-engine[a-z-]/i);
  });

  // And the clause borrows the drawers the footer already has rather than
  // growing a third popover, which is the other half of "it inherits or it does
  // not go in".
  it('borrows the menu the other two words already use', () => {
    const picker = read('renderer/src/components/EnginePicker.tsx');
    expect(picker).toContain('prio-menu');
    expect(picker).toContain('compose-word');
  });
});
