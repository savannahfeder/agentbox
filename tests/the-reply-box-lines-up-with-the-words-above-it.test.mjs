// The reply box lines up with the words above it, on both edges.
//
// What broke (w-a9b77c7b57, 2026-10-02): "it should match the left and right
// edges of the text above it, but right now it stops slightly inward". Measured
// off the pasted shot at 2x: the words began at x=59 and the box's border at
// x=70, 11 pixels, so 5.5 points. The box was 1832 pixels wide, exactly the 916
// points the balanced reading width gives it, so the numbers were right and the
// two were centred on different things.
//
// The words live inside `.focus-scroll`, which scrolls. Its scrollbar takes
// layout room (about 11 points, `scrollbar-width: thin`), so the sheet centres
// in the pane MINUS the scrollbar and lands half a scrollbar to the left. The
// dock sits outside the scroll and centred in the whole pane. Half of 11 is
// the 5.5 measured.
//
// The fix measures the scrollbar (`offsetWidth - clientWidth`) and hands it to
// the dock as `--scroll-gutter`, added to the dock's RIGHT padding only, so the
// dock centres in the same width the words do. A system that overlays its
// scrollbars measures 0 and nothing moves.
//
// Asserted against the stylesheet and with a stand-in element, because this
// repo has no DOM test environment (see the-panel-is-the-wall.test.mjs).

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrollGutter, watchScrollGutter } from '../renderer/src/scroll-gutter';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'renderer/src/workspace-navigation.css'), 'utf8');
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');

const rule = (sheet, selector) => {
  const i = sheet.indexOf(`\n${selector} {`);
  expect(i, `no rule for ${selector}`).toBeGreaterThan(-1);
  return sheet.slice(i, sheet.indexOf('}', i));
};

// Where the words and the box begin and end, from the pane's left edge, using
// the same arithmetic the browser does: an auto-margined sheet of at most
// `sheet` points, centred in what the scrollbar leaves, with `pad` inside it;
// and the dock's inner column of at most `sheet - 2 * pad`, centred inside the
// dock's padding.
const edges = ({ pane, sheet, pad, scrollbar, dockLeft, dockRight }) => {
  const room = pane - scrollbar;
  const sheetW = Math.min(sheet, room);
  const wordsLeft = (room - sheetW) / 2 + pad;
  const words = [wordsLeft, wordsLeft + sheetW - 2 * pad];
  const dockRoom = pane - dockLeft - dockRight;
  const boxW = Math.min(sheet - 2 * pad, dockRoom);
  const boxLeft = dockLeft + (dockRoom - boxW) / 2;
  return { words, box: [boxLeft, boxLeft + boxW] };
};

describe('the scrollbar is measured', () => {
  it('reads a thin classic scrollbar as its width', () => {
    expect(scrollGutter({ offsetWidth: 1000, clientWidth: 989 })).toBe(11);
  });

  it('reads an overlay scrollbar, or none, as zero', () => {
    expect(scrollGutter({ offsetWidth: 1000, clientWidth: 1000 })).toBe(0);
  });

  it('never hands back a negative gutter', () => {
    // A fractional width can round the client width up past the box.
    expect(scrollGutter({ offsetWidth: 1000, clientWidth: 1001 })).toBe(0);
  });
});

describe('the pane is told, and told again when it changes', () => {
  const setup = () => {
    const observers = [];
    globalThis.ResizeObserver = class {
      constructor(cb) { this.cb = cb; this.disconnect = vi.fn(); observers.push(this); }
      observe(el) { this.el = el; }
    };
    const set = vi.fn();
    const pane = { style: { setProperty: set } };
    const scroller = { offsetWidth: 1000, clientWidth: 989, parentElement: pane };
    return { observers, set, scroller };
  };

  it('writes the gutter onto the pane as soon as it is watched', () => {
    const { set, scroller } = setup();
    watchScrollGutter(scroller);
    expect(set).toHaveBeenLastCalledWith('--scroll-gutter', '11px');
  });

  it('writes it again when the scrollbar comes or goes', () => {
    const { observers, set, scroller } = setup();
    watchScrollGutter(scroller);
    expect(observers[0].el).toBe(scroller);
    scroller.clientWidth = 1000;
    observers[0].cb();
    expect(set).toHaveBeenLastCalledWith('--scroll-gutter', '0px');
  });

  it('lets go when the task closes', () => {
    const { observers, scroller } = setup();
    const stop = watchScrollGutter(scroller);
    stop();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('is wired to the scrolling box in the opened task', () => {
    expect(focus).toMatch(/watchScrollGutter\(scrollRef\.current\)/);
  });
});

describe('the box starts and ends where the words do', () => {
  const dock = rule(css, '.focus-dock');
  const pad = Number(rule(css, '.focus').match(/padding:\s*\d+px (\d+)px/)[1]);

  it('adds the gutter to the right of the dock and nowhere else', () => {
    expect(dock).toMatch(/padding-right:\s*calc\(32px \+ var\(--scroll-gutter, 0px\)\)/);
    // The case that must not match: on the left there is no scrollbar, and a
    // gutter there would push the box in by the same amount from the other side.
    expect(dock).not.toMatch(/padding-left:[^;]*scroll-gutter/);
  });

  for (const [what, pane, sheet] of [
    ['the balanced width in a wide window (the shot)', 1441, 980],
    ['the default sheet in a wide window', 1441, 780],
    ['a window narrower than the sheet', 700, 980],
  ]) {
    for (const scrollbar of [11, 0]) {
      it(`${what}, scrollbar ${scrollbar}`, () => {
        const { words, box } = edges({ pane, sheet, pad, scrollbar, dockLeft: 32, dockRight: 32 + scrollbar });
        expect(box[0]).toBeCloseTo(words[0], 5);
        expect(box[1]).toBeCloseTo(words[1], 5);
      });
    }
  }

  it('was 5.5 points off before, which is what the shot showed', () => {
    const { words, box } = edges({ pane: 1441, sheet: 980, pad, scrollbar: 11, dockLeft: 32, dockRight: 32 });
    expect(box[0] - words[0]).toBeCloseTo(5.5, 5);
  });
});

describe('the reading layouts that pad the words differently pad the box the same', () => {
  it('beside a document, the words keep 28 and so does the box', () => {
    expect(nav).toMatch(/\[data-artifact-layout="beside"\] \.focus \{ padding:28px 28px 40px; \}/);
    expect(nav).toMatch(/\[data-artifact-layout="beside"\] \.focus-dock \{ padding-left:28px; padding-right:calc\(28px \+ var\(--scroll-gutter, 0px\)\); \}/);
  });

  it('edge to edge, the words keep 20 and so does the box, with no margin stacked on the dock padding', () => {
    expect(nav).toMatch(/\[data-reading-width="edge"\] \.focus \{ max-width:none; padding-left:20px; padding-right:20px; \}/);
    expect(nav).toMatch(/\[data-reading-width="edge"\] \.focus-dock \{ padding-left:20px; padding-right:calc\(20px \+ var\(--scroll-gutter, 0px\)\); \}/);
    expect(nav).toMatch(/\[data-reading-width="edge"\] \.focus-dock-inner \{ max-width:none; \}/);
  });
});
