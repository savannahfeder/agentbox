// THE WAY OUT OF AN OPENED TASK IS THE KEY, AND NOTHING IS DRAWN IN THE CORNER.
//
// THIS REVERSES, WHICH SHE ALSO SAID YES TO, EARLIER THE SAME DAY. Her newer
// word wins and the older one is history, not law. What that round settled and
// what this one voided:
//
//   1. It NAMED THE KEY IN WORDS, and that half is over. She reversed it on
//      2026-08-21 22:30 asking for "just having a little icon with no esc
//      text", because the word was what made the control wide enough to land
//      on her heading. The key is still named, on the button's own tooltip and
//      to a screen reader, and Settings still says it out loud.
//   2. It is the SAME CONTROL AS SETTINGS', not a second look for one thing.
//      Shared in the stylesheet rather than copied, so they cannot drift.
//   3. It is OFF THE TITLE, not hanging six points off the first letter.
//
//   STILL LAW. Two things from that round outlived it and are held below.
//   `.focus-head` pays 16px at the top: for one day it paid 40, the extra 24
//   being a row held open above the title for this control, and she caught it
//   the next morning. NOTHING MAY MOVE A WORD SHE READS, control or no control.
//   And there is ONE way out in this app, not two looks for one thing, so the
//   Scheduled rule pane's control shares Settings' own rule rather than copying
//   it. That pane keeps its control: it sits in its own header's margin, where
//   there is no window corner and nothing to collide with.
//
// Why it went, measured on rather than judged: with a document open the word
// esc was drawn ON the first letter of her title at every window width below
// 1707, and at 1707 itself the control's box ended at x=72.8 where the title's
// began at x=68.8.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');
const repeat = fs.readFileSync(path.join(root, 'renderer/src/components/RepeatFocus.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

const rule = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at) + 1);
};

describe('the way out of an opened task', () => {
  it('is the mark alone, with no word to widen it', () => {
    // The word is why the control was 51px wide against a 32px gutter, so this
    // is the fix and not a tidy-up. It reverses, deliberately.
    const back = focus.slice(focus.indexOf('className="back-esc"'), focus.indexOf('</button>', focus.indexOf('className="back-esc"')));
    expect(back).toContain('<svg');
    expect(back).not.toContain('<span>esc</span>');
    expect(back).toContain('onClick={onClose}');
    // The key is still named where naming it costs no width.
    expect(back).toMatch(/aria-label="Back \(esc\)"/);
    expect(back).toMatch(/title="Back \(esc\)"/);
  });

  it('still names the key on the pages that have room for it', () => {
    // One control, one look, is the rule from and it still holds for the
    // shared stylesheet rule. What she took off is the word on the ONE
    // instance that lands on a heading. Settings and the Scheduled rule page
    // have a margin of their own and keep it.
    expect(repeat).toContain('<span>esc</span>');
  });

  it('still closes on the Escape key, which is the whole of the way out now', () => {
    expect(focus).toMatch(/e\.key === 'Escape'/);
  });

  it('still says so somewhere, so the key is never unsaid', () => {
    const at = focus.indexOf('className="back-esc"');
    expect(at).toBeGreaterThan(-1);
    expect(focus.slice(at, focus.indexOf('</button>', at))).toMatch(/aria-label="Back \(esc\)"/);
    // And the row under the message no longer says it twice.
    expect(focus).not.toMatch(/>esc back</);
  });

  it('never moved a word she reads, and still does not', () => {
    const head = rule('.focus-head');
    expect(head).toBeTruthy();
    expect(head).toMatch(/padding:\s*16px 0 20px/);
    // The exact number that was wrong, named so it cannot come back quietly.
    expect(head).not.toMatch(/padding:\s*40px/);
  });

  it('leaves the Scheduled rule pane its own, in its header margin', () => {
    const at = repeat.indexOf('className="back-esc in-head"');
    expect(at).toBeGreaterThan(-1);
    const button = repeat.slice(at, repeat.indexOf('</button>', at));
    expect(button).toContain('<svg');
    expect(button).toContain('<span>esc</span>');
    expect(rule('.back-esc.in-head')).toMatch(/position:\s*absolute/);
  });

  it('is the same control the Settings pane uses, shared and not copied', () => {
    const shared = css.match(/\.back-esc, \.set-nav-back \{[^}]*\}/s);
    expect(shared, 'the two ways out do not share a rule').toBeTruthy();
    for (const bit of ['font-size: 11.5px', 'height: 23px', 'gap: 5px']) {
      expect(shared[0]).toContain(bit);
    }
    expect(css).toMatch(/\.back-esc svg, \.set-nav-back svg \{/);
    expect(css).toMatch(/\.back-esc:hover, \.set-nav-back:hover \{/);
  });

  it('is out of the scroll, so it stays where she left it while she reads', () => {
    // Inside the header it scrolled away with the title, and 900px down a long
    // thread it was 493 points above the top of the window. Out of the scroll
    // it is there whenever the key it names is, which is the whole time. NO
    // CLOSING BRACKET IN THE NEEDLE, AND THAT IS THE POINT OF THIS LINE. What
    // this test protects is an ORDER — pane, then the chevron, then the scroll
    // — and it found the pane by the whole tag including its `>`. So the first
    // attribute anyone ever added to that element turned the guard off
    // silently: it did not fail saying the chevron had moved, it failed saying
    // the pane did not exist, and the two checks under it stopped meaning
    // anything. Matching the opening tag alone keeps the guard pointed at what
    // it is for. Found by, which added `data-title-gone` here.
    const pane = focus.indexOf('<div className="focus-pane"');
    const button = focus.indexOf('{!headerTarget && backButton}');
    const scroll = focus.indexOf('<div className="focus-scroll"');
    expect(pane).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(pane);
    expect(button).toBeLessThan(scroll);
    // Measured rather than inferred: `scrolled` in `measured.json` puts the
    // thread 900px down and reads the control's box back at the same y.
  });

  it('still closes on the Escape key, which its tooltip names', () => {
    expect(focus).toMatch(/e\.key === 'Escape'/);
  });
});
