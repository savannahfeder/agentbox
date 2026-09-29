// The onboarding coaching line, and the ring it draws round the thing it is
// talking about.
//
// The elbow it replaced was measured off the BOX round the buttons rather than
// off the buttons, and `.focus-actions` is a flex row as wide as the whole text
// column: the mark landed 365 pixels to the right of the last button and the
// sentence landed on the right rail on top of Active agents. Those two numbers
// are measured, from designs//measured.json in the product store, and the
// anchors below are the real rectangles out of that same file so the test fails
// the day the geometry drifts back.

import { describe, expect, it } from 'vitest';
import {
  ANCHOR, clearOf, LINE_H, padFor, radiusFor, ring, RING_PAD_MAX, RING_PAD_MIN,
  roomFor, runOf, TEXT_GAP, TEXT_MAX, TEXT_MIN,
} from '../renderer/src/onboarding.ts';

// Measured in the running app at 1440x900, dark, Lake. The answer screen's
// action row and the pane it lives in.
const ACTIONS = { x: 256, y: 512, w: 367, h: 34 };
const FOCUS_PANE = { left: 152, right: 1076 };
// The command bar, whose anchor sits at the other end of the screen. This is the
// second screen every shape was drawn on, because a shape that only works in one
// place gives itself away in the other.
const PALETTE = { x: 411, y: 153, w: 618, h: 370 };
const VIEW = { w: 1440, h: 900 };

describe('the ring', () => {
  it('sits round the thing, not beside it', () => {
    const g = ring(ACTIONS, FOCUS_PANE, VIEW);
    const pad = padFor(ACTIONS);
    expect(g.ring).toEqual({
      x: ACTIONS.x - pad,
      y: ACTIONS.y - pad,
      w: ACTIONS.w + pad * 2,
      h: ACTIONS.h + pad * 2,
      r: 12,
    });
  });

  it('keeps the same left edge as the thing, which is what makes it read as one', () => {
    expect(ring(ACTIONS, FOCUS_PANE, VIEW).text.x).toBe(ACTIONS.x);
    expect(ring(PALETTE, { left: 0, right: 1440 }, VIEW).text.x).toBe(PALETTE.x);
  });

  it('puts the sentence under the thing with air between them', () => {
    const g = ring(ACTIONS, FOCUS_PANE, VIEW);
    expect(g.below).toBe(true);
    expect(g.text.y).toBe(g.ring.y + g.ring.h + TEXT_GAP);
    expect(g.text.y).toBeGreaterThan(ACTIONS.y + ACTIONS.h);
  });

  it('never reaches the right rail, which is where the elbow used to land', () => {
    // The elbow put its sentence at x=1096 running to 1396, and the rail starts
    // at 1076. Both numbers are measured; this is the defect, held shut.
    const g = ring(ACTIONS, FOCUS_PANE, VIEW);
    expect(g.text.x + g.text.w).toBeLessThanOrEqual(FOCUS_PANE.right);
  });

  it('never runs under the palette, which is the same defect on the other screen', () => {
    // On the command bar 175 pixels of the built sentence sat beneath the
    // palette and covered two of its rows. Under it, there is nothing to be
    // under.
    const g = ring(PALETTE, { left: 0, right: 1440 }, VIEW);
    expect(g.text.y).toBeGreaterThanOrEqual(PALETTE.y + PALETTE.h);
  });

  it('flips above the thing rather than off the bottom of a short window', () => {
    const low = { x: 200, y: 600, w: 300, h: 34 };
    const g = ring(low, { left: 0, right: 900 }, { w: 900, h: 680 });
    expect(g.below).toBe(false);
    expect(g.text.y).toBeLessThan(low.y);
  });

  it('holds the sentence between its two widths whatever the room is', () => {
    const wide = ring({ x: 40, y: 100, w: 200, h: 30 }, { left: 0, right: 4000 }, { w: 4000, h: 900 });
    expect(wide.text.w).toBe(TEXT_MAX);
    const tight = ring({ x: 40, y: 100, w: 200, h: 30 }, { left: 0, right: 180 }, { w: 900, h: 900 });
    expect(tight.text.w).toBe(TEXT_MIN);
  });

  it('is bounded by the window even when the pane claims to be wider', () => {
    const g = ring({ x: 40, y: 100, w: 200, h: 30 }, { left: 0, right: 9000 }, { w: 500, h: 900 });
    expect(g.text.x + g.text.w).toBeLessThanOrEqual(500);
  });
});

