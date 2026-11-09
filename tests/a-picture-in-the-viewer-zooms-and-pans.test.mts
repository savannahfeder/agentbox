// A PICTURE IN THE VIEWER ZOOMS AND PANS.
//
// Sofia wanted to pin one radio button on a full-page screenshot and
// could not get closer than the fitted size; Figma and Frame.io zoom. Measured
// in ArtifactStage: the picture was drawn at `fitScale` and nothing else, with
// no zoom state at all.
//
// Zoom is counted from the fitted size, as the lightbox counts it. The point
// under the pointer stays under it, and the label says the real-pixel percent.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { keepUnder, nextZoom, wheelZoom, zoomWords } from '../renderer/src/artifact-pins.ts';
import { MAX_ZOOM } from '../renderer/src/picture-view';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the zoom buttons', () => {
  it('step up through the stops from fitted', () => {
    expect(nextZoom(1, 1)).toBe(1.5);
    expect(nextZoom(1.5, 1)).toBe(2);
  });
  it('step down to fitted and no further', () => {
    expect(nextZoom(2, -1)).toBe(1.5);
    expect(nextZoom(1.5, -1)).toBe(1);
    expect(nextZoom(1, -1)).toBe(1);
  });
  it('land on a stop from between two', () => {
    expect(nextZoom(1.7, 1)).toBe(2);
    expect(nextZoom(1.7, -1)).toBe(1.5);
  });
  it('stop at the most', () => {
    expect(nextZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
  });
});

describe('a pinch or a ctrl wheel', () => {
  it('zooms in for a wheel up and out for a wheel down', () => {
    expect(wheelZoom(1, -50)).toBeGreaterThan(1);
    expect(wheelZoom(2, 50)).toBeLessThan(2);
  });
  it('never goes below fitted or past the most', () => {
    expect(wheelZoom(1, 500)).toBe(1);
    expect(wheelZoom(MAX_ZOOM, -500)).toBe(MAX_ZOOM);
  });
});

describe('the point under the pointer', () => {
  it('stays under it as the picture grows', () => {
    // Pointer at 300 px across the box, on the middle of a 600 px picture that now draws at 1200.
    const to = keepUnder({ fx: 0.5, fy: 0.5 }, { x: 300, y: 200 }, { left: 0, top: 0 }, { w: 1200, h: 800 });
    expect(to).toEqual({ left: 300, top: 200 });
  });
  it('never asks for a scroll before the start', () => {
    expect(keepUnder({ fx: 0, fy: 0 }, { x: 300, y: 200 }, { left: 0, top: 0 }, { w: 1200, h: 800 })).toEqual({ left: 0, top: 0 });
  });
});

describe('the words', () => {
  it('say the real-pixel size', () => {
    expect(zoomWords(0.5, 1)).toBe('50%');
    expect(zoomWords(0.5, 2)).toBe('100%');
  });
});

describe('the wiring', () => {
  const stage = read('renderer/src/components/ArtifactStage.tsx');
  it('zooms the picture, with buttons, a pinch and a ctrl wheel, and pans it by dragging', () => {
    expect(stage).toMatch(/nextZoom\(/);
    expect(stage).toMatch(/wheelZoom\(/);
    expect(stage).toMatch(/e\.ctrlKey \|\| e\.metaKey/);
    expect(stage).toContain('av-zoom');
    expect(stage).toMatch(/dragged/);
  });
  it('a drag that pans does not drop a pin', () => {
    expect(stage).toMatch(/if \(dragged\.current\)/);
  });
});
