// A PIN'S LABEL KEEPS ITS SIDE WHEN THE PICTURE ZOOMS.
//
// Measured in a live copy: a pin at 97% across, with the picture at 62%, had its
// ring on the spot and its label 30 px to the left. Zoomed to 125% the ring was
// still on 0.9719 but the label had jumped 38 px to the right of it, because the
// side was worked out from the zoomed size, where there was room again. So the
// label moved around its spot as you zoomed. A wheel or pinch crosses that line
// at any zoom, so it flipped mid-gesture too.
//
// Now the side is worked out once, from the picture as fitted to the window.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pinLean, PIN_REACH } from '../renderer/src/artifact-pins.ts';

const stage = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactStage.tsx'), 'utf8');
// Every pin is drawn by PinMarks, handed the fitted size by each stage.
const marks = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/PinMarks.tsx'), 'utf8');
const fitted = { w: 996, h: 623 };

describe('the side of a label near the edge', () => {
  it('is the one it takes at fit, whatever the zoom', () => {
    expect(pinLean({ x: 0.9719, y: 0.5 }, fitted)).toBe('nw');
  });
  it('is the usual side once there is room at fit', () => {
    expect(pinLean({ x: 1 - (PIN_REACH + 1) / fitted.w, y: 0.5 }, fitted)).toBe('ne');
  });
  it('a pin in the middle leans the same way at any size', () => {
    expect(pinLean({ x: 0.5, y: 0.5 }, fitted)).toBe('ne');
    expect(pinLean({ x: 0.5, y: 0.5 }, { w: fitted.w * 4, h: fitted.h * 4 })).toBe('ne');
  });
});

describe('the stage', () => {
  it('leans by the fitted size, not the zoomed one', () => {
    expect(stage).toMatch(/const atFit = \{ w: natural\.w \* fit, h: natural\.h \* fit \}/);
    expect(stage).toMatch(/size=\{atFit\}/);
    expect(marks).toMatch(/pinLean\(\{ x, y \}, size\)/);
    expect(stage).not.toMatch(/size=\{shown\}/);
  });
  it('places a pin by its fraction of the picture, which is what keeps it on its spot', () => {
    expect(marks).toMatch(/left: `\$\{p\.x \* 100\}%`, top: `\$\{p\.y \* 100\}%`/);
  });
});
