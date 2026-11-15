// AN OPEN REPEATING TASK OWNS THE KEYBOARD, and it advertises no key it does
// not handle.
//
// 2026-08-21. The key handler had a branch for an open TASK and none for an
// open RULE, so with a rule full screen every single-letter shortcut ran
// against the list behind the pane. Measured on the built app with
// Measured on the running app:
//
//   Escape closes the pane                        false
//   the pane says E ends this repeating task      true
//   after E, the rule is ended                    false
//   after E, the toast says                       "Running again"
//
// That last line is the whole reason this file exists. The pane printed "E ends
// this repeating task", the key never reached the rule, and it landed instead
// in the Scheduled view's own E — which un-defers whatever row is selected. So
// the advertised key did nothing it claimed and something it did not, to a
// different item, silently.
//
// Two things are pinned here, and they are the two halves of that failure: the
// branch exists and returns, and no copy on that screen names a key the branch
// does not handle.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');
const pane = src('components', 'RepeatFocus.tsx');

// The branch, from `if (focusedRepeat) {` to the `return` that ends it.
function repeatBranch(source) {
  const start = source.indexOf('if (focusedRepeat) {');
  if (start < 0) return null;
  const end = source.indexOf('if (focused) {', start);
  return end > start ? source.slice(start, end) : null;
}

describe('the keyboard branch', () => {
  const branch = repeatBranch(app);

  it('exists at all', () => {
    expect(branch, 'no `if (focusedRepeat)` branch: every key falls through to the list behind the pane').not.toBe(null);
  });

  it('sits ABOVE the open-task branch, so only one screen ever owns the keys', () => {
    expect(app.indexOf('if (focusedRepeat) {')).toBeLessThan(app.indexOf('if (focused) {'));
  });

  it('swallows everything rather than letting keys through to the list', () => {
    // The unconditional return at the end is what stops E, J, K and the rest
    // reaching the switch. A branch that handles Escape and falls through is
    // the bug with two keys fixed.
    expect(branch.trimEnd().endsWith('return;\n      }')).toBe(true);
  });

  it('closes on Escape and opens the box on R', () => {
    expect(branch).toMatch(/Escape[\s\S]*setFocusedRepeat\(null\)/);
    expect(branch).toMatch(/'r' \|\| e\.key === 'R'[\s\S]*setEditingRule\(true\)/);
  });

  // Ending a repeating task destroys it and every future run. E archives
  // everywhere else in this app, and a reflex that lands here would be the one
  // place it cannot be taken back.
  it('gives ending it no key at all', () => {
    expect(branch).not.toMatch(/onEnd|endRepeat/);
  });
});

describe('what the screen says about keys', () => {
  it('never advertises a key the branch does not handle', () => {
    const advertised = [...pane.matchAll(/\b([A-Z]) (?:ends|archives|deletes|stops)\b/g)].map((m) => m[1]);
    expect(advertised).toEqual([]);
  });

  it('offers the box under the same key a task offers its reply box', () => {
    expect(pane).toMatch(/<kbd>R<\/kbd>/);
  });
});
