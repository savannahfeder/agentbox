// ZOOMING KEEPS THE PICKED PIN IN VIEW.
//
// Sofia zoomed a 78%-fit picture with her pin near its left edge and the pin
// left the screen. Measured in the browser copy: a pin at 150 px from the left
// of an 1100 px view was at -50 px after one press of Zoom in and at -650 px
// after three, because the buttons zoom about the middle of the view. Zooming
// now holds the picked pin (or the one being placed) where it is on screen, or
// brings it to the middle when it is out of view; with no pin picked, the
// middle stays put as before.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { zoomAnchor, keepUnder } from '../renderer/src/artifact-pins.ts';

const view = { w: 1100, h: 856 };
const pic = { left: 52, top: 117, w: 996, h: 623 };
// Where the spot lands on screen after zooming by `by`, as the stage scrolls.
const after = (a, by) => {
  const size = { w: pic.w * by, h: pic.h * by };
  const offset = { left: 52, top: 24 };
  const scroll = keepUnder(a, a, offset, size);
  return { x: offset.left + a.fx * size.w - scroll.left, y: offset.top + a.fy * size.h - scroll.top };
};

describe('zooming with the buttons', () => {
  it('keeps a picked pin near the left edge where it is', () => {
    const a = zoomAnchor({ x: 0.1, y: 0.2 }, view, pic);
    expect(a.x).toBeCloseTo(52 + 0.1 * 996);
    const at = after(a, 2);
    expect(at.x).toBeGreaterThan(0);
    expect(at.x).toBeLessThan(view.w);
  });
  it('brings a picked pin that is out of view to the middle', () => {
    const a = zoomAnchor({ x: 0.1, y: 0.5 }, view, { left: -1500, top: -200, w: 2000, h: 1250 });
    expect(a).toMatchObject({ fx: 0.1, fy: 0.5, x: 550, y: 428 });
  });
  it('keeps the middle of the view still with no pin picked', () => {
    const a = zoomAnchor(null, view, pic);
    expect(a.x).toBe(550);
    expect(a.y).toBe(428);
    expect(a.fx).toBeCloseTo((550 - 52) / 996);
  });
});

it('the stage zooms about the picked or placed pin', () => {
  const stage = fs.readFileSync(new URL('../renderer/src/components/ArtifactStage.tsx', import.meta.url), 'utf8');
  expect(stage).toMatch(/zoomAnchor\(/);
  expect(stage).toMatch(/draft\?\.kind === 'pin'/);
});
