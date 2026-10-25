// A WINDOW TILED TO HALF A SCREEN FITS, AND WHAT IS IN IT STILL READS (w-78f26467bb).
//
// What broke: tiled into the right half of a 1710-point screen, the window
// would not go under its 980-point floor, so 125 points of it hung off the
// screen's edge. At 980 the thread's pane is 876 wide, which the summary took
// as room (352 + 520 = 872) although the Groups layout draws it 368 wide, so
// the summary stayed open and the conversation ran off the screen mid-word.
// Measured on the built renderer at 855 and 720: below 980 nothing overflows
// the window, but the inbox's table kept Status, Project, Priority and Sent at
// full width and cut every title to about ten letters, and a summary opened by
// hand squeezed the conversation to 383 points beside it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SUMMARY_NEEDS, summaryFits, summaryPlace } from '../renderer/src/room.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the window can be half of a laptop screen', () => {
  const floor = Number(read('main/main.mjs').match(/minWidth: (\d+)/)[1]);
  it('goes as narrow as half of a 1440-point screen', () => {
    expect(floor).toBeLessThanOrEqual(720);
  });
  // Under 700 the renderer draws the phone layout (phone.css), which is for touch.
  it('never as narrow as the phone layout', () => {
    expect(floor).toBeGreaterThan(700);
  });
});

describe('the summary needs room for its widest panel', () => {
  it('folds in the reported window, 980 less the folded sidebar and the frame', () => {
    expect(summaryFits(980 - 82 - 22)).toBe(false);
  });
  it('leaves 520 points of conversation beside the Groups panel, 368 wide', () => {
    expect(SUMMARY_NEEDS - 368).toBeGreaterThanOrEqual(520);
    expect(summaryFits(SUMMARY_NEEDS)).toBe(true);
  });
});

describe('a summary opened without room lies over the conversation', () => {
  it('sits beside the conversation when there is room', () => {
    expect(summaryPlace({ offered: true, shown: true, fits: true })).toBe('open');
  });
  it('lies over it when there is not', () => {
    expect(summaryPlace({ offered: true, shown: true, fits: false })).toBe('over');
  });
  it('is the rail when closed, whatever the room', () => {
    expect(summaryPlace({ offered: true, shown: false, fits: true })).toBe('rail');
    expect(summaryPlace({ offered: true, shown: false, fits: false })).toBe('rail');
  });
  it('is nothing on a thread with no summary', () => {
    expect(summaryPlace({ offered: false, shown: false, fits: true })).toBeUndefined();
  });

  const css = read('renderer/src/threads/summary.css');
  it('leaves the conversation at the rail width under it', () => {
    expect(css).toMatch(/\.focus-pane\[data-summary="over"\] > \.focus-scroll[\s\S]*?margin-right: var\(--ts-rail-w\)/);
  });
  it('is drawn on a fill, so the words under it do not show through', () => {
    const rule = css.match(/\.focus-pane\[data-summary="over"\] \.ts-panel \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background: var\(--/);
  });
  it('is wired into the pane', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/data-summary=\{summaryPlace\(/);
  });
});

describe('the inbox table gives up columns before it gives up titles', () => {
  const css = read('renderer/src/threads/pages.css');
  it('measures the table, not the window', () => {
    expect(css).toMatch(/\.th-table \{ container: th \/ inline-size; \}/);
  });
  // The list's rows sit 76 points inside it, measured in the built renderer
  // (list 751, grid 675 at a 855 window), and the narrowest window's list is 616.
  const INSET = 76;
  const NARROWEST_LIST = 616;
  const steps = [...css.matchAll(/@container th \(max-width: (\d+)px\) \{([\s\S]*?)\n\}/g)].map((m) => ({ below: Number(m[1]), body: m[2] }));
  const fixed = (cols) => cols.match(/minmax\(0, 1fr\)((?: \d+px)+)/)[1].trim().split(' ').map((c) => parseInt(c, 10));
  const titleAt = (width, cols) => { const f = fixed(cols); return width - INSET - f.reduce((a, b) => a + b, 0) - 16 * f.length; };
  const full = css.match(/\.th-grid \{[^}]*grid-template-columns: ([^;]+);/)[1];
  it('drops Priority first, then Project', () => {
    expect(steps.length).toBe(2);
    expect(steps[0].below).toBeGreaterThan(steps[1].below);
    expect(steps[0].body).toMatch(/\.th-grid > \.th-col-prio \{ display: none; \}/);
    expect(steps[1].body).toMatch(/\.th-grid > \.th-col-proj \{ display: none; \}/);
  });
  it('keeps every column while the title still has 240 points', () => {
    expect(titleAt(steps[0].below + 1, full)).toBeGreaterThanOrEqual(240);
  });
  it('leaves the title 240 points or more just under each step', () => {
    for (const s of steps) {
      const cols = s.body.match(/\.th-grid \{ grid-template-columns: ([^;]+);/)[1];
      const next = steps.find((t) => t.below < s.below);
      expect(titleAt(next ? next.below + 1 : NARROWEST_LIST, cols)).toBeGreaterThanOrEqual(240);
    }
  });
  it('names the cells it hides, header and row alike', () => {
    const pages = read('renderer/src/threads/Pages.tsx');
    expect(pages).toMatch(/<div className="th-col-proj">Project<\/div>/);
    expect(pages).toMatch(/<div className="th-col-prio">Priority<\/div>/);
    expect(pages).toMatch(/className="th-cell-proj th-col-proj"/);
    expect(pages).toMatch(/className=\{`th-cell-prio th-col-prio/);
  });
});

describe('a group gives its chat the room first', () => {
  it('narrows the People panel with the page instead of holding it at 368', () => {
    const rule = read('renderer/src/team/rooms/rooms.css').match(/\.gr-side \{[^}]*\}/)[0];
    expect(rule).toMatch(/width: clamp\(\d+px, \d+%, 368px\)/);
  });
});
