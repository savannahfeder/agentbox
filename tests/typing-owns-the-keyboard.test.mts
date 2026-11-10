// WHAT SHE IS TYPING IN OWNS THE KEY, AND CLICKING NOTHING GIVES IT BACK —,
// 2026-08-30.
//
// MEASURED BEFORE ANYTHING WAS TOUCHED, on the real renderer through Chromium's
// own input pipeline (the harness, the run in
// shots//before.json):
//
//   caret in the note down the panel   Tab      Inbox became In progress
//   caret in the note down the panel   ⇧Tab     Inbox became Closed
//   caret in the search field          Tab      the caret was thrown to the body
//   caret in the reply box             Tab      already nothing
//   caret in the reply box             click    the caret left, her keys stayed dead
//
// TWO SEPARATE FAULTS, AND THIS FILE HOLDS BOTH.
//
//   TAB. The rotation branch stood ABOVE the guard that stands the handler down
//   for typing, so it was the one key in the app that a text field could not
//   keep. The reply box looked safe only by accident: an open task is full
//   screen and the line above the rotation caught it there. The note in the
//   panel is on the LIST, where rotating is still correct for every press that
//   is not typing, so no condition on the rotation itself could have fixed it
//   without being wrong somewhere else.
//
//   THE CLICK. The caret was never the problem; a click on an inert part of the
//   window already took it out of every field. What survived is the reply DOCK,
//   and `modal` left at 'reply' is exactly what the top of the key handler
//   returns on, so every single letter in the app stayed dead with the caret in
//   the body. It is the one box in Agentbox with no backdrop to click, because it
//   is drawn INTO the card rather than over it.
//
// THE THREE THINGS A LATER EDIT COULD QUIETLY TAKE, all measured green in
// shots//after.json and all asserted below:
//
//   Tab on the list still rotates the four views.
//   ⇧Tab in the reply box still cycles Claude Code's permission modes.
//   Tab in the new task card still steps the project it is for.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');
const focus = src('components', 'Focus.tsx');
const compose = src('components', 'Compose.tsx');

// 2026-09-14: native Tab focus replaces the former global swallow.
// 2026-10-01 (w-5a08121f99): and on the Inbox's own list Tab moves along the
// state tabs again, because she asked for it back. That is a narrower rule than
// the one dropped in September, and this file pins the narrow part: the press
// may not leave a field she is typing in.
describe('what Tab still means', () => {
  it('does not move the tabs while typing', () => {
    const gate = app.slice(app.indexOf("if (e.key === 'Tab') {"), app.indexOf("if (e.key === 'Tab') {") + 700);
    expect(gate).toContain('const onTheTabs = !inInput');
    expect(gate).toContain('if (!onTheTabs) return;');
    // A press that is not ours is still the browser's, untouched.
    expect(gate.indexOf('if (!onTheTabs) return;')).toBeLessThan(gate.indexOf('e.preventDefault()'));
    // ⌘1 to ⌘4 carried the same guard until they were removed (w-914b16eab6,
    // 2026-10-02); tab-moves-along-the-tabs-and-the-number-keys-are-gone pins that.
    expect(app).not.toContain('sidebarSlot');
  });
  it('cycles the permission modes in the reply box, ON the box', () => {
    // It is answered on the textarea, so the press has already done its work by
    // the time the window listener swallows it. That ordering is what lets one
    // line above stand every field down without taking this away.
    expect(focus).toContain("if (e.key === 'Tab' && e.shiftKey && canSetMode) {");
    expect(focus).toMatch(/if \(e\.key === 'Tab' && e\.shiftKey && canSetMode\) \{[\s\S]{0,200}e\.preventDefault\(\);/);
  });

  it('steps the project in the new task card, ON the card', () => {
    expect(compose).toMatch(/if \(e\.key === 'Tab'\) \{[\s\S]{0,200}stepProject\(/);
  });
});

describe('clicking nothing gets out of the reply box', () => {
  it('folds the box, because the box is what was keeping her keys', () => {
    const away = app.slice(app.indexOf("if (modal !== 'reply') return;"));
    expect(away.indexOf("if (modal !== 'reply') return;")).toBe(0);
    expect(away.slice(0, 600)).toContain('setModal(null);');
  });

  it('listens for a pointer going down, not for a click landing', () => {
    // A click fires after focus has already moved. Pointerdown is the moment
    // she reaches for the wall.
    const away = app.slice(app.indexOf("if (modal !== 'reply') return;"), app.indexOf("if (modal !== 'reply') return;") + 800);
    expect(away).toContain("window.addEventListener('pointerdown', away, true)");
    expect(away).toContain("window.removeEventListener('pointerdown', away, true)");
  });

  it('only fires on NOTHING, so a control she clicked still does its own job', () => {
    const away = app.slice(app.indexOf("if (modal !== 'reply') return;"), app.indexOf("if (modal !== 'reply') return;") + 800);
    expect(away).toContain('SOMETHING_WITH_A_JOB');
  });

  it('counts the dock itself as something, or clicking her own box folds it', () => {
    const list = app.match(/const SOMETHING_WITH_A_JOB = '([^']+)'/)?.[1] ?? '';
    expect(list).toContain('.focus-dock');
    for (const part of ['button', 'a', 'input', 'textarea', '[role="button"]', '.row']) {
      expect(list.split(', ')).toContain(part);
    }
  });

  it('takes the keyboard off whatever held it, in the same breath', () => {
    const away = app.slice(app.indexOf("if (modal !== 'reply') return;"), app.indexOf("if (modal !== 'reply') return;") + 800);
    expect(away).toMatch(/document\.activeElement as HTMLElement \| null\)\?\.blur\?\.\(\)/);
  });

  it('is wired to the modal, so it is not listening while there is no box', () => {
    const away = app.slice(app.indexOf("if (modal !== 'reply') return;"), app.indexOf("if (modal !== 'reply') return;") + 900);
    expect(away).toMatch(/\}, \[modal\]\);/);
  });
});

describe('the measurement that decided all of this', () => {
  it('is kept, and says what it found', () => {
    const before = JSON.parse(fs.readFileSync(path.join(here, '..', 'tests', 'measurements', 'typing-before.json'), 'utf8'));
    const after = JSON.parse(fs.readFileSync(path.join(here, '..', 'tests', 'measurements', 'typing-after.json'), 'utf8'));
    const rows = Array.isArray(before) ? before : before.rows;
    const find = (list, where, did) => (Array.isArray(list) ? list : list.rows).find((r) => r.where === where && r.did === did);

    // The bug she reported, in the before run.
    expect(find(rows, 'the note in the right-hand panel', 'Tab').outcome).toContain('THE VIEW CHANGED');
    expect(find(rows, 'the note in the right-hand panel', 'shift-Tab').outcome).toContain('THE VIEW CHANGED');
    expect(find(rows, 'the reply box on an open task', 'click in the reading pane').outcome).toContain('STILL dead');

    // And the same nine presses after.
    for (const where of ['the note in the right-hand panel', 'the reply box on an open task', 'the search field in the tab row']) {
      for (const did of ['Tab', 'shift-Tab']) {
        expect(find(after, where, did).outcome).toBe('nothing, the field kept it');
      }
      expect(find(after, where, 'click on the list behind it').outcome).toContain('work again');
    }
    expect(after.kept.every((k) => k.ok)).toBe(true);
  });
});