describe('the sentence keeps off other people words', () => {
  // Under the thing is empty on three of the four coached steps. On In progress
  // it is not: the room under a row belongs to the next row. Shot 08-21 with the
  // full fixture store, "It is running. This one comes back in a few seconds."
  // was drawn straight across the title of the task below it.
  const ROW_BELOW = { top: 226, bottom: 266 };

  it('takes the line under whatever is in the way', () => {
    expect(clearOf(234, LINE_H, [ROW_BELOW], { h: 900 })).toBe(276);
  });

  it('leaves the line alone when the band is empty', () => {
    expect(clearOf(234, LINE_H, [{ top: 600, bottom: 640 }], { h: 900 })).toBe(234);
  });

  it('clears the lowest of several, not the first', () => {
    const y = clearOf(234, LINE_H, [ROW_BELOW, { top: 240, bottom: 300 }], { h: 900 });
    expect(y).toBe(310);
  });

  it('stays where it was rather than going off the bottom of the window', () => {
    // Half a sentence off the screen is worse than a sentence over a row, and
    // this is the only case where it does not move.
    expect(clearOf(820, LINE_H, [{ top: 810, bottom: 880 }], { h: 900 })).toBe(820);
  });
});

// ---------------------------------------------------------------------------
// AND IT IS DRAWN ROUND THE WORDS, NOT ROUND THE GUTTER.
//
// A row holds four things. The select box is absolutely positioned in the
// row's left gutter and shows nothing until the pointer is on it, so it is
// furniture; the run of the row is its two lines of text and its right end.
// Counting the select box put the sentence at x=30 while the row's own title
// and summary both start at x=54.
const ROW = { x: 22, y: 144.5, w: 1055, h: 74.7 };
const ROW_KIDS = [
  { x: 30, y: 168.5, w: 18, h: 18, position: 'absolute' },   // the select box
  { x: 54, y: 163.5, w: 897.1, h: 40.7, position: 'static' }, // title + summary
  { x: 973, y: 165.5, w: 82, h: 16, position: 'static' },     // product and time
];
const ROW_TEXT_X = 54;

