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
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SIDEBAR_FOLDS_BELOW, SUMMARY_NEEDS, sidebarFits, summaryFits, shownWithRoom, nextWithRoom } from '../renderer/src/room.ts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('the sidebar folds first', () => {
  it('folds below its width and not at or above it', () => {
    expect(sidebarFits(SIDEBAR_FOLDS_BELOW - 1)).toBe(false);
    expect(sidebarFits(SIDEBAR_FOLDS_BELOW)).toBe(true);
    expect(sidebarFits(1440)).toBe(true);
  });
  it('folds in the window from the report, about 970 points wide', () => {
    expect(sidebarFits(971)).toBe(false);
  });
});

describe('the summary folds only when the folded sidebar was not enough', () => {
  // The summary asks the thread's own pane, so a sidebar you held open counts.
  it('stays open beside a pane wide enough for it and a readable conversation', () => {
    expect(summaryFits(SUMMARY_NEEDS)).toBe(true);
    expect(summaryFits(SUMMARY_NEEDS - 1)).toBe(false);
  });
  it('leaves at least 520 points of conversation when it is open', () => {
    expect(SUMMARY_NEEDS - 352).toBeGreaterThanOrEqual(520);
  });
  // The order matters: widening the window must never open the sidebar and
  // close the summary in the same step. At the width the sidebar comes back,
  // the pane it leaves (window less the open sidebar's 246 and the frame's 22)
  // still has room for the summary.
  it('is never closed by the sidebar coming back', () => {
    expect(summaryFits(SIDEBAR_FOLDS_BELOW - 246 - 22 - 2)).toBe(true);
  });
  it('is closed in the window from the report once the sidebar has folded', () => {
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
  it('folds the sidebar by the window width, through the one toggle', () => {
    expect(app).toMatch(/sidebarFits\(/);
    expect(app).toMatch(/useRoomyToggle\(/);
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
