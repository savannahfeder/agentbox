// HOW TALL THE REPLY BOX GETS.
//
// The bug: the box sat at three lines however much was written, so a long
// reply was written through a slot. The fix grows it. So the
// ceiling is 40% of the pane, and these tests pin it at the three pane heights
// actually measured in the running app, because that is the finding that chose
// a share over a number.
//
// The pane heights, measured 2026-08-17 (`designs/reply-stop/`): 568px on a
// 13 inch at 120% zoom, 718px on a typical window, 931px on a 16 inch.

import { describe, expect, it } from 'vitest';
import {
  DOCK_MIN_LINES, DOCK_SHARE_OF_PANE,
  dockCapLines, dockCeiling, dockHeight, dockScrolls,
} from '../renderer/src/dock-height.ts';

// EVERY NUMBER BELOW IS READ OFF THE RUNNING APP, not chosen to make the test
// pass: `node scripts/shot-dock-grows.mjs`, readings in
// `designs/reply-grows/measured-grows.json`. A line is 24px, the text area
// spends 18px on padding (12 over, 6 under), the resting floor is 92px, and the
// card's own furniture below the text is 52px. Guessing the last one was wrong
// by one line on all three screens, which is exactly the kind of error this
// file exists to catch.
const LH = 24;
const metrics = (over = {}) => ({
  paneHeight: 718,
  chromeHeight: 52,
  lineHeight: LH,
  padY: 18,
  floor: 92,
  scrollHeight: 92,
  ...over,
});

// What a reply of n lines needs, before any ceiling is applied.
const needs = (lines) => Math.round(lines * LH + 18);

describe('the box grows as she writes', () => {
  it('follows the text instead of sitting at the floor', () => {
    const short = dockHeight(metrics({ scrollHeight: needs(1) }));
    const mid = dockHeight(metrics({ scrollHeight: needs(6) }));
    expect(mid).toBeGreaterThan(short);
    expect(mid).toBe(needs(6));
  });

  // The bug itself, stated in the only unit that matters: nothing typed is
  // hidden until the ceiling is reached. Before this row, a six-line reply was
  // scrolling inside a three-line box.
  it('hides none of her words below the ceiling', () => {
    expect(dockScrolls(metrics({ scrollHeight: needs(6) }))).toBe(false);
    expect(dockScrolls(metrics({ scrollHeight: needs(9) }))).toBe(false);
  });

  it('never goes under the resting height, which she was promised is unchanged', () => {
    expect(dockHeight(metrics({ scrollHeight: 20 }))).toBe(92);
    expect(dockHeight(metrics({ scrollHeight: 0 }))).toBe(92);
  });
});

describe('it stops at 40% of the page, on every screen', () => {
  // THE FINDING THAT PICKED THE RULE. A fixed twelve lines was 63% of a 13 inch
  // page and left 6.9 lines of the agent's message, which was rejected.
  // The share resolves to 6 / 9 / 12 lines on the three real panes, so the page
  // keeps three fifths whatever the machine.
  const cases = [
    { name: 'a 13 inch at her zoom', paneHeight: 568, lines: 6, ceiling: 162 },
    { name: 'her own window', paneHeight: 718, lines: 9, ceiling: 234 },
    { name: 'a 16 inch', paneHeight: 931, lines: 12, ceiling: 306 },
  ];
  for (const c of cases) {
    it(`stops at ${c.lines} lines on ${c.name}`, () => {
      const m = metrics({ paneHeight: c.paneHeight });
      expect(dockCapLines(m)).toBe(c.lines);
      // The pixel the app was measured drawing, so a change to the padding or
      // the line height cannot quietly move her ceiling.
      expect(dockCeiling(m)).toBe(c.ceiling);
    });
  }

  it('keeps the whole card inside her share, furniture included', () => {
    for (const c of cases) {
      const m = metrics({ paneHeight: c.paneHeight, scrollHeight: needs(40) });
      const card = dockHeight(m) + m.chromeHeight;
      expect(card).toBeLessThanOrEqual(m.paneHeight * DOCK_SHARE_OF_PANE);
    }
  });

  it('holds the ceiling against a reply of any length', () => {
    const m = metrics({ scrollHeight: needs(400) });
    expect(dockHeight(m)).toBe(dockCeiling(m));
    expect(dockScrolls(m)).toBe(true);
  });

  // The furniture spends the same 40%: pasting a screenshot adds an attachment
  // row, and the text has to give up the lines it takes, or the card walks past
  // her share while looking like it obeyed.
  it('gives up lines when the card grows other furniture', () => {
    const bare = dockCapLines(metrics());
    const withAttachments = dockCapLines(metrics({ chromeHeight: 41 + 78 }));
    expect(withAttachments).toBeLessThan(bare);
    const m = metrics({ chromeHeight: 41 + 78, scrollHeight: needs(40) });
    expect(dockHeight(m) + m.chromeHeight).toBeLessThanOrEqual(m.paneHeight * DOCK_SHARE_OF_PANE);
  });

  // Whole lines of text. The 6px of bottom padding still shows a sliver of the
  // next line when she is past the ceiling, which is the cue that there is more
  // below (see dock-height.ts); what this pins is that the ceiling itself is
  // never a fraction of a line.
  it('stops on a whole line, never halfway through one', () => {
    const m = metrics({ paneHeight: 703 });
    const lines = (dockCeiling(m) - m.padY) / m.lineHeight;
    expect(lines).toBeCloseTo(Math.round(lines), 6);
  });
});

describe('the two ways the measurement can be wrong', () => {
  // A pane of nothing is a pane that has not been laid out. Falling back to the
  // floor keeps today's behaviour, which is safe; capping at zero lines would
  // draw a box she cannot type into.
  it('falls back to the resting box when the pane cannot be measured', () => {
    expect(dockCapLines(metrics({ paneHeight: 0 }))).toBe(DOCK_MIN_LINES);
    expect(dockHeight(metrics({ paneHeight: 0, scrollHeight: needs(20) }))).toBe(92);
  });

  it('survives a non-numeric measurement', () => {
    expect(dockCapLines(metrics({ paneHeight: NaN }))).toBe(DOCK_MIN_LINES);
    expect(dockHeight(metrics({ paneHeight: NaN, scrollHeight: needs(20) }))).toBe(92);
  });

  // On a window too short for three lines the floor wins, because a box
  // SMALLER than today's is the opposite of the point.
  it('keeps the floor on a window too short to honour the share', () => {
    const m = metrics({ paneHeight: 200, scrollHeight: needs(20) });
    expect(dockCapLines(m)).toBe(DOCK_MIN_LINES);
    expect(dockHeight(m)).toBe(92);
  });
});
