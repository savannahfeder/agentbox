// THE TWO THINGS AT THE RIGHT OF A TASK'S BAR SHARE ONE EDGE —, 2026-09-20.
//
// MEASURED IN THE RUNNING APP AT 1440 BEFORE THIS: the control cluster sat at
// 1276..1398 and the byline's figures ended at 1276. Exactly 1276, touching,
// with no gap at all, one row lower, and overlapping vertically by 11px. That is
// because `.workspace-task-header` and `.topbar-right` are flex siblings, so the
// header's right edge simply IS wherever the buttons start.
//
// AFTER: figures 1251..1398 at y 90..108, rightmost icon 1364..1398 at y 54..88.
// Same right edge, no overlap.
//
// HER AUGUST PICK IS NOT REOPENED BY THIS. The figures are still "the
// right-hand end of the byline, plain", which is the thing she approved. This
// is that right-hand end finally being an edge rather than wherever the buttons
// happened to stop.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../renderer/src/workspace-navigation.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const at = css.indexOf(sel);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at) + 1);
};

it('takes the corner controls out of the row so the byline can reach the edge', () => {
  const r = rule('.workspace-layout.workspace-task > .topbar > .topbar-right');
  expect(r).toMatch(/position:\s*absolute/);
  expect(r).toMatch(/right:\s*20px/);
  // The title row, not the middle of the bar, so they clear the byline under them.
  expect(r).toMatch(/top:\s*14px/);
});

it('has a positioned parent for that corner to sit in', () => {
  // Already true where the bar is first declared, which is why the task rule
  // below it does not repeat it. Held here so a tidy-up of that line cannot
  // quietly drop the figures into the top left of the window.
  expect(rule('.workspace-layout > .topbar {')).toMatch(/position:\s*relative/);
});

it('makes only the title pay for the icons, not the byline', () => {
  // The byline passes under them; if it paid too, the figures would stop short
  // of the edge again and nothing would line up.
  // THE NUMBER FOLLOWS WHAT IS IN THE CORNER, and what is in it changed on
  // 2026-09-27 (w-581dbc6cc4): the plus and the ⌘ came off a task's corner on
  // her word, and the Done mark went on. Measured in the built app, that
  // cluster is 81 wide, and 18 of air on top is the same 18 it always kept.
  // AND AGAIN on 2026-10-01 (w-e731ca9376): the corner is the Summary button
  // and the thread's three-dot menu, 161 wide in the built app, plus the 18.
  // What this test is for is that only the TITLE reserves it.
  const title = rule('.workspace-layout.workspace-task .workspace-task-header .keep-line-title');
  expect(title).toMatch(/padding-right:\s*179px/);
  expect(rule('.workspace-task-header .byline')).not.toMatch(/padding-right/);
});
