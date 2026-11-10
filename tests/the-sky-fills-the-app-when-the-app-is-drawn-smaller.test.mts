// THE SKY FILLS THE APP WHEN THE APP IS DRAWN SMALLER (w-fbe5e95dea, 2026-11-09).
//
// The first-run setup shows the real app beside its steps, scaled to 0.8 with
// a CSS transform. Home's sky measured the window with getBoundingClientRect,
// which returns the scaled size, and then sized itself in the window's own
// unscaled pixels: in a screenshot of the setup the sky stopped at about 80%
// of the window's width and height, a hard edge across the middle of Home.
// The layout size (offsetWidth/offsetHeight) is the same scaled or not.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/home/SkyBackdrop.tsx'), 'utf8');

it('sizes the sky from the window as laid out, not as drawn on screen', () => {
  expect(src).toMatch(/host\.offsetWidth/);
  expect(src).toMatch(/host\.offsetHeight/);
});
it('does not take its size from the scaled box', () => {
  expect(src).not.toMatch(/getBoundingClientRect\(\)/);
});
