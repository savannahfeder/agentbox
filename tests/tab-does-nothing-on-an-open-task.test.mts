// TAB DOES NOTHING WHILE SHE IS READING A TASK, AND THE TOP STRIP SAYS NOTHING
// EITHER.
//
// Both halves are the same fault seen twice: on this screen the top strip is
// standing between the reader and the thing they opened. Tab threw the task
// away and rotated the view behind it, and the hint drew a keycap over a
// control the pointer was only passing.
//
// THE TWO THINGS A LATER EDIT COULD QUIETLY UNDO, which is why they are here:
//
//   THE SWALLOW HAS TO COME FIRST AND IT HAS TO PREVENT THE DEFAULT. A `return`
//   on its own hands the press to the browser, which walks DOM focus around the
//   reading pane and paints a ring on whatever it lands on. Doing nothing is
//   built, not left alone.
//
//   THE STRIP IS QUIET ON THIS SCREEN ONLY. Her switch in Settings and in ⌘K
//   still owns every other screen, and the row hints are untouched: this is one
//   screen going quiet, not the feature coming out.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const app = src('App.tsx');

// 2026-09-14: Tab now moves browser focus, but never changes the page.
//
// 2026-10-01 (w-5a08121f99): and on the Inbox's list it moves along the state
// tabs again, which she asked for by name. NOTHING ABOVE CHANGES. An opened
// task is exactly the screen this file is about, and it is the first thing the
// rotation's gate tests, so the press still cannot throw the task away. The
// assertion moved from the shape of the old line to the fact underneath it.
describe('Tab on an opened task', () => {
 it('changes nothing, because the rotation refuses an opened task', () => {
  const gate = app.slice(app.indexOf("if (e.key === 'Tab') {"), app.indexOf("if (e.key === 'Tab') {") + 700);
  for (const part of ['!focused', '!focusedRepeat', '!inFullScreen']) expect(gate).toContain(part);
  expect(gate).toContain('if (!onTheTabs) return;');
  // ⌘1 to ⌘4 went on 2026-10-02 (w-914b16eab6), so Tab is the only key here.
  expect(app).not.toContain('sidebarSlot');
 });

 it('hands the press back to the browser there rather than swallowing it', () => {
  // The `return` is before the preventDefault, so on an opened task the press
  // is the browser's, which is the September behaviour this screen kept.
  const gate = app.slice(app.indexOf("if (e.key === 'Tab') {"), app.indexOf("if (e.key === 'Tab') {") + 700);
  expect(gate.indexOf('if (!onTheTabs) return;')).toBeLessThan(gate.indexOf('e.preventDefault()'));
 });
});

describe('the top strip while a task is open', () => {
  it('is gated on her switch and on a modal, not on an opened task', () => {
    // THIS GATE MOVED (w-2f7fac6027). It used to be `!inFullScreen`, because
    // the strip printed a cap for Tab and Tab is dead on an opened task. The
    // strip's hint is gone, and two of the seven components that carry one now
    // LIVE on the opened task: the terminal button and the back button. So the
    // screen is no longer the thing that silences a hint; a modal is, because a
    // modal takes the keyboard whole and every key underneath it is swallowed.
    expect(app).toContain('const hintsOn = keyHints && !modal;');
  });

  it('drops a hint that was already drawn when a modal opens', () => {
    // She opens modals with the keyboard, so the pointer never leaves the
    // control and nothing tells the plate to go.
    expect(app).toMatch(/useEffect\(\(\) => \{ if \(!hintsOn\) \{ setPointedHint\(null\); hints\.current\?\.stop\(\); \} \}, \[hintsOn\]\);/);
  });

  it('gates the one listener, so no component is left printing a key', () => {
    // One gate for the whole window, because there is one listener now rather
    // than a handler per control.
    expect(app).toContain('if (!hintsOn) return undefined;');
    expect(app).not.toContain('setPointedStrip');
  });

  it('takes nothing away from the rest of the app', () => {
    // One screen goes quiet. The switch still owns everything else, and the
    // row hints under the pointer are untouched.
    expect(app).toContain('onHover={keyHints ? setHoveredId : undefined}');
    expect(app).toMatch(/<Settings[\s\S]{0,400}keyHints=\{keyHints\}/);
  });
});
