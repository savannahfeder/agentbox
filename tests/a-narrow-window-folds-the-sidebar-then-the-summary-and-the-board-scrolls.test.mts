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
// narrow now. The summary half went with the side summary (w-d143fcb40a).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('the app is wired to it', () => {
  const app = read('App.tsx');
  const focus = read('components/Focus.tsx');
  it('no longer folds the sidebar by the window width', () => {
    expect(app).not.toMatch(/sidebarFits\(|useWindowWidth\(/);
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
