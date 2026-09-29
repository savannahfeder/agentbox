// THE REPLY FOOTER HAS NO PERMISSIONS BUTTON, AND THIS IS THE THING THAT KEEPS
// IT THAT WAY.
//
// She has now said it twice, and the second time is the reason this file
// exists rather than another comment.
//
// The chip was not a thing nobody had decided; it was a thing that had been
// decided against and got built anyway. Two branches removed it independently
// that week, which is the same waste from the other end. Prose in a source
// comment did not stop either, so this is the guard that fails out loud
// instead.
//
// WHAT THE PICTURE ACTUALLY SHOWED, so the shape of the bug is recorded and
// not just the verdict: the footer is one flex row, `.clause-mode` was
// `flex: 0 0 auto` and `.mode-chip` was `white-space: nowrap`. On a reply card
// narrow enough that the sentence ahead of it wraps, the chip can neither
// shrink nor wrap, so it lies straight across the wrapped lines. Her shot has
// the word "Runs" printed underneath the word "Permissions". Any future
// version of this control has to answer that before it goes back on the
// footer, and it goes back only if she says so.
//
// The two ways into the modes are Claude Code's own and both still work: `/`
// opens the menu, Shift+Tab cycles. Those are covered by
// the-slash-picks-a-mode.test.mjs. What this file asserts is only that nothing
// is permanently parked on the footer again, and that the toast she asked for
// in exchange is still wired up.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Comments are where this chip is DISCUSSED on purpose, in Focus.tsx and in
// styles.css, so a grep over raw text would fail on the very notes that explain
// why it is gone. Everything below reads code with the comments taken out.
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// Every component that draws the footer she photographed. They all share
// `.compose-clauses`, which is the row the chip was laid across, so this list
// is the answer to "where could it come back?" rather than just "where was it".
// Feedback.tsx was a sixth entry here until. The whole feedback feature came
// out on 2026-08-30, so the file it named no longer exists.
const FOOTERS = [
  'renderer/src/components/Focus.tsx',
  'renderer/src/components/Compose.tsx',
  'renderer/src/components/Onboarding.tsx',
  'renderer/src/components/RepeatFocus.tsx',
];

// The class names the chip and its parts were built from. All nine were
// deleted; they are in decisions.md, 2026-08-26, verbatim, if one is ever
// wanted back.
const DEAD_CLASSES = [
  'clause-mode', 'mode-chip', 'mode-glyph', 'mode-kind', 'mode-scope', 'mode-clear',
];

// WHOLE CLASS NAMES ONLY, and this is not fussiness. `clause-mode` is a
// prefix of `clause-model`, which is the model picker that shares this footer
// and is hers and staying. A plain substring search reports the surviving
// control as the dead one, which is how this test failed the first time it
// was run. A class name ends where an identifier character stops.
const drawn = (text, cls) => new RegExp(`${cls}(?![\\w-])`).test(text);

describe('the permissions chip is off the reply footer', () => {
  it('is drawn by none of the composers that share the footer', () => {
    for (const file of FOOTERS) {
      const code = stripJs(read(file));
      for (const dead of DEAD_CLASSES) {
        expect(drawn(code, dead), `${file} draws .${dead}`).toBe(false);
      }
    }
  });

  it('has no styling left to bring back, so a stray class would be invisible anyway', () => {
    const css = stripCss(read('renderer/src/styles.css'));
    for (const dead of DEAD_CLASSES) {
      expect(drawn(css, `\\.${dead}`), `styles.css still rules .${dead}`).toBe(false);
    }
  });

  // THE BROAD ONE, and the reason it is separate from the list above. Those
  // are this chip's names. The fault she reported is ANY always-on control
  // parked in that row, and the next one will not be called `mode-chip`; it
  // will be called whatever its author calls it. So this counts buttons
  // instead of naming them.
  //
  // The footer after the wrapping sentence is exactly one button, Send. The
  // pickers ahead of it are components, not raw elements, so they do not count
  // here and are not meant to: they are inside the sentence and they wrap with
  // it, which is the whole difference from the chip that could not.
  it('leaves the footer as the sentence and one send button, nothing else', () => {
    const code = stripJs(read('renderer/src/components/Focus.tsx'));
    const footer = code.slice(code.indexOf('compose-clauses'));
    const buttons = [...footer.matchAll(/<button/g)];
    expect(buttons.length, 'a second control has appeared on the reply footer').toBe(1);
    expect(footer).toContain('className="dock-send"');
  });
});

describe('what she was given instead of the chip', () => {
  // Deleting the chip without this would be half of her sentence.
  it('still announces the mode change as a toast', () => {
    const code = stripJs(read('renderer/src/components/Focus.tsx'));
    expect(code).toContain('const announce =');
    expect(code).toContain('onNotice(`Permissions ·');
  });

  it('keeps the slash menu and Shift+Tab as the ways in', () => {
    const code = stripJs(read('renderer/src/components/Focus.tsx'));
    expect(code).toContain('slashQuery');
    expect(code.includes('Tab')).toBe(true);
  });
});
