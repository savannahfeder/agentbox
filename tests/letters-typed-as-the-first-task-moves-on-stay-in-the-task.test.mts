// LETTERS TYPED AS THE FIRST TASK MOVES ON STAY IN THE TASK (F-162).
//
// What broke: twice, on a fresh desktop user, the first-task screen had moved
// on to "Which project is it for?" with the task cut to "Add an ini" and "Make
// count". The only ways that screen moves on are Next and Ctrl/⌘+Enter, and
// typing was by an automated tester, so the likeliest story is the send landing
// while letters were still arriving. The project screen has no field, so every
// letter after the switch was dropped and the task went out short.
//
// How it was measured: QA sessions 27 and 29 (mains 2fba0da6, 92e036c0), 1 of 2
// each time. The rule below keeps those letters: typed on the project screen
// within moments of arriving, they go on the end of the task it shows.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { TYPE_AHEAD_MS, typedAhead } from '../renderer/src/first-run-classic.ts';

describe('a letter typed just after the first task moved on', () => {
  it('goes on the end of the task', () => {
    expect(typedAhead({ key: 't' }, 40)).toBe('t');
    expect(typedAhead({ key: ' ' }, 40)).toBe(' ');
    expect(typedAhead({ key: 'T', shiftKey: true }, TYPE_AHEAD_MS)).toBe('T');
  });

  it('is not taken once the moment has passed', () => {
    expect(typedAhead({ key: 't' }, TYPE_AHEAD_MS + 1)).toBeNull();
  });

  it('leaves the project screen its own keys and shortcuts', () => {
    for (const key of ['Enter', 'ArrowDown', 'ArrowUp', 'Escape', 'Backspace']) expect(typedAhead({ key }, 10)).toBeNull();
    expect(typedAhead({ key: 'k', metaKey: true }, 10)).toBeNull();
    expect(typedAhead({ key: 'k', ctrlKey: true }, 10)).toBeNull();
  });

  it('is what the project screen does with such a key, before anything else', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/FirstRunClassic.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/screen === 'where'\) \{\s*const late = busy \? null : typedAhead\(e, Date\.now\(\) - arrivedAt\.current\);\s*if \(late\) \{ e\.preventDefault\(\); setText\(\(t\) => t \+ late\); return; \}/);
    expect(src).toContain('arrivedAt.current = Date.now(); setScreen(next);');
  });
});
