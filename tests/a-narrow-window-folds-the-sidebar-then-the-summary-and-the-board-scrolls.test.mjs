// A NARROW WINDOW FOLDS THE SIDEBAR, THEN THE SUMMARY, AND THE BOARD SCROLLS
// SIDEWAYS (w-df42206cea, 2026-10-05).
//
// What broke: in a window about 970 points wide the board squeezed its four
// columns to about 138 points each, so every title broke onto three or four
// lines. Asked for: "shows less of the columns by default and lets you scroll
// to see more just like Linear, Notion and all other tables". On a thread in
// the same window the sidebar (246 points) and the summary (352) left the
// conversation about 360 points. Asked for: the summary closed by default when
// the screen is too narrow, "but you can reopen it", and "maybe better to
// close left sidebar first".
//
// Measured before the change: `.th-board` was `repeat(4, minmax(0, 1fr))`,
// which has no floor, and nothing in the app read the window's width at all;
// the only fold was a CSS rule at 700px that hid the sidebar's words.
//
// THE SIDEBAR HALF WENT ON 2026-10-26 (w-a1ed0e8b25): the sidebar is always
// narrow now, so there is nothing of it to fold, and only the summary folds.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as room from '../renderer/src/room.ts';

const { SUMMARY_NEEDS, summaryFits, shownWithRoom, nextWithRoom } = room;
const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('the sidebar has nothing to fold', () => {
  it('keeps no window width for it', () => {
    expect(room.sidebarFits).toBeUndefined();
    expect(room.SIDEBAR_FOLDS_BELOW).toBeUndefined();
  });
});

describe('the summary folds when the thread pane has no room for it', () => {
  it('stays open beside a pane wide enough for it and a readable conversation', () => {
    expect(summaryFits(SUMMARY_NEEDS)).toBe(true);
    expect(summaryFits(SUMMARY_NEEDS - 1)).toBe(false);
  });
  it('leaves at least 520 points of conversation when it is open', () => {
    expect(SUMMARY_NEEDS - 352).toBeGreaterThanOrEqual(520);
  });
  it('is closed in the window from the report, beside the narrow sidebar', () => {
    // 971 less the folded sidebar's 82 and the frame's 22.
    expect(summaryFits(971 - 82 - 22)).toBe(false);
  });
});

describe('a fold the app made is not your choice, and your click wins', () => {
  it('shows your choice while there is room', () => {
    expect(shownWithRoom({ choice: true, fits: true, override: null })).toBe(true);
    expect(shownWithRoom({ choice: false, fits: true, override: null })).toBe(false);
  });
  it('folds without room, whatever you chose', () => {
    expect(shownWithRoom({ choice: true, fits: false, override: null })).toBe(false);
  });
  it('never opens something you closed just because there is room', () => {
    expect(shownWithRoom({ choice: false, fits: false, override: null })).toBe(false);
  });
  it('reopens when you ask, even without room', () => {
    expect(shownWithRoom({ choice: true, fits: false, override: true })).toBe(true);
  });

  it('a click with room changes what is remembered', () => {
    expect(nextWithRoom({ choice: true, fits: true, override: null })).toEqual({ choice: false, override: null });
    expect(nextWithRoom({ choice: false, fits: true, override: null })).toEqual({ choice: true, override: null });
  });
  it('a click without room is for now only, and is not remembered', () => {
    expect(nextWithRoom({ choice: true, fits: false, override: null })).toEqual({ choice: true, override: true });
    expect(nextWithRoom({ choice: true, fits: false, override: true })).toEqual({ choice: true, override: false });
  });
});

describe('the app is wired to it', () => {
  const app = read('App.tsx');
  const focus = read('components/Focus.tsx');
  const summary = read('threads/Summary.tsx');
  it('no longer folds the sidebar by the window width', () => {
    expect(app).not.toMatch(/sidebarFits\(|useWindowWidth\(/);
  });
  it('folds the summary by the thread pane width', () => {
    expect(summary).toMatch(/summaryFits\(/);
    expect(focus).toMatch(/useSummaryOpen\(paneWidth\)/);
  });
  it('keeps the literal the way-out guard looks for', () => {
    expect(focus).toContain('className="focus-pane"');
  });
});

describe('the board keeps its columns readable and scrolls sideways', () => {
  const css = read('threads/pages.css');
  const rule = css.match(/\.th-board \{[^}]*\}/)?.[0] ?? '';
  it('gives every column a floor rather than squeezing it to nothing', () => {
    expect(rule).not.toMatch(/minmax\(0,/);
    expect(rule).toMatch(/minmax\(2[4-9]\dpx, 1fr\)/);
  });
  it('draws as wide as its columns need, so the list around it scrolls', () => {
    expect(rule).toMatch(/width: fit-content/);
    expect(rule).toMatch(/min-width: 100%/);
  });
});