describe('the run of a thing', () => {
  it('leaves out what is parked in the margin, which is what she caught', () => {
    expect(runOf(ROW, ROW_KIDS).x).toBe(ROW_TEXT_X);
  });

  it('put the sentence 24 pixels left of her own text when it did not', () => {
    // The defect itself, held shut. Counting the select box is the whole bug.
    const wrong = runOf(ROW, ROW_KIDS.map((k) => ({ ...k, position: 'static' })));
    expect(ROW_TEXT_X - wrong.x).toBe(24);
  });

  it('so the ring and the sentence both start on the row own words', () => {
    const g = ring(runOf(ROW, ROW_KIDS), { left: 22, right: 1077 }, VIEW);
    expect(g.text.x).toBe(ROW_TEXT_X);
    expect(g.ring.x).toBe(ROW_TEXT_X - padFor(runOf(ROW, ROW_KIDS)));
  });

  it('gives a wide row more air than a small icon, which is what she asked for', () => {
    // Both rectangles are measured off the built walk at 1440x900.
    const ICON = { x: 1343, y: 47, w: 18, h: 18 };
    const ROW_INK = { x: 55, y: 165, w: 997, h: 41 };
    expect(padFor(ICON)).toBe(RING_PAD_MIN);
    expect(padFor(ROW_INK)).toBe(RING_PAD_MAX);
    // The drawing rang the whole 75px row at a pad of 8 and the trim rings the
    // 41px run of its words at a pad of 5, so the two rectangles are 91 and 51
    // and the middle of them is 71. This is 69.
    expect(ring(ROW_INK, { left: 22, right: 1077 }, VIEW).ring.h).toBe(69);
  });

  it('never lets a small ring become a disc, which is the other half of it', () => {
    // A 30px ring at the old flat 12 had 6px of straight edge a side; at 8 it
    // has 14.
    const CMD = ring({ x: 1343, y: 47, w: 18, h: 18 }, { left: 0, right: 1440 }, VIEW).ring;
    expect(CMD.w).toBe(30);
    expect(CMD.r).toBe(8);
    expect(CMD.w - CMD.r * 2).toBe(14);
    // And nothing big moves: the corner she never complained about is the one
    // she keeps.
    expect(radiusFor({ w: 1025, h: 69 })).toBe(12);
    expect(radiusFor({ w: 387, h: 54 })).toBe(12);
  });

  it('stops halfway to the button next door, which growing the pad broke', () => {
    // Measured on the built walk at 1440x900, beat seven. The two buttons are
    // 10px apart, so a pad of 12 put 8px of glow inside "esc back", which is
    // the button the beat is telling her NOT to press.
    const CLOSE = { x: 256, y: 298, w: 127, h: 34 };
    const ESC = { x: 393, y: 298, w: 81, h: 34 };
    expect(roomFor(CLOSE, [ESC])).toBe(5);
    const g = ring(CLOSE, FOCUS_PANE, VIEW, roomFor(CLOSE, [ESC]));
    expect(g.ring.x + g.ring.w).toBeLessThanOrEqual(ESC.x);
  });

  it('is not slowed down by a neighbour that is nowhere near', () => {
    expect(roomFor(ACTIONS, [])).toBe(Infinity);
    // Something sitting on top of the thing is inside it, not beside it.
    expect(roomFor(ACTIONS, [{ x: 260, y: 514, w: 40, h: 20 }])).toBe(Infinity);
    // And a row of words clears the row under it by 33, so a row keeps its 14.
    const ROW_INK = { x: 55, y: 165, w: 997, h: 41 };
    const NEXT_INK = { x: 55, y: 239, w: 997, h: 41 };
    expect(roomFor(ROW_INK, [NEXT_INK])).toBe(16.5);
    expect(ring(ROW_INK, { left: 22, right: 1077 }, VIEW, roomFor(ROW_INK, [NEXT_INK])).ring.h)
      .toBe(69);
  });

  it('falls back to the box when everything inside it is furniture', () => {
    const all = ROW_KIDS.map((k) => ({ ...k, position: 'absolute' }));
    expect(runOf(ROW, all)).toEqual(ROW);
  });

  it('still ignores children with no size, which is what it did before', () => {
    const empty = [{ x: 0, y: 0, w: 0, h: 0, position: 'static' }, ...ROW_KIDS];
    expect(runOf(ROW, empty).x).toBe(ROW_TEXT_X);
  });
});

// ---------------------------------------------------------------------------
// AND NO ANCHOR IS A COMMA LIST, because a comma list is document order.
//
// `querySelector('a, b')` returns whichever of the two comes first in the
// DOCUMENT, not the first selector that matches. The In progress anchor was
// '.row .time.working, .list-pane .row' and read as "prefer the running row",
// but the row always came first in the document, so it never once chose the
// time. Read in the order written it rings the little "working · 6s" chip at
// the far right of the row: measured 08-21, 932px off her text. The array is
// walked in order by `firstOf` in the component, so a comma here is a lie.
describe('the anchors', () => {
  it('are lists walked in order, never comma selectors', () => {
    for (const [step, sels] of Object.entries(ANCHOR)) {
      expect(Array.isArray(sels), `${step} is an array`).toBe(true);
      for (const s of sels) expect(s, `${step}: ${s}`).not.toContain(',');
    }
  });

  it('point the In progress step at the row, which is the picture she picked', () => {
    expect(ANCHOR.working).toEqual(['.list-pane .row']);
  });
});
