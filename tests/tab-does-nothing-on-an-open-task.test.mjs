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
describe('Tab on an opened task', () => {
 it('returns to browser focus before sidebar navigation', () => {
  expect(app).toContain("if (e.key === 'Tab') return;");
  expect(app).toContain('if (slot && !inInput && !modal && !inFullScreen)');
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
