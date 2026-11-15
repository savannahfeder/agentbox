// THE WAY OUT SITS ON THE TITLE'S LINE, IN THE WINDOW'S CORNER, AND IT DOES
// NOT PUSH THE HEADER DOWN.
//
//   "It should be in line with the header. Think Superhuman!
//
//    One pretty significant problem I noticed is that in your screenshots the
//    header is pushed down. If I'm looking at the app right now, the header is
//    further up. I think what you're doing right now is that the escape is
//    pushing the spacing for the header down. It should still be in line with
//    it, just in the left corner."
//
// Three things to keep true, and the first one has already been wrong once:
//
// 1. `.focus-head` pays 16px at the top, the same as it paid before this
// control ever came here. For one day it paid 40, and the extra 24 was a row
// held open above the title for the way out to sit on. That put the title at
// y=152 against y=128 in the app she had open, and she caught it the next
// morning. NOTHING ABOUT THE WAY OUT MAY MOVE A WORD SHE READS. 2. It is pinned
// to the WINDOW, on the window's own 22px gutter, and it slides left to 5 only
// on the windows where her heading would otherwise be touched. The 5 was
// arithmetic off the worst case, where a file open on a 1440 window squeezes
// the column until her heading starts at x=32 and a 24px box only fits in front
// of it at 5. Her own window is 3440 and her heading starts at 79, so the mark
// was hugging the edge of a band that was more than twice as wide as it needed
// to be. 22 is where `.topbar` starts the search glass and the word Inbox, so
// the two line up. It is still one control: the arrow and the key that does the
// same thing, not two facts to learn. That is's rule and Settings shares the
// rule with it.
//
// The vertical alignment itself is not testable here, because vitest has no
// layout. It is measured in the running app instead:
// The harness writes `offLine` into `measured.json`,
// the control's own middle minus the middle of the title's FIRST line, and it
// is 0 at 1710, 1440, 1180 and 980, in dark and light, on the Lake and on no
// ground at all, with a one-line title and a two-line one.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');

// One declaration block, by selector, with the comments above it left out.
// The indentation is optional so a rule inside a media query is found too.
const rule = (selector) => {
  const at = css.search(new RegExp(`\\n\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`));
  if (at < 0) return null;
  return css.slice(at, css.indexOf('}', at) + 1);
};

describe('the way out of a task', () => {
  it('does not buy itself a row out of the header', () => {
    const head = rule('.focus-head');
    expect(head).toBeTruthy();
    expect(head).toMatch(/padding:\s*16px 0 20px/);
    // The exact number that was wrong, named so it cannot come back quietly.
    expect(head).not.toMatch(/padding:\s*40px/);
  });

  it('is the only thing that positions itself, so the header never moves for it', () => {
    // `.focus-head` is `position: relative` and the control is out of the flow.
    // If it ever went back into the header's flow it would take a row again.
    expect(rule('.back-esc')).toMatch(/position:\s*fixed/);
  });

  it('sits on the window\'s own gutter, where the search glass and Inbox start', () => {
    // `.topbar` pays `42px 22px 18px`, so 22 is the app's left edge and this
    // mark's drawing lands at 26 against the glass's 25.5, measured.
    expect(rule('.topbar')).toMatch(/padding:\s*42px 22px 18px 22px/);
    expect(rule('.back-esc')).toMatch(/left:\s*22px/);
  });

  it('slides to 5 rather than onto her first letter, and never past either end', () => {
    // 5 is the floor, 22 is the ceiling, and the middle term is her heading's
    // own left edge less the 24px box and the 3px of air she accepted:
    // `.focus` centres a --read-w column in the pane and pays 32, so the last
    // safe left is `50% - --read-w/2 + 5px`. Both rules say the same thing.
    const slide = /left:\s*clamp\(5px,\s*calc\(50% - var\(--read-w\) \/ 2 \+ 5px\),\s*22px\)/;
    expect(rule('.app.doc-open .focus-pane > .back-esc')).toMatch(slide);
    expect(rule('.app.panel-up .focus-pane > .back-esc')).toMatch(slide);
  });

  it('is the little icon, in a box small enough for the gutter', () => {
    // 32px of room, a 24px box at 5, 3px of air. If any of these three numbers
    // moves the control is back on her first letter, which is the bug.
    const box = rule('.focus-pane > .back-esc');
    expect(box).toBeTruthy();
    expect(box).toMatch(/width:\s*24px/);
    expect(box).toMatch(/height:\s*24px/);
    expect(box).toMatch(/padding:\s*0/);
    // The reading column's own left padding is the 32 the air is measured from.
    expect(rule('.focus')).toMatch(/padding:\s*12px 32px 40px/);
  });

  it('is not switchable, because she answered it', () => {
    // Two rounds of placements lived in this file behind attributes, plus five
    // drawings. She picked hard left on 2026-08-22 and the rest were deleted
    // the same session, into `decisions.md`. A set may not be offered again.
    expect(css).not.toMatch(/html\[data-wayout/);
    expect(css).not.toMatch(/html\[data-glyph/);
  });

  it('only leaves the window for the pane where the two are the same edge', () => {
    // Pinning to the pane outright is the x=168 she rejected: with the panel up
    // at 1440 the pane starts 152px in. The two rules that do use the pane are
    // allowed to because in both of them the pane's left edge IS the window's.
    // A file open hides the panel (`panelShown` in App.tsx), and below 1288 the
    // panel's own padding clamps to 0. Nothing else may pin to the pane.
    expect(rule('.back-esc')).not.toMatch(/position:\s*absolute/);
    const pinned = [...css.matchAll(/^\s*([^\n{}]*\.back-esc[^\n{}]*)\{[^}]*position:\s*absolute/gm)]
      .map((m) => m[1].trim());
    expect(pinned.sort()).toEqual([
      '.app.doc-open .focus-pane > .back-esc',
      '.app.panel-up .focus-pane > .back-esc',
      '.back-esc.in-head',
    ]);
  });

  it('never jumps to another part of the window', () => {
    // It used to go up beside the traffic lights below 1280 with the panel up,
    // because a 51px control with a word on it ran out of gutter. The mark
    // slides along the title's own line now and stays on it at every width the
    // app can be dragged to, swept 980..3440 in 20px steps with the file open
    // and shut.
    expect(css).not.toMatch(/@media \(max-width: 1279px\)/);
    expect(css).not.toMatch(/\.back-esc\s*\{[^}]*top:\s*6px/);
    expect(css).not.toMatch(/\.back-esc\s*\{[^}]*left:\s*92px/);
  });

  it('is still one control: the arrow and the key it names', () => {
    const at = focus.indexOf('className="back-esc"');
    expect(at).toBeGreaterThan(-1);
    const button = focus.slice(at, focus.indexOf('</button>', at));
    expect(button).toContain('<svg');
    expect(button).toContain('esc');
    expect(focus.slice(at - 200, at + 200)).toMatch(/onClick=\{onClose\}/);
  });

  it('still shares Settings\' own rule, so there is one way out and not two', () => {
    expect(css).toMatch(/\.back-esc,\s*\.set-nav-back\s*\{/);
  });
});
