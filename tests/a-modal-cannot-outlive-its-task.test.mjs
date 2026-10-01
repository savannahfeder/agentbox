// A MODAL THAT BELONGS TO AN OPEN TASK DIES WITH THE TASK.
//
// What was preventing it: `modal` had been left set to 'reply' by a task she
// had already left. The reply dock is drawn inside the opened task, so once the
// task closes there is nothing on screen to say the modal is still up — and the
// guard at the top of the key handler, `if (modal || inInput) return;`, then
// swallows every single-letter shortcut in the app. Her recovery sentence is
// the same bug from the other side: opening the card by hand writes 'compose'
// over the stale value and closing it writes null.
//
// The harness is the end-to-end half of this. It presses the
// key in a real build in a real browser and asks the DOM whether the card came
// up, through her exact sequence. Before the fix it reported two of five
// presses dead — inside an open task, and in the list after leaving a task with
// a draft in its reply box — and after it, five of five. This file is the part
// that runs in the suite, and it guards the two things a future edit could undo
// without noticing: the rule itself, and the fact that it is applied to the
// STATE rather than to one of the four ways out of a task.

import { describe, it, expect } from 'vitest';
import { HINTS } from '../renderer/src/hint-plate';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BELONGS_TO_A_TASK,
  BELONGS_TO_THE_APP,
  EVERY_MODAL,
  modalAfterLeavingATask,
} from '../renderer/src/modal-scope';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');
const pages = src('threads', 'Pages.tsx');

describe('the rule', () => {
  it('drops a modal that belongs to a task', () => {
    expect(modalAfterLeavingATask('reply')).toBe(null);
  });

  it('leaves every modal that belongs to the app exactly where it was', () => {
    for (const m of BELONGS_TO_THE_APP) expect(modalAfterLeavingATask(m)).toBe(m);
  });

  it('is the identity on nothing', () => {
    expect(modalAfterLeavingATask(null)).toBe(null);
  });
});

describe('every modal has been sorted', () => {
  // A value in neither list is a modal nobody has decided about, and the way
  // that reaches her is as a keyboard that has gone quiet for no visible reason.
  it('puts every modal in exactly one of the two lists', () => {
    for (const m of EVERY_MODAL) {
      const inTask = BELONGS_TO_A_TASK.has(m);
      const inApp = BELONGS_TO_THE_APP.has(m);
      expect(inTask || inApp, `${m} is in neither list: say whether it is drawn inside an open task`).toBe(true);
      expect(inTask && inApp, `${m} is in both lists`).toBe(false);
    }
  });

  // The union of the two lists IS the type, so adding a modal to App.tsx
  // without adding it here fails rather than passing silently.
  it('knows about every modal the app can actually open', () => {
    const declared = app.match(/type Modal = ([^;]+);/);
    expect(declared, 'the Modal type moved; re-read this test').toBeTruthy();
    const names = [...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(names).toEqual([...EVERY_MODAL].sort());
  });
});

describe('the rule is applied to the state, not to the ways out', () => {
  // THIS IS THE PART THAT MATTERS. There are at least four routes out of an
  // open task — the back arrow, the "esc back" button, Escape, and the row
  // closing under her — and a fix written into the routes is a fix that the
  // fifth route reintroduces. renderer/src/keys.ts carries the same lesson from
  // the S key, where two branches opened the same picker and only one was found.
  it('clears it from one effect that watches whether a task is open', () => {
    expect(app).toMatch(/if \(!focused\) setModal\(modalAfterLeavingATask\);/);
  });

  it('runs that effect on the task, so every way out goes through it', () => {
    const at = app.indexOf('if (!focused) setModal(modalAfterLeavingATask);');
    expect(at).toBeGreaterThan(-1);
    // The dependency list immediately after it.
    const deps = app.slice(at, at + 200).match(/\}, \[([^\]]*)\]\)/);
    expect(deps, 'the effect has no dependency list').toBeTruthy();
    expect(deps[1].trim()).toBe('focused');
  });
});

describe('C means the same thing on both screens', () => {
  // It was in the list's switch and not in the focus-mode branch, so the key was
  // dead on the screen she spends most of her time on. The + in the top bar is
  // on that screen too and has always claimed the key in its tooltip.
  const bounds = () => {
    const start = app.indexOf('const onKey = (e: KeyboardEvent)');
    const end = app.indexOf("window.addEventListener('keydown', onKey)");
    if (start < 0 || end < start) throw new Error('the key handler moved; re-read this test');
    return app.slice(start, end);
  };

  it('opens the new-task card from inside an open task', () => {
    const handler = bounds();
    const focusBranch = handler.slice(handler.indexOf('if (focused) {'), handler.indexOf('switch (e.key) {'));
    expect(focusBranch, 'the focus-mode branch was not found where it was').toContain("e.key === 'j'");
    expect(focusBranch).toMatch(/e\.key === 'c' \|\| e\.key === 'C'/);
    expect(focusBranch).toContain("setModal('compose')");
  });

  it('still opens it from the list', () => {
    expect(bounds()).toMatch(/case 'c': case 'C':/);
  });

  it('is the key the new task button promises', () => {
    // The strip's own hint slot is gone (w-2f7fac6027): a cap printed INTO the
    // strip is the app changing under the pointer. C is promised by the sidebar
    // button now, on a plate beside it. This pins the promise, not the drawing.
    // It promises N since w-fb9051e597; C still works and is not advertised.
    // approved 2026-10-01 (w-e731ca9376): the New thread button left the
    // sidebar for the right end of the header (HeaderActions), and the promise
    // went with it.
    expect(HINTS['new-task'][0].key).toBe('N');
    expect(pages).toMatch(/data-hint="new-task"[^>]*onClick=\{onCompose\}/);
  });
});
