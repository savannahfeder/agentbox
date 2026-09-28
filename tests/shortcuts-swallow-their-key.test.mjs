// A single-key shortcut that opens a text field must swallow its own keystroke.
//
// S opened the schedule picker without calling preventDefault, so the "s" that
// opened it was typed into the input the picker had just focused. She typed her
// time on top of that stray character, the grammar could not read "stomorrow",
// and the Enter handler quietly applied the first preset instead: "In 30
// minutes". Her row came back half an hour later carrying a time she never
// chose (personal/, 2026-08-10, 5:32pm). Nine of that row's thirteen ledger
// lines are re-snoozes, two written within nine seconds of it reappearing, and
// she reported it as snoozing being broken.
//
// The first version of this test checked each `case` branch for a
// preventDefault, and PASSED while the bug was still live, because there are
// two branches that open the picker (the focus-mode one at `e.key === 's'` and
// the list one at `case 's'`) and it only understood the second syntax. That is
// the whole argument for the guard it now checks: the rule is applied once, to
// the key, before any branch runs, so a new shortcut cannot reintroduce this by
// being written in a shape nobody thought to grep for.
//
// Asserted against the SOURCE because the app has no DOM test environment, and
// adding one to catch a missing preventDefault is a dependency this repo should
// not take. The invariant is structural, so a structural check is honest.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPENS_A_TEXT_FIELD, opensATextField } from '../renderer/src/keys';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');

// The global handler, from where modals and inputs have already returned to the
// end of the effect. Everything below the guard is a shortcut branch.
const GUARD = 'if (opensATextField(e.key)) e.preventDefault();';

// The global key handler's own span. Bounding on the file instead caught a
// setModal('reply') in an unrelated effect, which is how a source-level test
// starts lying about the thing it is guarding.
function handlerBounds() {
  const start = app.indexOf('const onKey = (e: KeyboardEvent)');
  const end = app.indexOf("window.addEventListener('keydown', onKey)");
  if (start < 0 || end < start) throw new Error('the key handler moved; re-read this test');
  return { start, end };
}

describe('single-key shortcuts', () => {
  it('knows which keys open a text field', () => {
    expect(opensATextField('s')).toBe(true);
    expect(opensATextField('S')).toBe(true);
    expect(opensATextField('r')).toBe(true);
    expect(opensATextField('c')).toBe(true);
    expect(opensATextField('g')).toBe(false);
  });

  it('the guard exists, and runs before any branch that opens one', () => {
    const guardAt = app.indexOf(GUARD);
    expect(guardAt).toBeGreaterThan(-1);

    // Both shapes of shortcut branch live below it.
    expect(app.indexOf('if (focused) {')).toBeGreaterThan(guardAt);
    expect(app.indexOf('switch (e.key) {')).toBeGreaterThan(guardAt);
  });

  // The regression: every call site that puts a focused text field on screen
  // must sit downstream of the guard, in either branch, in any syntax.
  it('every opener in the key handler is downstream of the guard', () => {
    const guardAt = app.indexOf(GUARD);
    const { start, end } = handlerBounds();
    expect(guardAt).toBeGreaterThan(start);
    expect(guardAt).toBeLessThan(end);

    const openers = [...app.matchAll(/openSnooze\(|setModal\('reply'\)|setModal\('compose'\)|openSearch\(\)/g)]
      .map((m) => m.index)
      .filter((at) => at > start && at < end);

    expect(openers.length).toBeGreaterThan(2); // both s branches, plus r, c and /
    expect(openers.filter((at) => at < guardAt)).toEqual([]);
  });

  // Both branches that open the picker are still there. If one is deleted the
  // count changes and this test asks the author to re-read the rule above.
  it('the picker is still opened from two different branches', () => {
    const { start, end } = handlerBounds();
    const inHandler = app.slice(start, end);
    expect([...inHandler.matchAll(/openSnooze\(/g)].length).toBe(3); // focus mode, batch, single
  });

  // `/` joined the set when task search was built. It is the same rule and the
  // same cost: the field it opens is the tab row, and without the swallow
  // every search she starts begins with a stray slash in it and returns
  // nothing.
  it('the keys the guard covers are the ones the branches actually use', () => {
    // N opens the same new task box as C (w-fb9051e597).
    expect([...OPENS_A_TEXT_FIELD].sort()).toEqual(['/', 'c', 'n', 'r', 's']);
  });
});
